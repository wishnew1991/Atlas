"use client";

import { AssistantHome } from "@/components/atlas/assistant-home";
import { useProfileGate } from "@/components/atlas/profile-gate-provider";

export function AtlasHomeShell({ mode }: { mode: "home" | "chat" }) {
  const { profileName } = useProfileGate();

  // The ProfileGateProvider guarantees profileName is non-null by the time
  // children render, so this is a defensive fallback only.
  if (!profileName) return null;

  return <AssistantHome mode={mode} userName={profileName} />;
}