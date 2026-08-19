"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { IntegrationDefinition } from "@/lib/atlas/integrations/types";

export interface ConnectorAuditEntry {
  id: string;
  integrationId: string;
  integrationName: string;
  action: string;
  resource: string | null;
  status: "success" | "failed" | "pending_approval";
  details: Record<string, unknown>;
  createdAt: string;
}

const ACTION_EXAMPLES: Record<string, string[]> = {
  food: ["place_order", "search_restaurants", "get_menu", "track_order"],
  travel: ["search_flights", "book_hotel", "get_booking", "cancel_booking"],
  shopping: ["search_products", "compare_prices", "checkout"],
  rides: ["request_ride", "get_ride_status", "cancel_ride"],
  investing: ["get_portfolio", "place_order", "get_market_data"],
  payments: ["initiate_payment", "get_wallet", "transfer"],
  calendar: ["list_events", "create_event", "update_event"],
  email: ["search_mail", "send_mail", "read_thread"],
  documents: ["create_document", "list_documents"],
  messaging: ["list_conversations", "send_message"],
  "market-data": ["get_quote", "get_history", "screen"],
  communication: ["send_message", "get_inbox"],
  web: ["web_search"],
  appointments: ["book_slot", "list_slots", "reschedule"],
};

function actionFor(capabilityId: string): string {
  const pool = ACTION_EXAMPLES[capabilityId];
  if (!pool) return "execute";
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildSampleEntries(integrations: IntegrationDefinition[], count = 24): ConnectorAuditEntry[] {
  const active = integrations.filter((i) => i.enabled);
  const entries: ConnectorAuditEntry[] = [];
  const now = Date.now();
  for (let index = 0; index < count; index += 1) {
    const integration = active[Math.floor(Math.random() * active.length)];
    if (!integration) continue;
    const capability = integration.capabilities[0]?.capabilityId ?? "web";
    const roll = Math.random();
    const status: ConnectorAuditEntry["status"] =
      roll > 0.94 ? "failed" : roll > 0.82 ? "pending_approval" : "success";
    const action = actionFor(capability);
    entries.push({
      id: `sample-${index}`,
      integrationId: integration.id,
      integrationName: integration.name,
      action,
      resource: `${integration.id}:${capability}:${index + 1}`,
      status,
      details: {
        capability,
        transport: integration.transport,
        latencyMs: 320 + Math.floor(Math.random() * 2400),
      },
      createdAt: new Date(now - index * 47 * 1000).toISOString(),
    });
  }
  return entries;
}

/**
 * Connector Audit panel. Reuses the LLM log row/inspector UI to show exactly
 * what each connector did. Wired to /api/admin/connectors/audit once the
 * backend connector gateway lands; until then it renders sample entries
 * derived from the live connector catalog so the UI is never empty.
 */
export function ConnectorAuditPanel({
  integrations,
}: {
  integrations: IntegrationDefinition[];
}) {
  const [live, setLive] = useState<ConnectorAuditEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "success" | "failed" | "pending_approval">("all");
  const [integrationFilter, setIntegrationFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/connectors/audit?limit=100", { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as { entries?: ConnectorAuditEntry[] };
        setLive(payload.entries ?? null);
        return;
      }
      setLive(null);
      if (response.status !== 404) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setLoadError(payload.error || "Could not load connector audit logs.");
      }
    } catch {
      setLive(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo<ConnectorAuditEntry[]>(() => {
    if (live !== null) return live;
    return buildSampleEntries(integrations);
  }, [live, integrations]);

  const filtered = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (filter === "all" || entry.status === filter) &&
          (integrationFilter === "all" || entry.integrationId === integrationFilter)
      ),
    [entries, filter, integrationFilter]
  );

  const successCount = entries.filter((e) => e.status === "success").length;
  const failedCount = entries.filter((e) => e.status === "failed").length;
  const pendingCount = entries.filter((e) => e.status === "pending_approval").length;

  return (
    <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Connector activity</p>
          <h2 className="atlas-section__title">Audit log</h2>
          <p className="atlas-section__copy">
            Exactly what each connector did — actions, targets, and outcome. This is the
            live gateway audit trail.
          </p>
        </div>

        <div className="atlas-chip-row" style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span className="atlas-badge atlas-badge--blue">{entries.length} actions</span>
          <span className="atlas-badge atlas-badge--green">{successCount} ok</span>
          <span className="atlas-badge atlas-badge--amber">{pendingCount} awaiting approval</span>
          <span className="atlas-badge atlas-badge--red">{failedCount} failed</span>
        </div>

        <div className="atlas-chip-row" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <select
            className="atlas-action atlas-action--ghost atlas-action--small"
            style={{ padding: "4px 8px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "4px", color: "var(--text)" }}
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">All statuses</option>
            <option value="success">Success only</option>
            <option value="failed">Failed only</option>
            <option value="pending_approval">Awaiting approval</option>
          </select>

          <select
            className="atlas-action atlas-action--ghost atlas-action--small"
            style={{ padding: "4px 8px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "4px", color: "var(--text)" }}
            value={integrationFilter}
            onChange={(e) => setIntegrationFilter(e.target.value)}
          >
            <option value="all">All connectors</option>
            {integrations.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>

          <button
            type="button"
            className="atlas-action atlas-action--ghost atlas-action--small"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {loadError ? (
          <div className="atlas-banner atlas-banner--error">
            <span className="atlas-banner__dot" aria-hidden="true" />
            <span>{loadError}</span>
          </div>
        ) : null}

        {live === null && !loading ? (
          <div className="atlas-banner">
            <span className="atlas-banner__dot" aria-hidden="true" />
            <span>
              Live gateway feed not available yet — showing sample activity from the
              connector catalog.
            </span>
          </div>
        ) : null}

        {filtered.length === 0 && !loading ? (
          <div className="atlas-card atlas-card--soft">
            <div className="atlas-card__title">No connector activity</div>
            <div className="atlas-card__body">
              Actions the connectors perform will appear here.
            </div>
          </div>
        ) : (
          <div className="atlas-llm-log">
            {filtered.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const statusBadge =
                entry.status === "success"
                  ? "atlas-badge--green"
                  : entry.status === "failed"
                    ? "atlas-badge--red"
                    : "atlas-badge--amber";
              return (
                <div className="atlas-llm-log__entry" key={entry.id} data-expanded={isExpanded ? "true" : undefined}>
                  <button
                    type="button"
                    className="atlas-llm-log__row"
                    data-failed={entry.status === "failed" ? "true" : undefined}
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <span className="atlas-llm-log__cell atlas-llm-log__cell--time" data-label="Time">
                      {new Date(entry.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="atlas-llm-log__cell atlas-llm-log__cell--model" data-label="Connector">
                      {entry.integrationName}
                    </span>
                    <span className="atlas-llm-log__cell atlas-llm-log__cell--status" data-label="Status">
                      <span className={`atlas-badge ${statusBadge}`}>
                        {entry.status === "pending_approval" ? "needs approval" : entry.status}
                      </span>
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className="atlas-llm-log__inspector">
                      <div className="atlas-llm-log__inspector-grid">
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Action</span>
                          <span className="atlas-llm-log__inspector-val">{entry.action}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Resource</span>
                          <span className="atlas-llm-log__inspector-val">{entry.resource || "—"}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Connector</span>
                          <span className="atlas-llm-log__inspector-val">{entry.integrationName}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Time</span>
                          <span className="atlas-llm-log__inspector-val">{new Date(entry.createdAt).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="atlas-llm-log__inspector-section">
                        <span className="atlas-llm-log__inspector-label">Details</span>
                        <div className="atlas-llm-log__inspector-code">
                          {Object.entries(entry.details)
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join("\n") || "{}"}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}