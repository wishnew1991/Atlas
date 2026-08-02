"use client";

import { LocalAuthScreen } from "./local-auth-screen";

type AuthMode = "sign-in" | "sign-up";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function AuthScreen({ mode }: { mode: AuthMode }) {
  if (!clerkEnabled) {
    return <LocalAuthScreen mode={mode} />;
  }

  // Lazy require keeps Clerk out of the local-auth bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ClerkAuthScreen } = require("./clerk-auth-screen") as typeof import("./clerk-auth-screen");
  return <ClerkAuthScreen mode={mode} />;
}
