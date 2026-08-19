"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AtlasDemoProvider } from "./atlas-demo-provider";
import { AtlasChatProvider } from "./atlas-chat-provider";
import { AtlasAuthControls } from "./atlas-auth-controls";
import { atlasTabs } from "@/lib/atlas/navigation";
import { TAB_ICONS } from "./icons";

interface AtlasShellProps {
  children: ReactNode;
}

function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="atlas-app atlas-app--admin" style={{ background: "#0b1220", minHeight: "100vh" }}>
      <div className="atlas-shell atlas-shell--admin" style={{ display: "flex", width: "100%", height: "100dvh" }}>
        <main className="atlas-content atlas-content--admin" style={{ flex: 1, height: "100%" }}>{children}</main>
      </div>
    </div>
  );
}

function ConsumerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Consumer app only — admin stays out of primary nav.
  const visibleTabs = atlasTabs.filter((tab) => !tab.adminOnly);

  // Unread Daily Briefs surface as a badge on the Activity tab.
  const [unreadBriefs, setUnreadBriefs] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch("/api/proactive/briefs?limit=20", { cache: "no-store" });
        const payload = (await response.json()) as {
          briefs?: Array<{ acknowledgedAt: string | null }>;
        };
        if (!cancelled) {
          setUnreadBriefs((payload.briefs ?? []).filter((b) => !b.acknowledgedAt).length);
        }
      } catch {
        if (!cancelled) setUnreadBriefs(0);
      }
    };
    void tick();
    window.addEventListener("focus", tick);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", tick);
    };
  }, [pathname]);

  return (
    <AtlasChatProvider>
      <div className="atlas-app">
        <div className="atlas-shell atlas-shell--consumer">
          <main className="atlas-content">{children}</main>

          <nav className="atlas-bottomnav" aria-label="Primary">
            {visibleTabs.map((tab) => {
              const active = pathname === tab.href;
              const Icon = TAB_ICONS[tab.icon] ?? TAB_ICONS.home;
              const showBadge = tab.id === "activity" && unreadBriefs > 0;
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className="atlas-bottomnav__tab"
                  data-active={active ? "true" : "false"}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="atlas-bottomnav__icon" aria-hidden="true">
                    <Icon />
                    {showBadge ? (
                      <span className="atlas-bottomnav__badge">{unreadBriefs}</span>
                    ) : null}
                  </span>
                  <span className="atlas-bottomnav__label">{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </AtlasChatProvider>
  );
}

export function AtlasShell({ children }: AtlasShellProps) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <AtlasDemoProvider>
      {isAdmin ? <AdminShell>{children}</AdminShell> : <ConsumerShell>{children}</ConsumerShell>}
    </AtlasDemoProvider>
  );
}
