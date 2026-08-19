import { NextRequest, NextResponse } from "next/server";

import { transcribeAudio } from "@/lib/atlas/server/nemo-voice";
import { getAtlasActor } from "@/lib/atlas/server/auth";
import { resolveVoiceBudget, recordVoiceUsage } from "@/lib/atlas/server/voice-caps";


export const dynamic = "force-dynamic";


const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/** Rough seconds for compressed audio (webm/opus ≈ 8–16 KB/s). */
function estimateSeconds(bytes: number): number {
  return Math.max(1, Math.round(bytes / 12_000));
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getAtlasActor();

    const budget = await resolveVoiceBudget(actor);
    if (!budget.allowed) {
      return NextResponse.json(
        {
          error: `You have reached today’s voice limit (${budget.limitMinutes} minutes). Try again tomorrow or use text input.`,
          remainingSeconds: 0,
        },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("audio");

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Send the audio as a multipart 'audio' field." }, { status: 400 });
    }

    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio is too large (max 15 MB)." }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "audio/wav";

    const { text } = await transcribeAudio(buffer, mime);

    if (!text) {
      return NextResponse.json({ error: "Could not transcribe audio." }, { status: 422 });
    }

    if (budget.capped) {
      const parsed = Number(formData.get("durationSeconds"));
      const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : estimateSeconds(file.size);
      await recordVoiceUsage(actor.userId, seconds);
    }

    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
