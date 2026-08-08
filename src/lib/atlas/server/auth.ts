import "server-only";

import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";

export class AtlasAuthenticationError extends Error {}

export interface AtlasCapabilities {
  liveLlm: boolean;
  authenticated: boolean;
  persistence: boolean;
  approvals: boolean;
  memory: boolean;
}

export interface AtlasActor {
  userId: string;
  isAuthenticated: boolean;
  capabilities: AtlasCapabilities;
}

async function buildCapabilities(authenticated: boolean): Promise<AtlasCapabilities> {
  const { resolveDefaultModel } = await import("@/lib/atlas/server/model-registry");
  const liveLlm = Boolean(await resolveDefaultModel());

  return {
    liveLlm,
    authenticated,
    persistence: authenticated,
    approvals: authenticated,
    memory: authenticated,
  };
}

export async function getAtlasActor(): Promise<AtlasActor> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("better-auth.session_token")?.value;

    if (sessionToken) {
      const allCookies = cookieStore.getAll();
      const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join("; ");
      const h = new Headers({ cookie: cookieHeader });

      const session = await auth.api.getSession({ headers: h });

      if (session?.user) {
        const capabilities = await buildCapabilities(true);
        return { userId: session.user.id, isAuthenticated: true, capabilities };
      }
    }
  } catch (err) {
    console.error("[atlas] getAtlasActor failed to resolve session:", err);
  }

  const capabilities = await buildCapabilities(false);
  return { userId: await guestUserIdFromCookies(), isAuthenticated: false, capabilities };
}

async function guestUserIdFromCookies(): Promise<string> {
  try {
    const requestHeaders = await headers();
    const cookie = requestHeaders.get("cookie") || "";
    const match = /(?:^|;\s*)atlas-user-id=([^;]+)/.exec(cookie);
    return match ? decodeURIComponent(match[1]) : "anonymous";
  } catch {
    return "anonymous";
  }
}

export function canUseLiveLlm(actor: AtlasActor): boolean {
  return actor.capabilities.liveLlm;
}

export function isAtlasAdminActor(actor: AtlasActor): boolean {
  const adminIds = (process.env.ATLAS_ADMIN_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (adminIds.length > 0) return adminIds.includes(actor.userId);

  // No allowlist configured — default deny everywhere. A signed-in user is
  // only treated as admin in explicit dev trust mode (ATLAS_DEV_TRUST_ALL)
  // so the admin UI works out of the box in local development without
  // forcing a user id into the env. Production always requires the allowlist.
  const env = process.env.NODE_ENV || "development";
  return env === "development" && process.env.ATLAS_DEV_TRUST_ALL === "true" && actor.isAuthenticated;
}

export async function requireAuthenticatedActor(): Promise<AtlasActor> {
  const actor = await getAtlasActor();

  if (!actor.capabilities.authenticated) {
    throw new AtlasAuthenticationError("Sign in to perform this action.");
  }

  return actor;
}

export async function requireAtlasAdmin(): Promise<AtlasActor> {
  const actor = await getAtlasActor();

  if (!isAtlasAdminActor(actor)) {
    throw new AtlasAuthenticationError("Admin access required.");
  }

  return actor;
}
