"use client";

import { useState } from "react";
import Image from "next/image";

import {
  integrationBranding,
  type IntegrationBranding,
} from "@/lib/atlas/integrations/logos";

interface IntegrationAvatarProps {
  integrationId: string;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg";
  decorative?: boolean;
}

const SIZE_CONFIG = {
  xs: { className: "atlas-avatar--xs", px: 24 },
  sm: { className: "atlas-avatar--sm", px: 28 },
  md: { className: "atlas-avatar--md", px: 34 },
  lg: { className: "atlas-avatar--lg", px: 40 },
} as const;

function letterFallback(name: string | undefined, integrationId: string) {
  if (name) return name.slice(0, 1).toUpperCase();
  return integrationId.slice(0, 1).toUpperCase();
}

function GenericIcon() {
  return (
    <svg
      className="atlas-avatar__generic"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  );
}

export function IntegrationAvatar({
  integrationId,
  name,
  size = "md",
  decorative = false,
}: IntegrationAvatarProps) {
  const branding: IntegrationBranding | undefined =
    integrationBranding[integrationId];
  const [failedSvgs, setFailedSvgs] = useState<Set<string>>(new Set());
  const [failedPngs, setFailedPngs] = useState<Set<string>>(new Set());

  const svgSrc = branding?.logo;
  const pngSrc = branding?.png;

  const svgLoaded = svgSrc != null && !failedSvgs.has(svgSrc);
  const pngLoaded =
    (!svgSrc || failedSvgs.has(svgSrc)) &&
    pngSrc != null &&
    !failedPngs.has(pngSrc);
  const showFallback = !svgLoaded && !pngLoaded;

  const letter = letterFallback(name, integrationId);
  const altText = decorative ? undefined : `${name ?? integrationId} logo`;

  let content: React.ReactNode;
  if (svgLoaded) {
    content = (
      <Image
        className="atlas-avatar__img"
        src={svgSrc}
        alt={altText ?? ""}
        width={SIZE_CONFIG[size].px}
        height={SIZE_CONFIG[size].px}
        unoptimized
        role={decorative ? "presentation" : undefined}
        onError={() =>
          setFailedSvgs((prev) => new Set(prev).add(svgSrc!))
        }
      />
    );
  } else if (pngLoaded) {
    content = (
      <Image
        className="atlas-avatar__img"
        src={pngSrc}
        alt={altText ?? ""}
        width={SIZE_CONFIG[size].px}
        height={SIZE_CONFIG[size].px}
        unoptimized
        role={decorative ? "presentation" : undefined}
        onError={() =>
          setFailedPngs((prev) => new Set(prev).add(pngSrc!))
        }
      />
    );
  } else if (showFallback && letter) {
    content = (
      <span className="atlas-avatar__letter" aria-hidden={decorative || undefined}>
        {letter}
      </span>
    );
  } else {
    content = <GenericIcon />;
  }

  return (
    <div
      className={`atlas-avatar ${SIZE_CONFIG[size].className} ${
        showFallback ? "atlas-avatar--fallback" : "atlas-avatar--image"
      }`}
      role={decorative ? "presentation" : "img"}
      aria-label={decorative ? undefined : altText}
    >
      {content}
    </div>
  );
}
