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
  const [googleLoading, setGoogleLoading] = useState(false);

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

      router.push("/chat"); 
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Dev login failed");
    } finally {
      setDevLoading(false);
    }
  };

  const doGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      const { data, error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: isSignIn ? signInRedirectTo : signUpRedirectTo,
      });
      if (error) {
        throw new Error(error.message || "Google sign in failed");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong with Google SSO");
      setGoogleLoading(false);
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

        <button
          type="button"
          onClick={doGoogleLogin}
          disabled={googleLoading || loading}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            gap: "10px",
            padding: "10px 16px",
            backgroundColor: "#ffffff",
            color: "#3c4043",
            border: "1px solid #dadce0",
            borderRadius: "6px",
            fontSize: "15px",
            fontWeight: "500",
            cursor: "pointer",
            transition: "background-color 0.2s, box-shadow 0.2s",
            marginBottom: "16px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#f8f9fa";
            e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "#ffffff";
            e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)";
          }}
        >
          {googleLoading ? (
            "Connecting to Google..."
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2400/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div className="atlas-auth-screen__divider">
          <span>or continue with email</span>
        </div>

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
          <button type="submit" className="atlas-auth-screen__submit" disabled={loading || googleLoading}>
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
