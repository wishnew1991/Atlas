import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import {
  listCredentials,
  createCredential,
  deleteCredential,
  type AtlasCredential,
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

  return NextResponse.json({ credentials: await listCredentials() });
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

  const label = payload.label;
  const provider = payload.provider;
  const apiKey = payload.apiKey;
  const baseUrl = payload.baseUrl;

  if (typeof label !== "string" || typeof provider !== "string" || typeof apiKey !== "string") {
    return NextResponse.json({ error: "label, provider, and apiKey are required." }, { status: 400 });
  }

  if (provider !== "openai" && provider !== "anthropic" && provider !== "google" && provider !== "nvidia" && provider !== "custom") {
    return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  }

  if (provider === "custom" && typeof baseUrl !== "string") {
    return NextResponse.json({ error: "Custom providers require a base URL." }, { status: 400 });
  }

  const credential: AtlasCredential = {
    id: "",
    label,
    provider: provider as AtlasProvider,
    apiKey,
    baseUrl: typeof baseUrl === "string" ? baseUrl : undefined,
  };

  const created = await createCredential(credential);

  return NextResponse.json({ credential: created });
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

  await deleteCredential(payload.id);

  return NextResponse.json({ ok: true });
}
