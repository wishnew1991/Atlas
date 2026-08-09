import { AtlasAdminLoginGate } from "@/components/atlas/atlas-admin-shell";

export const metadata = {
  title: "Admin login | Atlas",
};

export const runtime = "edge";

export default function AdminLoginPage() {
  return <AtlasAdminLoginGate />;
}