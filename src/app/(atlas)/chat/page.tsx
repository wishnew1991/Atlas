import { AtlasHomeShell } from "@/components/atlas/atlas-home-shell";

export const runtime = "edge";

export default function ChatPage() {
  return <AtlasHomeShell mode="chat" />;
}