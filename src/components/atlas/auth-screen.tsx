"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { SignIn, SignUp } from "@clerk/nextjs";

type AuthMode = "sign-in" | "sign-up";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const LOCAL_SESSION_COOKIE = "atlas-local-session";

function setLocalSessionCookie() {
  document.cookie = `${LOCAL_SESSION_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

/** Persist auth-form identity into profile when Clerk is not configured. */
async function syncLocalProfile(
  details: { name?: string; email?: string },
  mode: AuthMode
) {
  const body: Record<string, string> = {};
  if (details.name?.trim()) body.name = details.name.trim();
  if (details.email?.trim()) body.email = details.email.trim();
  if (Object.keys(body).length === 0) return;

  try {
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Sign-up writes the form directly; sign-in only fills blanks.
      body: JSON.stringify(
        mode === "sign-up" ? body : { op: "seed_identity", ...body }
      ),
    });
  } catch {
    // Auth still proceeds; profile can be filled later on the Profile page.
  }
}

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const isSignIn = mode === "sign-in";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const enterAppLocally = async (details: { name?: string; email?: string }) => {
    setLocalSessionCookie();
    await syncLocalProfile(details, mode);
    router.replace("/chat");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!clerkEnabled) {
      // UI-ready registry until Clerk (or custom auth) is wired.
      setSubmitting(true);
      setNotice(
        isSignIn
          ? "Continuing locally — connect Clerk keys for real sign-in."
          : "Account created locally — connect Clerk keys for real sign-up."
      );
      void enterAppLocally({
        name: isSignIn ? undefined : name,
        email,
      }).finally(() => setSubmitting(false));
      return;
    }
  };

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

        {clerkEnabled ? (
          <div className="atlas-auth-screen__clerk">
            {isSignIn ? (
              <SignIn
                routing="path"
                path="/sign-in"
                signUpUrl="/sign-up"
                fallbackRedirectUrl="/chat"
              />
            ) : (
              <SignUp
                routing="path"
                path="/sign-up"
                signInUrl="/sign-in"
                fallbackRedirectUrl="/chat"
              />
            )}
          </div>
        ) : (
          <form className="atlas-auth-screen__form" onSubmit={onSubmit}>
            {!isSignIn ? (
              <label className="atlas-auth-screen__field">
                <span>Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  required
                  placeholder="Your name"
                />
              </label>
            ) : null}
            <label className="atlas-auth-screen__field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </label>
            <label className="atlas-auth-screen__field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isSignIn ? "current-password" : "new-password"}
                placeholder="••••••••"
                minLength={8}
                required
              />
            </label>
            <button type="submit" className="atlas-auth-screen__submit" disabled={submitting}>
              {submitting ? "Continuing…" : isSignIn ? "Sign in" : "Create account"}
            </button>
            {notice ? <p className="atlas-auth-screen__notice">{notice}</p> : null}
          </form>
        )}

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
