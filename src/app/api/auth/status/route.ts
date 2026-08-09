import { NextResponse } from "next/server";

import { getAtlasActor, isAtlasAdminActor } from "@/lib/atlas/server/auth";
import { prisma } from "@/lib/atlas/server/prisma";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** GET /api/auth/status — lightweight actor gate for client-side page shells. */
export async function GET() {
  const actor = await getAtlasActor();

  // The welcome flow is guest-friendly: a visitor's name is keyed to their
  // atlas-user-id cookie directly in userProfile, with no email/password.
  // Mirror the old SSR guard: read the profile for whoever the actor is,
  // authenticated or not, and gate on profileName only.
  let profileName: string | null = null;
  let isAdmin = false;
  if (actor.name) {
    profileName = actor.name;
  } else if (actor.userId) {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: actor.userId },
      select: { name: true },
    });
    let trimmed = profile?.name.trim() || "";

    if (!trimmed && actor.isAuthenticated) {
      const user = await prisma.user.findUnique({
        where: { id: actor.userId },
        select: { name: true },
      });
      trimmed = user?.name?.trim() || "";
    }

    if (trimmed) profileName = trimmed;
  }

  if (actor.isAuthenticated) {
    isAdmin = isAtlasAdminActor(actor);
  }

  return NextResponse.json(
    {
      authenticated: actor.isAuthenticated,
      isAdmin,
      profileName,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}