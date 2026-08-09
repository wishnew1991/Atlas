import { NextRequest, NextResponse } from "next/server";

import { synthesizeSpeech, isPiperAvailable } from "@/lib/atlas/server/piper-tts";
import { resolveConfiguredTtsTarget } from "@/lib/atlas/server/voice-routing";


export const runtime = "edge";
export const dynamic = "force-dynamic";


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

  const target = await resolveConfiguredTtsTarget();

  if (!target) {
    return NextResponse.json(
      {
        error:
          "No TTS target configured. Open Admin → Voice and select Local Piper or a TTS-capable model.",
      },
      { status: 501 }
    );
  }

  if (target.kind === "piper") {
    if (!(await isPiperAvailable())) {
      return NextResponse.json(
        { error: "Piper TTS is not installed. Install piper-tts and a voice model, or pick another TTS target." },
        { status: 501 }
      );
    }

    try {
      const audio = await synthesizeSpeech(text, {
        voice: target.voice,
        lengthScale: 1 / Math.max(0.5, Math.min(2, target.rate || 1)),
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

  // Cloud / model TTS is not wired for arbitrary chat models yet.
  return NextResponse.json(
    {
      error: `TTS model "${target.model.id}" is not supported for synthesis yet. Select Local Piper in Admin → Voice.`,
    },
    { status: 501 }
  );
}
