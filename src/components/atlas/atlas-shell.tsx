"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AtlasDemoProvider } from "./atlas-demo-provider";
import { AtlasAuthControls } from "./atlas-auth-controls";
import { atlasTabs } from "@/lib/atlas/navigation";
import { MenuIcon, TAB_ICONS } from "./icons";

interface AtlasShellProps {
  children: ReactNode;
}

export function AtlasShell({ children }: AtlasShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const currentTitle = useMemo(() => {
    return atlasTabs.find((tab) => tab.href === pathname)?.label ?? "Atlas";
  }, [pathname]);

  const visibleTabs = atlasTabs.filter((tab) => !tab.adminOnly || clerkEnabled);

  return (
    <AtlasDemoProvider>
      <div className="atlas-app">
        <div className="atlas-shell">
          <header className="atlas-topbar">
            <button
              type="button"
              className="atlas-topbar__menu"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <MenuIcon width={18} height={18} />
            </button>
            <div className="atlas-topbar__title">{currentTitle}</div>
            <span className="atlas-topbar__spacer" aria-hidden="true" />
          </header>

          <main className="atlas-content">{children}</main>

          {/* Mobile bottom tab bar — ChatGPT-style primary navigation. */}
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

          <button
            type="button"
            className="atlas-menu-overlay"
            data-open={menuOpen ? "true" : "false"}
            aria-label="Close menu"
            aria-hidden={menuOpen ? "false" : "true"}
            tabIndex={menuOpen ? 0 : -1}
            onClick={() => setMenuOpen(false)}
          />

          <aside className="atlas-menu-drawer" data-open={menuOpen ? "true" : "false"} aria-hidden={!menuOpen}>
            <div className="atlas-menu-drawer__sheet">
              <div className="atlas-menu-drawer__top">
                <div>
                  <p className="atlas-hero__subtle">Atlas</p>
                  <h2 className="atlas-menu-drawer__title">Menu</h2>
                </div>
                <button
                  type="button"
                  className="atlas-action atlas-action--ghost atlas-menu-drawer__close"
                  onClick={() => setMenuOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="atlas-menu-drawer__section">
                <p className="atlas-menu-drawer__eyebrow">Account</p>
                {clerkEnabled ? (
                  <AtlasAuthControls />
                ) : (
                  <p className="atlas-menu-drawer__body">
                    Sign in to unlock saved memory, approvals, and cross-device sync.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AtlasDemoProvider>
  );
}
