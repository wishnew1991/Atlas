import "server-only";

import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";

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

export function isClerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
}

const USER_ID_COOKIE = "atlas-user-id";

async function resolveGuestUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(USER_ID_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
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
  if (!isClerkConfigured()) {
    const guestUserId = await resolveGuestUserId();

    if (guestUserId) {
      const capabilities = await buildCapabilities(true);
      return { userId: guestUserId, isAuthenticated: true, capabilities };
    }

    const capabilities = await buildCapabilities(true);
    return { userId: "atlas-demo-user", isAuthenticated: true, capabilities };
  }

  const { userId } = await auth();

  if (!userId) {
    const capabilities = await buildCapabilities(false);
    return { userId: "atlas-demo-user", isAuthenticated: false, capabilities };
  }

  const capabilities = await buildCapabilities(true);
  return { userId, isAuthenticated: true, capabilities };
}

export function canUseLiveLlm(actor: AtlasActor): boolean {
  return actor.capabilities.liveLlm;
}

export function isAtlasAdminActor(actor: AtlasActor): boolean {
  if (!isClerkConfigured()) {
    return true;
  }

  const adminIds = (process.env.ATLAS_ADMIN_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return adminIds.includes(actor.userId);
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
