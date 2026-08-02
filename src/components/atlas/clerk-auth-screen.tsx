"use client";

import Link from "next/link";
import { SignIn, SignUp } from "@clerk/nextjs";

type AuthMode = "sign-in" | "sign-up";

/** Clerk-backed auth UI — only imported when Clerk keys are present. */
export function ClerkAuthScreen({ mode }: { mode: AuthMode }) {
  const isSignIn = mode === "sign-in";

  return (
    <div className="atlas-auth-screen">
      <div className="atlas-auth-screen__panel">
        <span className="atlas-auth-screen__brand">Atlas</span>
        <h1 className="atlas-auth-screen__title">
          {isSignIn ? "Welcome back" : "Create your account"}
        </h1>
        <p className="atlas-auth-screen__subtitle">
          {isSignIn
            ? "Sign in to keep chats, approvals, and preferences with you."
            : "Register to unlock saved memory, secure approvals, and sync across devices."}
        </p>

        <div className="atlas-auth-screen__clerk">
          {isSignIn ? (
            <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/chat" />
          ) : (
            <SignUp signInUrl="/sign-in" fallbackRedirectUrl="/chat" />
          )}
        </div>

        <p className="atlas-auth-screen__switch">
          {isSignIn ? (
            <>
              New here? <Link href="/sign-up">Create an account</Link>
            </>
          ) : (
            <>
              Already have an account? <Link href="/sign-in">Sign in</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
