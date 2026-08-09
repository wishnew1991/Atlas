import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { readSerperApiKey, writeSerperApiKey } from "@/lib/atlas/server/model-registry";
import { serperSearch } from "@/lib/atlas/server/serper";

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

  const apiKey = await readSerperApiKey();

  return NextResponse.json({
    configured: Boolean(apiKey),
    masked: apiKey ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}` : "",
  });
}

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isRecord(payload) || typeof payload.apiKey !== "string") {
    return NextResponse.json({ error: "apiKey is required." }, { status: 400 });
  }

  await writeSerperApiKey(payload.apiKey);

  return NextResponse.json({ ok: true });
}

/** Validate the stored Serper key with a live query. */
export async function PUT() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const response = await serperSearch("hello world");

  if (response.results.length > 0) {
    return NextResponse.json({ ok: true, message: `Key works — ${response.results.length} results returned.` });
  }

  return NextResponse.json({ ok: false, message: response.message || "No results returned. Check the key." });
}
