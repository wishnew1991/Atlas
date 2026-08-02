import "server-only";

import { auth } from "@clerk/nextjs/server";

export class AtlasAuthenticationError extends Error {}

/**
 * Capabilities describe what the current request is allowed to do. They are
 * checked independently rather than inferred from a single auth flag, so a guest
 * (no Clerk session) can still use a configured live model while being blocked
 * from actions that require an authenticated identity (approvals, ownership).
 */
export interface AtlasCapabilities {
  /** A model is configured and reachable, so live LLM calls are allowed. */
  liveLlm: boolean;
  /** The request represents a signed-in user (Clerk session present). */
  authenticated: boolean;
  /** Conversation history / state can be persisted per-user. */
  persistence: boolean;
  /** Spend/booking approvals may be created and executed. */
  approvals: boolean;
  /** Long-term memory is available for this actor. */
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

/**
 * Builds the capability set for an actor. Live LLM availability depends only on
 * whether a model is configured, never on authentication. Authenticated-only
 * capabilities (persistence, approvals, ownership) require a real Clerk user.
 */
async function buildCapabilities(authenticated: boolean, userId: string): Promise<AtlasCapabilities> {
  const { resolveDefaultModel } = await import("@/lib/atlas/server/model-registry");
  const liveLlm = Boolean(await resolveDefaultModel());

  const guest = userId === "atlas-demo-user";

  return {
    liveLlm,
    authenticated,
    persistence: authenticated,
    approvals: authenticated && !guest,
    memory: authenticated,
  };
}

export async function getAtlasActor(): Promise<AtlasActor> {
  if (!isClerkConfigured()) {
    const userId = "atlas-demo-user";
    const capabilities = await buildCapabilities(false, userId);
    return { userId, isAuthenticated: false, capabilities };
  }

  const { userId } = await auth();

  if (!userId) {
    // No session: still allow guest access when a model is configured.
    const guestId = "atlas-demo-user";
    const capabilities = await buildCapabilities(false, guestId);
    return { userId: guestId, isAuthenticated: false, capabilities };
  }

  const capabilities = await buildCapabilities(true, userId);
  return { userId, isAuthenticated: true, capabilities };
}

/** Returns true when the actor may run live model inference this turn. */
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

/** Returns the actor only if a real (non-guest) user is signed in. */
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
