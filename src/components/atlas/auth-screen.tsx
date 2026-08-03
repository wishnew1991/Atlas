"use client";

import dynamic from "next/dynamic";
import { LocalAuthScreen } from "./local-auth-screen";

type AuthMode = "sign-in" | "sign-up";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const ClerkSignIn = dynamic(
  () => import("@clerk/nextjs").then((mod) => mod.SignIn),
  { ssr: false }
);

const ClerkSignUp = dynamic(
  () => import("@clerk/nextjs").then((mod) => mod.SignUp),
  { ssr: false }
);

export function AuthScreen({ mode }: { mode: AuthMode }) {
  if (!clerkEnabled) {
    return <LocalAuthScreen mode={mode} />;
  }

  return mode === "sign-in" ? <ClerkSignIn /> : <ClerkSignUp />;
}
