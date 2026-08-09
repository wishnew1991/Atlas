import { AtlasAdminGate } from "@/components/atlas/atlas-admin-shell";

export const runtime = "edge";

export default function AdminPage() {
  return <AtlasAdminGate />;
}