import type { ReactNode } from "react";

import { ClerkProvider } from "@clerk/nextjs";

export function AtlasAuthProvider({ children }: { children: ReactNode }) {
  const clerkConfigured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );

  if (!clerkConfigured) {
    return children;
  }

  return <ClerkProvider>{children}</ClerkProvider>;
}
