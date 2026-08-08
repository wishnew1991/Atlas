"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AtlasAuthControls() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } finally {
      router.push("/sign-in");
      router.refresh();
    }
  };

  return (
    <div className="atlas-auth-controls">
      <div className="atlas-auth-controls__account">
        <span>Account</span>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="atlas-auth-controls__sign-in"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
