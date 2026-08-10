import { AtlasAdminLoginGate } from "@/components/atlas/atlas-admin-shell";

export const metadata = {
  title: "Admin login | Atlas",
};


export default function AdminLoginPage() {
  return <AtlasAdminLoginGate />;
}