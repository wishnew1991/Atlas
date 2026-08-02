import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { readVoiceConfig, writeVoiceConfig, type AtlasVoiceConfig } from "@/lib/atlas/server/model-registry";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const voice = await readVoiceConfig();

  return NextResponse.json({ voice });
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

  const voice: AtlasVoiceConfig = {
    sttLanguage: typeof payload.sttLanguage === "string" ? payload.sttLanguage : "en-US",
    ttsVoiceURI: typeof payload.ttsVoiceURI === "string" ? payload.ttsVoiceURI : "",
    ttsRate: typeof payload.ttsRate === "number" ? payload.ttsRate : 1,
    ttsPitch: typeof payload.ttsPitch === "number" ? payload.ttsPitch : 1,
  };

  const saved = await writeVoiceConfig(voice);

  return NextResponse.json({ voice: saved });
}
