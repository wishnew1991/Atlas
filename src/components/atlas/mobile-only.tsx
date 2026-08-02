"use client";

import { useEffect, useState } from "react";

/**
 * Atlas is a mobile-only application. On a non-touch / wide (desktop) viewport
 * we show a simple notice instead of the app, since core flows (UPI app
 * redirection, native payment) only make sense on a phone.
 */
export function MobileOnly({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<"loading" | "mobile" | "desktop">("loading");

  useEffect(() => {
    const evaluate = () => {
      // In development we allow desktop preview so the app can be tested on a
      // laptop. Production enforces the mobile-only rule for real users.
      const isDev = process.env.NODE_ENV !== "production";
      const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      const isNarrow = typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;
      setMode(isDev || isTouch || isNarrow ? "mobile" : "desktop");
    };

    evaluate();
    window.addEventListener("resize", evaluate);
    return () => window.removeEventListener("resize", evaluate);
  }, []);

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
