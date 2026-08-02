import { NextRequest, NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { listMcpServers } from "@/lib/atlas/server/model-registry";
import {
  buildAuthorizeUrl,
  buildOauthStateCookie,
  defaultRedirectUri,
  generatePkce,
  generateState,
  registerClient,
} from "@/lib/atlas/server/mcp-oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const serverId = request.nextUrl.searchParams.get("serverId") ?? undefined;
  const origin = request.nextUrl.origin;
  const redirectUri = defaultRedirectUri(origin);
  const scope = process.env.SWIGGY_MCP_SCOPE || "mcp:tools mcp:resources mcp:prompts";

  if (serverId) {
    const servers = await listMcpServers();
    const exists = servers.some((server) => server.id === serverId);

    if (!exists) {
      return NextResponse.json({ error: "MCP server not found." }, { status: 404 });
    }
  }

  const { verifier, challenge } = generatePkce();
  const state = generateState();

  let clientId: string;

  try {
    clientId = await registerClient(redirectUri, scope);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Swiggy client registration failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const authorizeUrl = buildAuthorizeUrl({
    redirectUri,
    state,
    codeChallenge: challenge,
    clientId,
    scope,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.headers.set(
    "Set-Cookie",
    buildOauthStateCookie({
      verifier,
      redirectUri,
      serverId,
      createdAt: Date.now(),
    })
  );

  return response;
}
