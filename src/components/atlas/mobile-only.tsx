"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Atlas consumer app is mobile-first. On a non-touch / wide desktop viewport in
 * production we show a simple notice, since core flows (UPI handoff, etc.) are
 * phone-oriented. The admin control plane is exempt — operators use desktop.
 */
export function MobileOnly({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || Boolean(pathname?.startsWith("/admin/"));
  const isAuth =
    pathname === "/sign-in" ||
    Boolean(pathname?.startsWith("/sign-in/")) ||
    pathname === "/sign-up" ||
    Boolean(pathname?.startsWith("/sign-up/"));
  const [mode, setMode] = useState<"loading" | "mobile" | "desktop">(() =>
    // Dev starts unlocked so laptop preview never flashes the loading gate.
    process.env.NODE_ENV !== "production" ? "mobile" : "loading"
  );

  useEffect(() => {
    const evaluate = () => {
      const isDev = process.env.NODE_ENV !== "production";
      const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      const isNarrow = typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;
      setMode(isDev || isTouch || isNarrow ? "mobile" : "desktop");
    };

    evaluate();
    window.addEventListener("resize", evaluate);
    return () => window.removeEventListener("resize", evaluate);
  }, []);

  if (isAdmin || isAuth) {
    return (
      <div
        className={
          isAdmin ? "atlas-app-frame atlas-app-frame--admin" : "atlas-app-frame atlas-app-frame--auth"
        }
      >
        {children}
      </div>
    );
  }

  if (mode === "loading") {
    return <div className="atlas-device-check">Loading Atlas…</div>;
  }

  if (mode === "desktop") {
    return (
      <div className="atlas-device-gate">
        <div className="atlas-device-gate__icon">📱</div>
        <h1>Atlas is mobile-only</h1>
        <p>
          Atlas is designed for your phone — it redirects you to apps like Google Pay and
          PhonePe to complete payments, and shows your live order status in-app.
        </p>
        <p className="atlas-device-gate__hint">
          Please open this link on a mobile device to use Atlas.
        </p>
      </div>
    );
  }

  return <div className="atlas-app-frame">{children}</div>;
}
