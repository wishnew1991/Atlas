import type { ReactNode } from "react";

import { AtlasShell } from "@/components/atlas/atlas-shell";

export default function AtlasLayout({ children }: { children: ReactNode }) {
  return <AtlasShell>{children}</AtlasShell>;
}
