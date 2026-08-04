"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AuthMode = "sign-in" | "sign-up";

/** Local/dev auth UI — no Clerk import (avoids webpack crash when keys are missing). */
export function LocalAuthScreen({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const isSignIn = mode === "sign-in";

  const goGuest = () => {
    router.push("/welcome");
  };

  return (
    <div className="atlas-auth-screen">
      <div className="atlas-auth-screen__panel">
        <span className="atlas-auth-screen__brand">Atlas</span>
        <h1 className="atlas-auth-screen__title">
          {isSignIn ? "Welcome back" : "Create your account"}
        </h1>

        <div className="atlas-auth-screen__building-banner">
          <span className="atlas-auth-screen__building-icon" aria-hidden="true">🚧</span>
          <span>We're in the building phase. Sign-in isn't ready yet — use the guest experience below.</span>
        </div>

        <button
          type="button"
          className="atlas-auth-screen__guest"
          onClick={goGuest}
        >
          Continue as Guest →
        </button>

        <p className="atlas-auth-screen__guest-hint">
          No email or password needed. Just tell Atlas your name.
        </p>

        <div className="atlas-auth-screen__divider">
          <span>or</span>
        </div>

        <form className="atlas-auth-screen__form atlas-auth-screen__form--disabled" onSubmit={(e) => e.preventDefault()}>
          {!isSignIn ? (
            <label className="atlas-auth-screen__field">
              <span>Name</span>
              <input
                disabled
                placeholder="Coming soon"
              />
            </label>
          ) : null}
          <label className="atlas-auth-screen__field">
            <span>Email</span>
            <input
              type="email"
              disabled
              placeholder="Coming soon"
            />
          </label>
          <label className="atlas-auth-screen__field">
            <span>Password</span>
            <input
              type="password"
              disabled
              placeholder="Coming soon"
            />
          </label>
          <button type="submit" className="atlas-auth-screen__submit" disabled>
            {isSignIn ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="atlas-auth-screen__switch">
          {isSignIn ? (
            <>
              New here? <Link href="/sign-up">Sign up</Link>
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
