import { redirect } from "next/navigation";

import { AssistantHome } from "@/components/atlas/assistant-home";
import { getAtlasActor } from "@/lib/atlas/server/auth";
import { prisma } from "@/lib/atlas/server/prisma";

export default async function ChatPage() {
  const actor = await getAtlasActor();
  const profile = await prisma.userProfile.findUnique({ where: { userId: actor.userId } });
  if (!profile?.name.trim()) redirect("/welcome");

  return <AssistantHome mode="chat" userName={profile.name} />;
}
