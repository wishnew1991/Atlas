"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminLoginScreen } from "@/components/atlas/admin-login-screen";
import { AtlasAdmin } from "@/components/atlas/atlas-admin";

interface AuthStatus {
  authenticated: boolean;
  isAdmin: boolean;
  profileName: string | null;
}

interface StatusState {
  status: "loading" | AuthStatus;
}

function useAuthStatus(): StatusState {
  const [state, setState] = useState<StatusState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setState({
          status: {
            authenticated: Boolean(data?.authenticated),
            isAdmin: Boolean(data?.isAdmin),
            profileName: typeof data?.profileName === "string" ? data.profileName : null,
          },
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: { authenticated: false, isAdmin: false, profileName: null } });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** Client gate for /admin — redirects non-admins to /chat. */
export function AtlasAdminGate() {
  const router = useRouter();
  const { status } = useAuthStatus();

  useEffect(() => {
    if (status !== "loading" && !status.isAdmin) router.replace("/chat");
  }, [status, router]);

  if (status === "loading") return null;
  if (!status.isAdmin) return null;

  return <AtlasAdmin />;
}

/** Client gate for /admin/login — mirrors the old server redirects. */
export function AtlasAdminLoginGate() {
  const router = useRouter();
  const { status } = useAuthStatus();

  useEffect(() => {
    if (status !== "loading" && status.isAdmin) router.replace("/admin");
  }, [status, router]);

  if (status === "loading") return null;
  if (status.isAdmin) return null;

  if (status.authenticated) return <AdminLoginScreen signedInAsNonAdmin />;

  return <AdminLoginScreen />;
}