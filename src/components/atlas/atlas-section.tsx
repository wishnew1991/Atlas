import type { ReactNode } from "react";

interface AtlasSectionProps {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}

export function AtlasSection({
  eyebrow,
  title,
  description,
  children,
}: AtlasSectionProps) {
  return (
    <section className="atlas-section">
      <div className="atlas-section__header">
        {eyebrow ? <p className="atlas-section__eyebrow">{eyebrow}</p> : null}
        <h2 className="atlas-section__title">{title}</h2>
        {description ? (
          <p className="atlas-section__copy">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
