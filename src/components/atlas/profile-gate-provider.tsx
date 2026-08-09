"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────

interface ProfileGateContextValue {
  /** The current user's display name, or null while still resolving. */
  profileName: string | null;
  /** True only during the very first check (shows loading skeleton). */
  loading: boolean;
  /** Clear profile state and navigate to /sign-in (used by logout). */
  clearProfile: () => void;
}

const ProfileGateContext = createContext<ProfileGateContextValue | null>(null);

// ── Cookie helpers ─────────────────────────────────────────────────────────

const USER_NAME_COOKIE = "atlas-user-name";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(document.cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days = 30) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${days * 86400}; samesite=lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

// ── Provider ───────────────────────────────────────────────────────────────

/**
 * ProfileGateProvider gates all consumer (atlas) routes on having a profile
 * name. It uses a two-tier strategy:
 *
 * 1. **Fast tier (cookie)**: Read `atlas-user-name` cookie synchronously on
 *    mount. If it exists, render children immediately — the user already
 *    completed the welcome flow at some point.
 *
 *
 * 2. **Validation tier (API)**: In the background, call `/api/auth/status` to
 *    confirm the profile still exists in the database. If the server says the
 *    profile name is gone (e.g. account deleted) or unauthenticated, clear the cookie and redirect
 *    to /sign-in. If the server request **fails** (network, D1 cold start,
 *    timeout), do **NOT** redirect — keep showing the app with the cached name.
 *
 * This ensures `/sign-in` is only reached intentionally (new guest or logout),
 * never because of a transient infrastructure error.
 */
export function ProfileGateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // Admin routes inside the (atlas) group bypass the profile gate entirely —
  // admin users authenticate via better-auth, not the welcome flow.
  const isAdminPath =
    pathname === "/admin" || (pathname?.startsWith("/admin/") ?? false);

  // Fast gate: check cookie synchronously on first render.
  const [profileName, setProfileName] = useState<string | null>(() =>
    readCookie(USER_NAME_COOKIE)
  );
  const [loading, setLoading] = useState(() => !readCookie(USER_NAME_COOKIE));
  const [serverChecked, setServerChecked] = useState(false);

  // Background validation against the server.
  useEffect(() => {
    // Admin paths skip the consumer profile gate.
    if (isAdminPath) return;
    if (serverChecked) return;

    let cancelled = false;

    fetch("/api/auth/status")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then(
        (data: { authenticated?: boolean; profileName?: string | null } | null) => {
          if (cancelled) return;

          if (data?.authenticated && data?.profileName) {
            // Server confirmed — sync cookie + state.
            setProfileName(data.profileName);
            setCookie(USER_NAME_COOKIE, data.profileName);
          } else if (!profileName) {
            // No cookie AND server says no profile/auth → redirect to sign in.
            router.replace("/sign-in");
          } else {
            // Cookie exists but server says profile is gone or session invalid.
            // Clear stale cookie and redirect.
            deleteCookie(USER_NAME_COOKIE);
            setProfileName(null);
            router.replace("/sign-in");
          }

          setServerChecked(true);
          setLoading(false);
        }
      )
      .catch(() => {
        // Server unreachable — do NOT redirect. If we have a cookie, keep
        // using it. If we don't, show a loading/error state but still don't
        // bounce to /sign-in for a transient failure.
        if (!cancelled) {
          setLoading(false);
          setServerChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminPath]);

  const clearProfile = useCallback(() => {
    deleteCookie(USER_NAME_COOKIE);
    setProfileName(null);
    setServerChecked(false);
  }, []);

  const value = useMemo<ProfileGateContextValue>(
    () => ({ profileName, loading, clearProfile }),
    [profileName, loading, clearProfile]
  );

  // Admin paths bypass the gate entirely.
  if (isAdminPath) {
    return (
      <ProfileGateContext.Provider value={value}>
        {children}
      </ProfileGateContext.Provider>
    );
  }

  // Still loading (no cookie, waiting for server) — show loading skeleton.
  if (loading && !profileName) {
    return (
      <ProfileGateContext.Provider value={value}>
        <div className="atlas-page atlas-page--loading">
          <div className="atlas-loading-skeleton" aria-label="Loading Atlas…">
            <div className="atlas-loading-skeleton__bar" />
            <div className="atlas-loading-skeleton__bar atlas-loading-skeleton__bar--short" />
          </div>
        </div>
      </ProfileGateContext.Provider>
    );
  }

  // No profile at all and server check completed — the redirect to /sign-in
  // was already triggered above; render nothing while it navigates.
  if (!profileName) {
    return null;
  }

  return (
    <ProfileGateContext.Provider value={value}>
      {children}
    </ProfileGateContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useProfileGate(): ProfileGateContextValue {
  const ctx = useContext(ProfileGateContext);
  if (!ctx) {
    throw new Error("useProfileGate must be used within <ProfileGateProvider>");
  }
  return ctx;
}
