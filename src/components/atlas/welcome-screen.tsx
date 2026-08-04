"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

const USER_ID_COOKIE = "atlas-user-id";
const USER_NAME_COOKIE = "atlas-user-name";

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function setCookie(name: string, value: string, days = 30) {
  document.cookie = `${name}=${value}; path=/; max-age=${days * 86400}; samesite=lax`;
}

export function WelcomeScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);

    try {
      const userId = generateId();

      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "seed_identity", name: trimmed }),
      });

      setCookie(USER_ID_COOKIE, userId);
      setCookie(USER_NAME_COOKIE, trimmed);

      router.replace("/chat");
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="atlas-auth-screen">
      <div className="atlas-auth-screen__panel">
        <span className="atlas-auth-screen__brand">Atlas</span>
        <h1 className="atlas-auth-screen__title">Welcome to Atlas</h1>
        <p className="atlas-auth-screen__subtitle">
          Your personal AI assistant. {"What should Atlas call you?"}
        </p>

        <form className="atlas-auth-screen__form" onSubmit={onSubmit}>
          <label className="atlas-auth-screen__field">
            <span>Your name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="given-name"
              autoFocus
              required
              placeholder="e.g. Vishnu"
            />
          </label>
          <button
            type="submit"
            className="atlas-auth-screen__submit"
            disabled={submitting || !name.trim()}
          >
            {submitting ? "Setting up…" : "Let's go →"}
          </button>
        </form>

        <p className="atlas-auth-screen__guest-hint">
          No password. No email. Just your name.
        </p>
      </div>
    </div>
  );
}
