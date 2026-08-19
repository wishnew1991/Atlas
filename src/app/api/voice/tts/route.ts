import { NextRequest, NextResponse } from "next/server";

import { synthesizeSpeech, isPiperAvailable } from "@/lib/atlas/server/piper-tts";
import { resolveConfiguredTtsTarget } from "@/lib/atlas/server/voice-routing";
import { getAtlasActor } from "@/lib/atlas/server/auth";
import { resolveVoiceBudget, recordVoiceUsage } from "@/lib/atlas/server/voice-caps";


export const dynamic = "force-dynamic";


export const maxDuration = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Rough speech seconds from text length (~150 words/min → ~15 chars/sec). */
function estimateSpeechSeconds(text: string, rate: number): number {
  const charsPerSecond = 15 * Math.max(0.5, Math.min(2, rate || 1));
  return Math.max(1, Math.round(text.trim().length / charsPerSecond));
}

function recordCappedUsage(userId: string, text: string, rate: number): void {
  void recordVoiceUsage(userId, estimateSpeechSeconds(text, rate));
}

export async function POST(request: NextRequest) {
  const payload: unknown = await request.json().catch(() => null);

  const text =
    isRecord(payload) && typeof payload.text === "string" ? payload.text : "";
  const rate =
    isRecord(payload) && typeof payload.rate === "number" ? payload.rate : 1;

  if (!text.trim()) {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }

  const actor = await getAtlasActor();
  const budget = await resolveVoiceBudget(actor);
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error: `You have reached today’s voice limit (${budget.limitMinutes} minutes). Try again tomorrow or read the reply.`,
        remainingSeconds: 0,
      },
      { status: 429 }
    );
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

      if (budget.capped) {
        recordCappedUsage(actor.userId, text, rate);
      }

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
