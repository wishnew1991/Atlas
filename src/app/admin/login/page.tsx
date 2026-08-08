import { redirect } from "next/navigation";

import { AdminLoginScreen } from "@/components/atlas/admin-login-screen";
import { getAtlasActor, isAtlasAdminActor } from "@/lib/atlas/server/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin login | Atlas",
};

export default async function AdminLoginPage() {
  const actor = await getAtlasActor();

  // A signed-in admin is already there — skip the form. A signed-in non-admin
  // still needs the form so they can sign in with the admin account (and sign
  // out via the form's session is the only logout surface outside the admin UI).
  if (actor.isAuthenticated && isAtlasAdminActor(actor)) {
    redirect("/admin");
  }

  // A signed-in non-admin can't sign in as admin without signing out first
  // (better-auth rejects a second session), and sign-out only exists in the
  // admin UI — so surface a sign-out action here.
  if (actor.isAuthenticated) {
    return <AdminLoginScreen signedInAsNonAdmin />;
  }

  return <AdminLoginScreen />;
}