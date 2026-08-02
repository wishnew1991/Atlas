"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

export function AtlasAuthControls() {
  return (
    <div className="atlas-auth-controls">
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="atlas-auth-controls__sign-in">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <div className="atlas-auth-controls__account">
          <span>Account</span>
          <UserButton afterSignOutUrl="/" />
        </div>
      </SignedIn>
    </div>
  );
}
