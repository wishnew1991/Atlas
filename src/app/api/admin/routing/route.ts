import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import {
  readRegistry,
  upsertRouting,
  setDefaultModel,
  type AtlasActionDomain,
} from "@/lib/atlas/server/model-registry";

export const runtime = "edge";
export const dynamic = "force-dynamic";


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const registry = await readRegistry();

  return NextResponse.json({ routing: registry.routing, defaultModelId: registry.defaultModelId });
}

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isRecord(payload)) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const domain = payload.domain;
  const modelId = payload.modelId;
  const defaultModelId = payload.defaultModelId;

  if (typeof domain === "string") {
    if (typeof modelId !== "string") {
      return NextResponse.json({ error: "modelId is required." }, { status: 400 });
    }

    await upsertRouting(domain as AtlasActionDomain, modelId);
  }

  if (typeof defaultModelId === "string") {
    await setDefaultModel(defaultModelId);
  }

  const registry = await readRegistry();

  return NextResponse.json({ routing: registry.routing, defaultModelId: registry.defaultModelId });
}
