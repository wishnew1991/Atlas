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
  const [mode, setMode] = useState<"loading" | "mobile" | "desktop" | "local-frame">("loading");

  useEffect(() => {
    const evaluate = () => {
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      // Localhost previews (dev, or a local production build) are shown in a
      // centered mobile-width frame on desktop. Any deployed hostname falls
      // through to the real gate.
      const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
      const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      const isNarrow = typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;

      if (isTouch || isNarrow) {
        setMode("mobile");
      } else if (isLocal) {
        setMode("local-frame");
      } else {
        setMode("desktop");
      }
    };

    evaluate();
    window.addEventListener("resize", evaluate);
    return () => window.removeEventListener("resize", evaluate);
  }, []);

  const adminFrame = (
    <div className="atlas-app-frame atlas-app-frame--admin">{children}</div>
  );
  const authFrame = (
    <div className="atlas-app-frame atlas-app-frame--auth">{children}</div>
  );
  const consumerFrame = <div className="atlas-app-frame">{children}</div>;

  const inner = isAdmin ? adminFrame : isAuth ? authFrame : consumerFrame;

  // Admin and auth routes are always usable, but on localhost desktop we still
  // render them inside the mobile preview frame.
  if (isAdmin || isAuth) {
    if (mode === "local-frame") {
      return (
        <div className="atlas-local-preview">
          <div className="atlas-local-mobile-frame">{inner}</div>
        </div>
      );
    }
    return inner;
  }

  if (mode === "loading") {
    return <div className="atlas-device-check">Loading Atlas…</div>;
  }

  if (mode === "desktop") {
    return (
      <div className="atlas-device-gate atlas-device-gate--landing">
        <div className="atlas-device-gate__icon">📱</div>
        <h1>Atlas</h1>
        <p className="atlas-device-gate__tagline">The assistant that already knows.</p>
        <p className="atlas-device-gate__lede">
          Atlas turns a message like &ldquo;order biryani&rdquo; or &ldquo;get me an Uber on Monday&rdquo; into a plan it prepares, shows you, gets your approval for, and then completes — across food, rides, shopping, and travel.
        </p>
        <ul className="atlas-device-gate__features">
          <li><strong>Execution-first:</strong> durable plans, step runners, post-approval resume — not a chat log with tools bolted on.</li>
          <li><strong>Trust by design:</strong> explicit approvals, receipts, safety memory before any spend or booking.</li>
          <li><strong>Human-like memory:</strong> confidence-weighted preferences; suggests only when asked; explores beyond historical favorites.</li>
        </ul>
        <div className="atlas-device-gate__cta">
          <p>Atlas is designed for your phone — it redirects you to apps like Google Pay and PhonePe to complete payments, and shows your live order status in-app.</p>
          <button
            type="button"
            className="atlas-device-gate__enter"
            onClick={() => setMode("local-frame")}
          >
            Continue in desktop preview →
          </button>
          <p className="atlas-device-gate__hint">
            Best experienced on a mobile device.
          </p>
        </div>
      </div>
    );
  }

  if (mode === "local-frame") {
    return (
      <div className="atlas-local-preview">
        <div className="atlas-local-mobile-frame">{inner}</div>
      </div>
    );
  }

  return inner;
}
