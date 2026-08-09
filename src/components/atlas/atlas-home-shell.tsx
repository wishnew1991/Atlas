"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AssistantHome } from "@/components/atlas/assistant-home";

interface AuthStatus {
  authenticated: boolean;
  isAdmin: boolean;
  profileName: string | null;
}

export function AtlasHomeShell({ mode }: { mode: "home" | "chat" }) {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AuthStatus | null) => {
        if (cancelled) return;
        // Gateway on profileName only: the welcome flow supports guests whose
        // name is stored against their atlas-user-id cookie (no email/password).
        if (data && data.profileName) {
          setUserName(data.profileName);
        } else {
          router.replace("/welcome");
        }
      })
      .catch(() => {
        if (!cancelled) router.replace("/welcome");
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!userName) return null;

  return <AssistantHome mode={mode} userName={userName} />;
}