"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

interface LocalAuthScreenProps {
  mode: AuthMode;
  redirectTo?: string;
  hideSignupLink?: boolean;
  hideDevLogin?: boolean;
  title?: string;
}

export function LocalAuthScreen({
  mode,
  redirectTo,
  hideSignupLink = false,
  hideDevLogin = false,
  title,
}: LocalAuthScreenProps) {
  const router = useRouter();
  const isSignIn = mode === "sign-in";
  const signInRedirectTo = redirectTo ?? "/";
  const signUpRedirectTo = redirectTo ?? "/";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);

  const doDevLogin = async () => {
    setError("");
    setDevLoading(true);
    try {
      let { error: signInError } = await authClient.signIn.email({
        email: "dev@atlas.local",
        password: "Atlas@2026",
      });

      if (signInError) {
        // Create dev account
        await authClient.signUp.email({
          name: "Developer",
          email: "dev@atlas.local",
          password: "Atlas@2026",
        });
        
        // Sign in again
        const { error: retryError } = await authClient.signIn.email({
          email: "dev@atlas.local",
          password: "Atlas@2026",
        });
        
        if (retryError) throw new Error(retryError.message || "Dev login failed");
      }

      router.push("/chat"); // For Dev login, we can redirect to /chat or / as preferred. Let's keep /chat.
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Dev login failed");
    } finally {
      setDevLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignIn) {
        const { error: signInError } = await authClient.signIn.email({
          email,
          password,
        });

        if (signInError) {
          throw new Error(signInError.message || "Sign in failed");
        }

        router.push(signInRedirectTo);
        router.refresh();
      } else {
        const { error: signUpError } = await authClient.signUp.email({
          name,
          email,
          password,
        });

        if (signUpError) {
          throw new Error(signUpError.message || "Sign up failed");
        }

        router.push(signUpRedirectTo);
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="atlas-auth-screen">
      <div className="atlas-auth-screen__panel">
        <span className="atlas-auth-screen__brand">Atlas</span>
        <h1 className="atlas-auth-screen__title">
          {title ?? (isSignIn ? "Welcome back" : "Create your account")}
        </h1>

        {error ? (
          <div className="atlas-auth-screen__building-banner" style={{ background: "rgba(248,81,73,0.15)" }}>
            <span>{error}</span>
          </div>
        ) : null}

        <form className="atlas-auth-screen__form" onSubmit={handleSubmit}>
          {!isSignIn ? (
            <label className="atlas-auth-screen__field">
              <span>Name</span>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          ) : null}
          <label className="atlas-auth-screen__field">
            <span>Email</span>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="atlas-auth-screen__field">
            <span>Password</span>
            <input
              type="password"
              placeholder={isSignIn ? "Your password" : "Create a password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <button type="submit" className="atlas-auth-screen__submit" disabled={loading}>
            {loading ? "Please wait..." : isSignIn ? "Sign in" : "Create account"}
          </button>
        </form>

        {!hideSignupLink ? (
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
        ) : null}

        {isSignIn && !hideDevLogin ? (
          <>
            <div className="atlas-auth-screen__divider">
              <span>dev</span>
            </div>
            <button
              type="button"
              className="atlas-auth-screen__guest"
              onClick={doDevLogin}
              disabled={devLoading}
            >
              {devLoading ? "Logging in..." : "Dev Login →"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
