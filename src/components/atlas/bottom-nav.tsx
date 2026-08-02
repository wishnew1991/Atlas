"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { atlasTabs } from "@/lib/atlas/navigation";
import { TAB_ICONS } from "./icons";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="atlas-bottom-nav" aria-label="Primary">
      <div className="atlas-bottom-nav__items">
        {atlasTabs.map((tab) => {
          const active = pathname === tab.href;
          const Icon = TAB_ICONS[tab.icon] ?? TAB_ICONS.home;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className="atlas-bottom-nav__item"
              data-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
            >
              <span className="atlas-bottom-nav__icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="atlas-bottom-nav__label">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
