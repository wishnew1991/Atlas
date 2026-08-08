import { redirect } from "next/navigation";

import { AssistantHome } from "@/components/atlas/assistant-home";
import { getAtlasActor } from "@/lib/atlas/server/auth";
import { prisma } from "@/lib/atlas/server/prisma";

export default async function AtlasHomePage() {
  const actor = await getAtlasActor();
  if (actor.isAuthenticated) {
    const profile = await prisma.userProfile.findUnique({ where: { userId: actor.userId } });
    if (!profile) redirect("/welcome");
  }

  return <AssistantHome mode="home" />;
}
