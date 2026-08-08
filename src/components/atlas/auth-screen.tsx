"use client";

import { LocalAuthScreen } from "./local-auth-screen";

type AuthMode = "sign-in" | "sign-up";

export function AuthScreen({ mode }: { mode: AuthMode }) {
  return <LocalAuthScreen mode={mode} />;
}
