import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { readVoiceConfig, writeVoiceConfig, type AtlasVoiceConfig } from "@/lib/atlas/server/model-registry";
import { isPiperAvailable } from "@/lib/atlas/server/piper-tts";
import { listSttModelOptions, listTtsModelOptions, LOCAL_PIPER_TTS_ID } from "@/lib/atlas/server/voice-routing";
import { parseVoiceSttMode, parseVoiceTtsMode } from "@/lib/atlas/voice-modes";

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

  const [voice, sttModels, ttsModels, piperAvailable] = await Promise.all([
    readVoiceConfig(),
    listSttModelOptions(),
    listTtsModelOptions(),
    isPiperAvailable(),
  ]);

  return NextResponse.json({
    voice,
    sttModels,
    ttsModels,
    piperAvailable,
    defaults: { ttsModelId: LOCAL_PIPER_TTS_ID },
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

  const voice: AtlasVoiceConfig = {
    sttLanguage: typeof payload.sttLanguage === "string" ? payload.sttLanguage : "en-US",
    ttsVoiceURI: typeof payload.ttsVoiceURI === "string" ? payload.ttsVoiceURI : "",
    ttsRate: typeof payload.ttsRate === "number" ? payload.ttsRate : 1,
    ttsPitch: typeof payload.ttsPitch === "number" ? payload.ttsPitch : 1,
    sttModelId: typeof payload.sttModelId === "string" ? payload.sttModelId : "",
    ttsModelId:
      typeof payload.ttsModelId === "string" && payload.ttsModelId.trim()
        ? payload.ttsModelId.trim()
        : LOCAL_PIPER_TTS_ID,
    sttMode: parseVoiceSttMode(payload.sttMode),
    ttsMode: parseVoiceTtsMode(payload.ttsMode),
  };

  const saved = await writeVoiceConfig(voice);

  return NextResponse.json({ voice: saved });
}
