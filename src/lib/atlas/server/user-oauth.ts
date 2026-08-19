import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import { generatePkce, generateState } from "@/lib/atlas/server/mcp-oauth";

export const USER_OAUTH_STATE_COOKIE = "atlas_user_oauth_state";
const USER_OAUTH_STATE_MAX_AGE = 10 * 60; // seconds
const CLIENT_ID_SETTING_PREFIX = "userOauth:clientId:";

type NodeCrypto = typeof import("node:crypto");
let cryptoModule: NodeCrypto | null = null;

function nodeCrypto(): NodeCrypto {
  if (!cryptoModule) {
    cryptoModule = require("node:crypto") as NodeCrypto;
  }
  return cryptoModule;
}

const secret = () => process.env.ATLAS_MCP_OAUTH_SECRET || "atlas-dev-oauth-secret";

/**
 * Cloud Run forwards the public host via x-forwarded-host / x-forwarded-proto.
 * request.nextUrl.origin resolves to the internal host (0.0.0.0:8080), so build
 * the origin from the forwarded headers when present.
 */
export function trustedOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    process.env.BETTER_AUTH_URL ||
    "";
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (!host) return "";
  return `${proto}://${host}`;
}

function sign(value: string): string {
  return nodeCrypto().createHash("sha256").update(`${secret()}:${value}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = new Uint8Array(Buffer.from(a, "utf8"));
  const bBuf = new Uint8Array(Buffer.from(b, "utf8"));
  if (aBuf.length !== bBuf.length) return false;
  return nodeCrypto().timingSafeEqual(aBuf, bBuf);
}

export interface OAuthEndpointConfig {
  authorizeUrl: string;
  tokenUrl: string;
  registerUrl?: string;
  scopes: string[];
  /** Override for the OAuth client_id when a provider has a fixed client (e.g. Google). */
  clientId?: string;
  /** Client secret for confidential clients (e.g. Google). Passed at token exchange. */
  clientSecret?: string;
}

/** Endpoints for a provider whose OAuth server lives under the MCP domain. */
function mcpEndpoints(domain: string): OAuthEndpointConfig {
  return {
    authorizeUrl: `https://${domain}/auth/authorize`,
    tokenUrl: `https://${domain}/auth/token`,
    registerUrl: `https://${domain}/auth/register`,
    scopes: ["mcp:tools", "mcp:resources", "mcp:prompts"],
  };
}

