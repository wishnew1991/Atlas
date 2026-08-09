import "server-only";

import { getStoredMcpClientId, storeMcpClientId } from "@/lib/atlas/server/model-registry";

const SWIGGY_AUTHORIZE = "https://mcp.swiggy.com/auth/authorize";
const SWIGGY_TOKEN = "https://mcp.swiggy.com/auth/token";

export const OAUTH_STATE_COOKIE = "atlas_mcp_oauth_state";
const OAUTH_STATE_MAX_AGE = 10 * 60; // seconds

// Unlike the rest of the app, this lazy loader keeps `node:crypto` out of the
// module-eval hot path: Next's build-time edge sandbox resolves static imports
// before nodejs_compat is available, which fails to compile the route.
type NodeCrypto = typeof import("node:crypto");
let cryptoModule: NodeCrypto | null = null;

function nodeCrypto(): NodeCrypto {
  if (!cryptoModule) {
    cryptoModule = require("node:crypto") as NodeCrypto;
  }
  return cryptoModule;
}

export function defaultRedirectUri(origin: string): string {
  return process.env.ATLAS_MCP_REDIRECT_URI || `${origin}/api/admin/mcp/oauth/callback`;
}

export function generatePkce(): { verifier: string; challenge: string } {
  const { randomBytes, createHash } = nodeCrypto();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  return { verifier, challenge };
}

export function generateState(): string {
  return nodeCrypto().randomBytes(16).toString("base64url");
}

export interface PendingAuthorization {
  verifier: string;
  redirectUri: string;
  serverId?: string;
  createdAt: number;
}

const secret = () => process.env.ATLAS_MCP_OAUTH_SECRET || "atlas-dev-oauth-secret";

function sign(value: string): string {
  return nodeCrypto().createHash("sha256").update(`${secret()}:${value}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = new Uint8Array(Buffer.from(a, "utf8"));
  const bBuf = new Uint8Array(Buffer.from(b, "utf8"));
  if (aBuf.length !== bBuf.length) return false;
  return nodeCrypto().timingSafeEqual(aBuf, bBuf);
}

export function encodePendingAuthorization(value: PendingAuthorization): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodePendingAuthorization(cookie: string | undefined | null): PendingAuthorization | null {
  if (!cookie) return null;

  const [payload, signature] = cookie.split(".");

  if (!payload || !signature || !safeEqual(sign(payload), signature)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (typeof parsed !== "object" || parsed === null) return null;

    const record = parsed as Record<string, unknown>;

    if (typeof record.verifier !== "string" || typeof record.redirectUri !== "string") {
      return null;
    }

    const createdAt = typeof record.createdAt === "number" ? record.createdAt : Date.now();

    // Expire authorizations that have sat around too long (e.g. aborted logins).
    if (Date.now() - createdAt > OAUTH_STATE_MAX_AGE * 1000) {
      return null;
    }

    return {
      verifier: record.verifier,
      redirectUri: record.redirectUri,
      serverId: typeof record.serverId === "string" ? record.serverId : undefined,
      createdAt,
    };
  } catch {
    return null;
  }
}

export function buildOauthStateCookie(value: PendingAuthorization): string {
  return `${OAUTH_STATE_COOKIE}=${encodePendingAuthorization(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${OAUTH_STATE_MAX_AGE}`;
}

export function clearOauthStateCookie(): string {
  return `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function buildAuthorizeUrl(params: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  clientId: string;
  scope: string;
}): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    scope: params.scope,
  });

  return `${SWIGGY_AUTHORIZE}?${query.toString()}`;
}

export async function exchangeCodeForToken(params: {
  redirectUri: string;
  code: string;
  codeVerifier: string;
  clientId: string;
}): Promise<{ accessToken: string; expiresIn?: number }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(SWIGGY_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Swiggy token endpoint returned ${response.status}${text ? `: ${text}` : ""}`);
    }

    const payload: unknown = await response.json();
    const record = isRecord(payload) ? payload : {};
    const accessToken = record.access_token;

    if (typeof accessToken !== "string") {
      throw new Error("Swiggy token endpoint did not return an access token.");
    }

    return {
      accessToken,
      expiresIn: typeof record.expires_in === "number" ? record.expires_in : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const SWIGGY_REGISTER = "https://mcp.swiggy.com/auth/register";

let cachedClientId: string | null = null;

export function getClientId(): string {
  return process.env.SWIGGY_MCP_CLIENT_ID || cachedClientId || "atlas-dev-client";
}

export async function registerClient(redirectUri: string, scope: string): Promise<string> {
  if (process.env.SWIGGY_MCP_CLIENT_ID) {
    return process.env.SWIGGY_MCP_CLIENT_ID;
  }

  if (cachedClientId) {
    return cachedClientId;
  }

  const stored = await getStoredMcpClientId();
  if (stored) {
    cachedClientId = stored;
    return stored;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(SWIGGY_REGISTER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Atlas Dev Client",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Swiggy registration returned ${response.status}${text ? `: ${text}` : ""}`);
    }

    const payload: unknown = await response.json();
    const clientId = isRecord(payload) ? payload.client_id : undefined;

    if (typeof clientId !== "string") {
      throw new Error("Swiggy registration did not return a client_id.");
    }

    cachedClientId = clientId;
    await storeMcpClientId(clientId);

    return clientId;
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Dynamic client registration with Swiggy failed.");
  } finally {
    clearTimeout(timeout);
  }
}
