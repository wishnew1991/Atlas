import { NextRequest, NextResponse } from "next/server";

import { synthesizeSpeech, isPiperAvailable } from "@/lib/atlas/server/piper-tts";
import { readVoiceConfig } from "@/lib/atlas/server/model-registry";

export const runtime = "nodejs";

export const maxDuration = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: NextRequest) {
  const payload: unknown = await request.json().catch(() => null);

  const text =
    isRecord(payload) && typeof payload.text === "string" ? payload.text : "";

  if (!text.trim()) {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }

  if (!(await isPiperAvailable())) {
    return NextResponse.json(
      { error: "Piper TTS is not installed. Install piper-tts and a voice model." },
      { status: 501 }
    );
  }

  try {
    const voiceConfig = await readVoiceConfig();
    const audio = await synthesizeSpeech(text, {
      voice: voiceConfig.ttsVoiceURI || undefined,
      lengthScale: 1 / Math.max(0.5, Math.min(2, voiceConfig.ttsRate || 1)),
    });

    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audio.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TTS synthesis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
