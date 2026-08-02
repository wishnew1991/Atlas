"use client";

import type { ReactNode } from "react";

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

export function AtlasAuthProvider({ children }: { children: ReactNode }) {
  if (!clerkConfigured) {
    return <>{children}</>;
  }

  // Lazy require so projects without Clerk keys never load the Clerk bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ClerkProvider } = require("@clerk/nextjs") as typeof import("@clerk/nextjs");
  return <ClerkProvider>{children}</ClerkProvider>;
}
