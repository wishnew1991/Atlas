import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedActor } from "@/lib/atlas/server/auth";
import { getIntegration } from "@/lib/atlas/integrations/registry";
import {
  buildUserAuthorizeUrl,
  buildUserOauthStateCookie,
  createUserOauthFlow,
  resolveOAuthEndpoints,
  resolveUserOauthClientId,
  trustedOrigin,
  userOauthRedirectUri,
} from "@/lib/atlas/server/user-oauth";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  let actor;
  try {
    actor = await requireAuthenticatedActor();
  } catch {
    return NextResponse.redirect(`${trustedOrigin(request)}/sign-in`);
  }
  const { integrationId } = await params;

  const integration = await getIntegration(integrationId);
  if (!integration) {
    return NextResponse.json({ error: "Unknown service." }, { status: 404 });
  }
  if (!integration.enabled) {
    return NextResponse.json(
      { error: "This service is not available right now." },
      { status: 409 }
    );
  }

  const oauthMethod = integration.authMethods.find((m) => m.kind === "oauth2");
  if (!oauthMethod) {
    return NextResponse.json(
      { error: "This service doesn't support secure sign-in." },
      { status: 400 }
    );
  }

  const endpoints = resolveOAuthEndpoints(integrationId, oauthMethod);
  if (!endpoints) {
    return NextResponse.json(
      { error: "This service has no OAuth endpoints configured yet." },
      { status: 501 }
    );
  }

  const origin = trustedOrigin(request);
  const redirectUri = userOauthRedirectUri(origin, integrationId);

  const { verifier, challenge, state } = createUserOauthFlow();

  let clientId: string;
  try {
    clientId = await resolveUserOauthClientId(integrationId, redirectUri, endpoints);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Service sign-in setup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const authorizeUrl = buildUserAuthorizeUrl({
    authorizeUrl: endpoints.authorizeUrl,
    redirectUri,
    state,
    codeChallenge: challenge,
    clientId,
    scope: endpoints.scopes.join(" "),
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.headers.set(
    "Set-Cookie",
    buildUserOauthStateCookie({
      verifier,
      redirectUri,
      userId: actor.userId,
      integrationId,
      createdAt: Date.now(),
    })
  );

  return response;
}