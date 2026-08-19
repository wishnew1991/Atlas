import { NextRequest, NextResponse } from "next/server";

import { getIntegration, upsertUserConnection } from "@/lib/atlas/integrations/registry";
import { encryptSecret } from "@/lib/security/secrets";
import {
  USER_OAUTH_STATE_COOKIE,
  clearUserOauthStateCookie,
  decodePendingUserOAuth,
  exchangeUserOauthCode,
  resolveOAuthEndpoints,
  resolveUserOauthClientId,
  trustedOrigin,
} from "@/lib/atlas/server/user-oauth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const { integrationId } = await params;

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  const origin = trustedOrigin(request);

  const errorRedirect = (message: string) =>
    NextResponse.redirect(
      `${origin}/profile?connect_error=${encodeURIComponent(message)}`
    );

  if (!code || !state) {
    return errorRedirect("Missing code or state from the sign-in.");
  }

  const pending = decodePendingUserOAuth(request.cookies.get(USER_OAUTH_STATE_COOKIE)?.value);

  if (!pending) {
    return errorRedirect("Sign-in session expired. Try connecting again.");
  }
  if (pending.integrationId !== integrationId) {
    return errorRedirect("Sign-in session does not match this service.");
  }

  const integration = await getIntegration(integrationId);
  const oauthMethod = integration?.authMethods.find((m) => m.kind === "oauth2");
  const endpoints = resolveOAuthEndpoints(integrationId, oauthMethod);

  if (!endpoints) {
    return errorRedirect("This service has no OAuth endpoints configured.");
  }

  let clientId: string;
  try {
    clientId = await resolveUserOauthClientId(integrationId, pending.redirectUri, endpoints);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Service setup failed.";
    return errorRedirect(message);
  }

  try {
    const { accessToken, refreshToken, expiresIn } = await exchangeUserOauthCode({
      tokenUrl: endpoints.tokenUrl,
      redirectUri: pending.redirectUri,
      code,
      codeVerifier: pending.verifier,
      clientId,
      clientSecret: endpoints.clientSecret,
    });

    const stored = encryptSecret(accessToken, `UserConnection ${integrationId} OAuth token`);
    const storedRefresh = refreshToken
      ? encryptSecret(refreshToken, `UserConnection ${integrationId} OAuth refresh token`)
      : undefined;

    await upsertUserConnection({
      userId: pending.userId,
      integrationId,
      oauthToken: stored,
      oauthRefresh: storedRefresh,
      tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    });

    const response = NextResponse.redirect(`${origin}/profile?connect_success=1`);
    response.headers.set("Set-Cookie", clearUserOauthStateCookie());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token exchange failed.";
    const response = errorRedirect(message);
    response.headers.set("Set-Cookie", clearUserOauthStateCookie());
    return response;
  }
}