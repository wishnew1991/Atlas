import { resolveVoiceContextForUser } from "@/lib/atlas/server/agent/prompts";
import { isPiperAvailable } from "@/lib/atlas/server/piper-tts";
import { resolveConfiguredTtsTarget } from "@/lib/atlas/server/voice-routing";

async function main() {
  console.log("piper:", await isPiperAvailable());
  console.log("target:", JSON.stringify(await resolveConfiguredTtsTarget()));
  console.log("=== voiceContext ===");
  console.log(await resolveVoiceContextForUser("anonymous"));
}
void main();
