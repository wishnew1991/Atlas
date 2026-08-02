import { NextRequest, NextResponse } from "next/server";

import { transcribeAudio } from "@/lib/atlas/server/nemo-voice";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
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

    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
