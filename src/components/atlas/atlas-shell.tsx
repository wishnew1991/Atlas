"use client";

import type { ReactNode } from "react";
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
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <div className="atlas-app atlas-app--admin">
      <div className="atlas-shell atlas-shell--admin">
        <header className="atlas-admin-topbar">
          <Link href="/" className="atlas-admin-topbar__back">
            ← Back to app
          </Link>
          <div className="atlas-admin-topbar__account">
            {clerkEnabled ? <AtlasAuthControls /> : <span className="atlas-micro">Local operator</span>}
          </div>
        </header>
        <main className="atlas-content atlas-content--admin">{children}</main>
      </div>
    </div>
  );
}

function ConsumerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Consumer app only — admin stays out of primary nav.
  const visibleTabs = atlasTabs.filter((tab) => !tab.adminOnly);

  return (
    <AtlasChatProvider>
      <div className="atlas-app">
        <div className="atlas-shell atlas-shell--consumer">
          <main className="atlas-content">{children}</main>

          <nav className="atlas-bottomnav" aria-label="Primary">
            {visibleTabs.map((tab) => {
              const active = pathname === tab.href;
              const Icon = TAB_ICONS[tab.icon] ?? TAB_ICONS.home;
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
