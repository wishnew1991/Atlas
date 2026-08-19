"use client";

import { useMemo, useState } from "react";

import type { IntegrationDefinition } from "@/lib/atlas/integrations/types";

export interface RecipeVersion {
  version: string;
  health: "healthy" | "degraded" | "unbuilt";
  updatedAt: string;
  note: string;
}

export interface RecipeStub {
  id: string;
  connectorId: string;
  connectorName: string;
  capability: string;
  versions: RecipeVersion[];
}

const RECIPE_SKELETON: Array<{ id: string; capability: string; versions: RecipeVersion[] }> = [
  {
    id: "order-food",
    capability: "food",
    versions: [
      { version: "1.0.0", health: "healthy", updatedAt: "2026-08-02T10:00:00Z", note: "Menu browse, cart, checkout happy path" },
      { version: "0.9.2", health: "degraded", updatedAt: "2026-07-19T10:00:00Z", note: "Coupon application flaky" },
      { version: "0.8.0", health: "unbuilt", updatedAt: "2026-06-30T10:00:00Z", note: "Draft — no browser selectors yet" },
    ],
  },
  {
    id: "book-travel",
    capability: "travel",
    versions: [
      { version: "0.6.0", health: "unbuilt", updatedAt: "2026-07-25T10:00:00Z", note: "Flight search selectors drafted" },
    ],
  },
  {
    id: "shop-products",
    capability: "shopping",
    versions: [
      { version: "1.2.0", health: "healthy", updatedAt: "2026-08-05T10:00:00Z", note: "Search, filter, add-to-cart" },
      { version: "1.1.0", health: "degraded", updatedAt: "2026-07-11T10:00:00Z", note: "Checkout page changed upstream" },
    ],
  },
];

/**
 * Recipes placeholder. Recipes are versioned browser-automation playbooks that
 * the Browser transport will run (later). This scaffolds the tab with recipe
 * versions + health; real recipe bodies arrive with the backend gateway.
 */
export function ConnectorRecipesPanel({
  integrations,
}: {
  integrations: IntegrationDefinition[];
}) {
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);

  const recipes = useMemo<RecipeStub[]>(() => {
    const byId = new Map(integrations.map((i) => [i.id, i]));
    return RECIPE_SKELETON.map((recipe) => {
      const connector = byId.get(recipe.id);
      const fallbackConnector = integrations.find((i) =>
        i.capabilities.some((c) => c.capabilityId === recipe.capability)
      );
      const owner = connector ?? fallbackConnector;
      return {
        id: recipe.id,
        connectorId: owner?.id ?? recipe.id,
        connectorName: owner?.name ?? recipe.id,
        capability: recipe.capability,
        versions: recipe.versions,
      };
    });
  }, [integrations]);

  const healthyCount = recipes.flatMap((r) => r.versions).filter((v) => v.health === "healthy").length;
  const totalVersions = recipes.flatMap((r) => r.versions).length;

  return (
    <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Browser automation</p>
          <h2 className="atlas-section__title">Recipes</h2>
          <p className="atlas-section__copy">
            Versioned browser-automation playbooks for the Browser transport. Recipes are
            scaffolded here and will be executed by the connector gateway once it ships.
          </p>
        </div>

        <div className="atlas-chip-row" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span className="atlas-badge atlas-badge--blue">{recipes.length} recipes</span>
          <span className="atlas-badge atlas-badge--green">{healthyCount} healthy versions</span>
          <span className="atlas-badge">{totalVersions} total versions</span>
        </div>

        <div className="atlas-rows">
          {recipes.length === 0 ? (
            <div className="atlas-card atlas-card--soft">
              <div className="atlas-card__title">No recipes yet</div>
              <div className="atlas-card__body">
                Recipe playbooks will appear here once the Browser transport ships.
              </div>
            </div>
          ) : (
            recipes.map((recipe) => {
              const open = openRecipeId === recipe.id;
              const latest = recipe.versions[0];
              const tone =
                latest.health === "healthy"
                  ? "atlas-badge--green"
                  : latest.health === "degraded"
                    ? "atlas-badge--amber"
                    : "atlas-badge--red";
              return (
                <div className="atlas-card" key={recipe.id} style={{ padding: 0, overflow: "hidden" }}>
                  <button
                    type="button"
                    className="atlas-admin-menu__row"
                    style={{ width: "100%", padding: "16px 18px" }}
                    onClick={() => setOpenRecipeId(open ? null : recipe.id)}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
                      <span className="atlas-admin-menu__row-label" style={{ fontWeight: 600 }}>
                        {recipe.id}
                      </span>
                      <span style={{ fontSize: "0.72rem", color: "var(--faint)" }}>
                        {recipe.connectorName} · {recipe.capability} · {recipe.versions.length} version{recipe.versions.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className={`atlas-badge ${tone}`} style={{ fontSize: "0.62rem" }}>
                        v{latest.version}
                      </span>
                      <span className="atlas-admin-menu__row-arrow">→</span>
                    </div>
                  </button>

                  {open ? (
                    <div style={{ borderTop: "1px solid var(--line)", padding: "12px 18px 16px" }}>
                      <div className="atlas-llm-log__inspector-grid">
                        {recipe.versions.map((version) => {
                          const versionTone =
                            version.health === "healthy"
                              ? "atlas-badge--green"
                              : version.health === "degraded"
                                ? "atlas-badge--amber"
                                : "atlas-badge--red";
                          return (
                            <div key={version.version} className="atlas-llm-log__inspector-item" style={{ gridColumn: "1 / -1", alignItems: "flex-start" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span className="atlas-badge" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
                                    v{version.version}
                                  </span>
                                  <span className={`atlas-badge ${versionTone}`} style={{ fontSize: "0.62rem" }}>
                                    {version.health}
                                  </span>
                                  <span className="atlas-micro" style={{ marginLeft: "auto" }}>
                                    {new Date(version.updatedAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <span className="atlas-micro">{version.note}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="atlas-micro" style={{ marginTop: 12 }}>
                        Recipe body (browser steps, selectors, approval policy) lands with the
                        Browser transport backend.
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}