import { NextResponse } from "next/server";

import { getAtlasActor } from "@/lib/atlas/server/auth";
import {
  getIntegration,
  upsertUserConnection,
} from "@/lib/atlas/integrations/registry";
import { encryptSecret } from "@/lib/security/secrets";
import { checkRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";
export const runtime = "edge";


export async function POST(
  request: Request,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const actor = await getAtlasActor();
  if (!actor.isAuthenticated) {
    return NextResponse.json({ error: "Sign in to connect services." }, { status: 401 });
  }

  const { allowed, remaining, resetTime } = checkRateLimit(actor.userId, {
    windowMs: 60 * 1000,
    maxRequests: 5,
  });
  if (!allowed) {
    const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
    return NextResponse.json(
      { error: `Too many connect attempts. Try again in ${retryAfter}s.` },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": "5",
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(resetTime),
        },
      }
    );
  }

  const { integrationId } = await params;

  const integration = await getIntegration(integrationId);
  if (!integration) {
    return NextResponse.json({ error: "Unknown service." }, { status: 404 });
  }
  if (!integration.enabled) {
    return NextResponse.json({ error: "This service is not available right now." }, { status: 409 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;

  const requiresApiKey = integration.authMethods.some((m) => m.kind === "api_key");
  const supportsOAuth = integration.authMethods.some((m) => m.kind === "oauth2");
  const isBrowser = integration.transport === "browser";

  if (isBrowser) {
    const { gatewayCall } = await import("@/lib/atlas/gateway/gateway");
    
    // Trigger the login handoff tool via the universal gateway
    const result = await gatewayCall(integration.id as import("@/lib/atlas/agent-contract").AtlasActionDomain, "execute", { 
      requestedTool: `${integration.id}_login_handoff`,
      userId: actor.userId 
    });

    // The mock currently returns JSON stringified resultData in `message` or `data` 
    // Let's assume the string itself contains the URL if it starts with http
    let handoffUrl = `https://mock-handoff.${integration.id}.com/login?session=${actor.userId}`;
    
    if (result && result.message && result.message.includes("http")) {
       // Extract URL from the MCP tool output if possible, otherwise use fallback
       const match = result.message.match(/https?:\/\/[^\s"]+/);
       if (match) handoffUrl = match[0];
    }

    return NextResponse.json({
      ok: true,
      handoffUrl,
      authMethod: "browser",
    });
  }

  if (requiresApiKey) {
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey) {
      return NextResponse.json(
        { error: "This service needs an API key to connect." },
        { status: 400 }
      );
    }
    if (apiKey.length > 2000) {
      return NextResponse.json({ error: "That API key looks too long." }, { status: 400 });
    }

    const stored = encryptSecret(apiKey, `UserConnection ${integrationId} API key`);
    const connection = await upsertUserConnection({
      userId: actor.userId,
      integrationId,
      displayName: typeof body.displayName === "string" ? body.displayName.slice(0, 80) : undefined,
      apiKey: stored,
    });

    return NextResponse.json({
      ok: true,
      connection: { id: connection.id, integrationId, status: "active" },
    });
  }

  if (supportsOAuth) {
    return NextResponse.json({
      ok: true,
      redirectUrl: `/api/user/connections/${integrationId}/oauth/start`,
      authMethod: "oauth2",
    });
  }

  return NextResponse.json(
    { error: "This service doesn't support connecting right now." },
    { status: 501 }
  );
}