const DEFAULT_ENDPOINTS: Record<string, OAuthEndpointConfig> = {
  swiggy: mcpEndpoints("mcp.swiggy.com"),
  zomato: {
    authorizeUrl: "https://mcp-server.zomato.com/authorize",
    tokenUrl: "https://mcp-server.zomato.com/token",
    registerUrl: "https://mcp-server.zomato.com/register",
    scopes: ["mcp:tools", "mcp:resources", "mcp:prompts"],
  },
  zepto: {
    authorizeUrl: "https://auth.zepto.co.in/authorize",
    tokenUrl: "https://auth.zepto.co.in/token",
    registerUrl: "https://auth.zepto.co.in/register",
    scopes: ["mcp:tools"],
  },
  uber: {
    authorizeUrl: "https://login.uber.com/oauth/v2/authorize",
    tokenUrl: "https://login.uber.com/oauth/v2/token",
    scopes: ["profile", "history_lite"],
  },
  dhan: {
    authorizeUrl: "https://mcp.dhan.co/authorize",
    tokenUrl: "https://mcp.dhan.co/token",
    registerUrl: "https://mcp.dhan.co/register",
    scopes: ["mcp:tools"],
  },
  upstox: {
    authorizeUrl: "https://mcp.upstox.com/authorize",
    tokenUrl: "https://mcp.upstox.com/token",
    registerUrl: "https://mcp.upstox.com/register",
    scopes: ["mcp:tools"],
  },
  tapetide: {
    authorizeUrl: "https://mcp.tapetide.com/authorize",
    tokenUrl: "https://mcp.tapetide.com/token",
    registerUrl: "https://mcp.tapetide.com/register",
    scopes: ["openid", "email", "profile"],
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/gmail.readonly"],
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
};

/** Resolve endpoints for an integration from config → defaults → env. */
export function resolveOAuthEndpoints(integrationId: string, authMethod?: {
  authorizeUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
}): OAuthEndpointConfig | null {
  const configured = DEFAULT_ENDPOINTS[integrationId];

  if (authMethod?.authorizeUrl && authMethod?.tokenUrl) {
    return {
      authorizeUrl: authMethod.authorizeUrl,
      tokenUrl: authMethod.tokenUrl,
      scopes: authMethod.scopes && authMethod.scopes.length > 0 ? authMethod.scopes : configured?.scopes ?? ["openid", "email", "profile"],
      clientId: configured?.clientId,
      clientSecret: configured?.clientSecret,
    };
  }

  return configured ?? null;
}

export interface PendingUserOAuth {
  verifier: string;
  redirectUri: string;
  userId: string;
  integrationId: string;
  createdAt: number;
}

export function userOauthRedirectUri(origin: string, integrationId: string): string {
  return `${origin}/api/user/connections/${integrationId}/oauth/callback`;
}

function encodePendingUserOAuth(value: PendingUserOAuth): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodePendingUserOAuth(cookie: string | undefined | null): PendingUserOAuth | null {
  if (!cookie) return null;

  const [payload, signature] = cookie.split(".");

  if (!payload || !signature || !safeEqual(sign(payload), signature)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (typeof parsed !== "object" || parsed === null) return null;

    const record = parsed as Record<string, unknown>;

    if (
      typeof record.verifier !== "string" ||
      typeof record.redirectUri !== "string" ||
      typeof record.userId !== "string" ||
      typeof record.integrationId !== "string"
    ) {
      return null;
    }

    const createdAt = typeof record.createdAt === "number" ? record.createdAt : Date.now();

    if (Date.now() - createdAt > USER_OAUTH_STATE_MAX_AGE * 1000) {
      return null;
    }

    return {
      verifier: record.verifier,
      redirectUri: record.redirectUri,
      userId: record.userId,
      integrationId: record.integrationId,
      createdAt,
    };
  } catch {
    return null;
  }
}

export function buildUserOauthStateCookie(value: PendingUserOAuth): string {
  return `${USER_OAUTH_STATE_COOKIE}=${encodePendingUserOAuth(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${USER_OAUTH_STATE_MAX_AGE}`;
}

export function clearUserOauthStateCookie(): string {
  return `${USER_OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * Resolve the OAuth client_id for an integration.
 * Order: fixed provider client id → env override → per-redirect-URI dynamic registration.
 */
export async function resolveUserOauthClientId(
  integrationId: string,
  redirectUri: string,
  config: OAuthEndpointConfig
): Promise<string> {
  const envOverride = process.env[`ATLAS_${integrationId.toUpperCase().replace(/-/g, "_")}_CLIENT_ID`];
  if (envOverride) return envOverride;
  if (config.clientId) return config.clientId;

  const settingKey = `${CLIENT_ID_SETTING_PREFIX}${redirectUri}`;
  const existing = await prisma.setting.findUnique({ where: { key: settingKey } });
  if (existing?.value) return existing.value;

  if (!config.registerUrl) {
    throw new Error("This service needs an OAuth client ID configured before it can be connected.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(config.registerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Atlas User Client",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: config.scopes.join(" "),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Service registration returned ${response.status}${text ? `: ${text}` : ""}`);
    }

    const payload: unknown = await response.json();
    const clientId =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>).client_id
        : undefined;

    if (typeof clientId !== "string") {
      throw new Error("Service registration did not return a client_id.");
    }

    await prisma.setting.upsert({
      where: { key: settingKey },
      create: { key: settingKey, value: clientId },
      update: { value: clientId },
    });

    return clientId;
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Dynamic client registration with the service failed.");
  } finally {
    clearTimeout(timeout);
  }
}

export function buildUserAuthorizeUrl(params: {
  authorizeUrl: string;
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

  return `${params.authorizeUrl}${params.authorizeUrl.includes("?") ? "&" : "?"}${query.toString()}`;
}

export async function exchangeUserOauthCode(params: {
  tokenUrl: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string;
}): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  });

  if (params.clientSecret) {
    body.set("client_secret", params.clientSecret);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(params.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Service token endpoint returned ${response.status}${text ? `: ${text}` : ""}`);
    }

    const payload: unknown = await response.json();
    const record = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    const accessToken = record.access_token;

    if (typeof accessToken !== "string") {
      throw new Error("Service token endpoint did not return an access token.");
    }

    return {
      accessToken,
      refreshToken: typeof record.refresh_token === "string" ? record.refresh_token : undefined,
      expiresIn: typeof record.expires_in === "number" ? record.expires_in : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createUserOauthFlow(): {
  verifier: string;
  challenge: string;
  state: string;
} {
  const { verifier, challenge } = generatePkce();
  const state = generateState();
  return { verifier, challenge, state };
}
