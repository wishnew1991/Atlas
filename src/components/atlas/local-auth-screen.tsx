"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AuthMode = "sign-in" | "sign-up";

export function LocalAuthScreen({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const isSignIn = mode === "sign-in";
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
      // Try sign in first
      let res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "dev@atlas.local", password: "atlas-dev-2024" }),
      });

      if (!res.ok) {
        // Create dev account
        await fetch("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Developer", email: "dev@atlas.local", password: "atlas-dev-2024" }),
        });
        // Sign in
        res = await fetch("/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "dev@atlas.local", password: "atlas-dev-2024" }),
        });
      }

      if (!res.ok) throw new Error("Dev login failed");

      router.push("/chat");
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
        const res = await fetch("/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Sign in failed");
        }

        router.push("/chat");
        router.refresh();
      } else {
        const res = await fetch("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Sign up failed");
        }

        router.push("/welcome");
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
          {isSignIn ? "Welcome back" : "Create your account"}
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

        {isSignIn ? (
          <div className="atlas-auth-screen__divider">
            <span>dev</span>
          </div>
        ) : null}
        {isSignIn ? (
          <button
            type="button"
            className="atlas-auth-screen__guest"
            onClick={doDevLogin}
            disabled={devLoading}
          >
            {devLoading ? "Logging in..." : "Dev Login →"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
