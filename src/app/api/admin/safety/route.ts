import { NextResponse } from "next/server";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { prisma } from "@/lib/atlas/server/prisma";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  try {
    const [piiEnabledSetting, piiFieldsSetting, toxicitySetting, flaggedSetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "safety:pii_enabled" } }),
      prisma.setting.findUnique({ where: { key: "safety:pii_fields" } }),
      prisma.setting.findUnique({ where: { key: "safety:toxicity_enabled" } }),
      prisma.setting.findUnique({ where: { key: "safety:flagged_capabilities" } }),
    ]);

    return NextResponse.json({
      piiEnabled: piiEnabledSetting ? piiEnabledSetting.value === "true" : false,
      piiFields: piiFieldsSetting ? JSON.parse(piiFieldsSetting.value) : ["email", "credit_card", "ssn"],
      toxicityEnabled: toxicitySetting ? toxicitySetting.value === "true" : false,
      flaggedCapabilities: flaggedSetting ? JSON.parse(flaggedSetting.value) : ["system_execute_command"],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load safety config." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  try {
    const { piiEnabled, piiFields, toxicityEnabled, flaggedCapabilities } = await request.json();

    await Promise.all([
      prisma.setting.upsert({
        where: { key: "safety:pii_enabled" },
        update: { value: piiEnabled ? "true" : "false" },
        create: { key: "safety:pii_enabled", value: piiEnabled ? "true" : "false" },
      }),
      prisma.setting.upsert({
        where: { key: "safety:pii_fields" },
        update: { value: JSON.stringify(piiFields || []) },
        create: { key: "safety:pii_fields", value: JSON.stringify(piiFields || []) },
      }),
      prisma.setting.upsert({
        where: { key: "safety:toxicity_enabled" },
        update: { value: toxicityEnabled ? "true" : "false" },
        create: { key: "safety:toxicity_enabled", value: toxicityEnabled ? "true" : "false" },
      }),
      prisma.setting.upsert({
        where: { key: "safety:flagged_capabilities" },
        update: { value: JSON.stringify(flaggedCapabilities || ["system_execute_command"]) },
        create: { key: "safety:flagged_capabilities", value: JSON.stringify(flaggedCapabilities || ["system_execute_command"]) },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save safety config." }, { status: 500 });
  }
}
