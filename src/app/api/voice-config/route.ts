import { NextResponse } from "next/server";

import { readVoiceConfig } from "@/lib/atlas/server/model-registry";
import { resolveConfiguredSttModel, resolveConfiguredTtsTarget, LOCAL_PIPER_TTS_ID } from "@/lib/atlas/server/voice-routing";
import { isPiperAvailable } from "@/lib/atlas/server/piper-tts";
import { getAtlasActor } from "@/lib/atlas/server/auth";
import { resolveVoiceBudget } from "@/lib/atlas/server/voice-caps";
import { getProfileSnapshot } from "@/lib/atlas/profile/service";

export const dynamic = "force-dynamic";


/** Public voice config for the chat mic/speak path (no secrets). */
export async function GET() {
  const [voice, sttModel, ttsTarget, piperAvailable, actor] = await Promise.all([
    readVoiceConfig(),
    resolveConfiguredSttModel(),
    resolveConfiguredTtsTarget(),
    isPiperAvailable(),
    getAtlasActor(),
  ]);

  const [budget, profile] = await Promise.all([resolveVoiceBudget(actor), getProfileSnapshot(actor.userId)]);

  return NextResponse.json({
    voice: {
      sttLanguage: voice.sttLanguage,
      ttsRate: voice.ttsRate,
      ttsPitch: voice.ttsPitch,
      sttModelId: voice.sttModelId || sttModel?.id || "",
      ttsModelId: voice.ttsModelId || LOCAL_PIPER_TTS_ID,
      sttMode: voice.sttMode,
      ttsMode: voice.ttsMode,
      dailyVoiceLimitMinutes: voice.dailyVoiceLimitMinutes,
      voiceEnabled: profile.voiceEnabled,
    },
    budget: {
      capped: budget.capped,
      allowed: budget.allowed,
      remainingSeconds:
        budget.remainingSeconds === Number.POSITIVE_INFINITY ? null : budget.remainingSeconds,
      limitMinutes: budget.limitMinutes,
    },
    status: {
      sttReady: Boolean(sttModel),
      ttsReady: Boolean(ttsTarget) && (ttsTarget?.kind === "model" || piperAvailable),
      sttModelLabel: sttModel?.label || sttModel?.id || null,
      ttsTarget:
        ttsTarget?.kind === "piper"
          ? `piper:${ttsTarget.voice}`
          : ttsTarget?.kind === "model"
            ? ttsTarget.model.id
            : null,
    },
  });
}
