import type { ReactNode } from "react";

type AtlasCardTone = "default" | "soft" | "dark";

interface AtlasCardProps {
  children: ReactNode;
  tone?: AtlasCardTone;
  className?: string;
}

export function AtlasCard({
  children,
  tone = "default",
  className = "",
}: AtlasCardProps) {
  return (
    <div
      className={[
        "atlas-card",
        tone === "soft" ? "atlas-card--soft" : "",
        tone === "dark" ? "atlas-card--dark" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
