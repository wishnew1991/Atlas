import { NextRequest, NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { getMcpServer, upsertMcpServer } from "@/lib/atlas/server/model-registry";
import {
  OAUTH_STATE_COOKIE,
  clearOauthStateCookie,
  decodePendingAuthorization,
  exchangeCodeForToken,
  getClientId,
} from "@/lib/atlas/server/mcp-oauth";


export async function GET(request: NextRequest) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      `${request.nextUrl.origin}/admin?mcp_oauth_error=${encodeURIComponent("Missing code or state.")}`
    );
  }

  const pending = decodePendingAuthorization(request.cookies.get(OAUTH_STATE_COOKIE)?.value);

  if (!pending) {
    return NextResponse.redirect(
      `${request.nextUrl.origin}/admin?mcp_oauth_error=${encodeURIComponent("Authorization session expired. Try connecting again.")}`
    );
  }

  const clientId = getClientId();

  try {
    const { accessToken } = await exchangeCodeForToken({
      redirectUri: pending.redirectUri,
      code,
      codeVerifier: pending.verifier,
      clientId,
    });

    if (pending.serverId) {
      const server = await getMcpServer(pending.serverId);

      if (server) {
        await upsertMcpServer({
          id: server.id,
          name: server.name,
          url: server.url ?? undefined,
          token: accessToken,
          domain: server.domain,
          args: server.args,
          env: server.env,
        });
      }
    }

    const response = NextResponse.redirect(`${request.nextUrl.origin}/admin?mcp_oauth_success=1`);
    response.headers.set("Set-Cookie", clearOauthStateCookie());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token exchange failed.";
    const response = NextResponse.redirect(
      `${request.nextUrl.origin}/admin?mcp_oauth_error=${encodeURIComponent(message)}`
    );
    response.headers.set("Set-Cookie", clearOauthStateCookie());
    return response;
  }
}
