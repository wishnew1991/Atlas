import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import {
  readRegistry,
  upsertModel,
  deleteModel,
  setDefaultModel,
  setEmbeddingModel,
  type AtlasModelConfig,
  type AtlasProvider,
} from "@/lib/atlas/server/model-registry";

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

  return NextResponse.json({
    models: registry.models,
    routing: registry.routing,
    defaultModelId: registry.defaultModelId,
    embeddingModelId: registry.embeddingModelId,
  });
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

  const id = payload.id;
  const credentialId = payload.credentialId;
  const label = payload.label;
  const embeddingModelId = payload.embeddingModelId;

  if (typeof id !== "string" || typeof credentialId !== "string") {
    return NextResponse.json({ error: "id and credentialId are required." }, { status: 400 });
  }

  const model: AtlasModelConfig = {
    id,
    provider: (payload.provider as AtlasProvider) ?? "openai",
    label: typeof label === "string" ? label : id,
    apiKey: typeof payload.apiKey === "string" ? payload.apiKey : "",
    baseUrl: typeof payload.baseUrl === "string" ? payload.baseUrl : undefined,
    enabled: payload.enabled !== false,
    credentialId,
  };

  await upsertModel(model);

  if (typeof embeddingModelId === "string" && embeddingModelId.length > 0) {
    await setEmbeddingModel(embeddingModelId);
  }

  const registry = await readRegistry();

  if (!registry.defaultModelId) {
    await setDefaultModel(id);
    const refreshed = await readRegistry();
    return NextResponse.json({ models: refreshed.models, defaultModelId: refreshed.defaultModelId, embeddingModelId: refreshed.embeddingModelId });
  }

  return NextResponse.json({ models: registry.models, defaultModelId: registry.defaultModelId, embeddingModelId: registry.embeddingModelId });
}

export async function DELETE(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isRecord(payload) || typeof payload.id !== "string") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  await deleteModel(payload.id);

  const refreshed = await readRegistry();

  return NextResponse.json({ models: refreshed.models, defaultModelId: refreshed.defaultModelId });
}
