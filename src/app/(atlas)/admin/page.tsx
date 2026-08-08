import { redirect } from "next/navigation";

import { AtlasAdmin } from "@/components/atlas/atlas-admin";
import { getAtlasActor, isAtlasAdminActor } from "@/lib/atlas/server/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const actor = await getAtlasActor();

  if (!isAtlasAdminActor(actor)) {
    redirect("/chat");
  }

  return <AtlasAdmin />;
}
