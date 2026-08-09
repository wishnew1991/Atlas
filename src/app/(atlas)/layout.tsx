import type { ReactNode } from "react";

import { AtlasShell } from "@/components/atlas/atlas-shell";
import { ProfileGateProvider } from "@/components/atlas/profile-gate-provider";

export default function AtlasLayout({ children }: { children: ReactNode }) {
  return (
    <AtlasShell>
      <ProfileGateProvider>{children}</ProfileGateProvider>
    </AtlasShell>
  );
}
