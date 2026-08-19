import { NextResponse } from "next/server";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { prisma } from "@/lib/atlas/server/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  try {
    const profiles = await prisma.userProfile.findMany({
      select: {
        userId: true,
        name: true,
        email: true,
        tier: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users: profiles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load users." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  try {
    const { userId, tier } = await request.json();
    if (!userId || !tier) {
      return NextResponse.json({ error: "userId and tier are required." }, { status: 400 });
    }

    if (tier !== "free" && tier !== "premium" && tier !== "vip") {
      return NextResponse.json({ error: "Invalid tier value." }, { status: 400 });
    }

    const updated = await prisma.userProfile.upsert({
      where: { userId },
      update: { tier },
      create: { userId, tier, name: "New User", email: "" },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update user tier." }, { status: 500 });
  }
}
