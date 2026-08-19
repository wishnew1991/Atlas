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
    const quotaSetting = await prisma.setting.findUnique({ where: { key: "quotas:limits" } });
    const limits = quotaSetting
      ? JSON.parse(quotaSetting.value)
      : [
          { role: "Default User", maxRequestsPerMinute: 30, maxTokensPerDay: 50000 },
          { role: "Premium User", maxRequestsPerMinute: 60, maxTokensPerDay: 150000 },
          { role: "Administrator", maxRequestsPerMinute: 120, maxTokensPerDay: 500000 },
        ];

    return NextResponse.json({ limits });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load user quotas." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  try {
    const { limits } = await request.json();
    if (!Array.isArray(limits)) {
      return NextResponse.json({ error: "limits array is required." }, { status: 400 });
    }

    await prisma.setting.upsert({
      where: { key: "quotas:limits" },
      update: { value: JSON.stringify(limits) },
      create: { key: "quotas:limits", value: JSON.stringify(limits) },
    });

    return NextResponse.json({ success: true, limits });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save user quotas." }, { status: 500 });
  }
}
