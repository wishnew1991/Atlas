"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

import { LocalAuthScreen } from "./local-auth-screen";

interface AdminLoginScreenProps {
  signedInAsNonAdmin?: boolean;
}

export function AdminLoginScreen({ signedInAsNonAdmin }: AdminLoginScreenProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  };

  if (signedInAsNonAdmin) {
    return (
      <div className="atlas-auth-screen">
        <div className="atlas-auth-screen__panel">
          <span className="atlas-auth-screen__brand">Atlas</span>
          <h1 className="atlas-auth-screen__title">Admin access</h1>
          <div className="atlas-auth-screen__building-banner">
            <span>
              You&apos;re signed in with a regular (non-admin) account. Sign out to
              continue to admin access.
            </span>
          </div>
          <button
            type="button"
            className="atlas-auth-screen__submit"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <LocalAuthScreen
      mode="sign-in"
      redirectTo="/admin"
      hideSignupLink
      hideDevLogin
      title="Admin access"
    />
  );
}