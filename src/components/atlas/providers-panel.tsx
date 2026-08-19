"use client";

import { useCallback, useEffect, useState } from "react";

import type { ProviderDefinition } from "@/lib/atlas/registry";

interface StatusNotice {
  kind: "ok" | "error";
  text: string;
}

const KINDS = ["mcp", "api", "sdk", "browser"];

export function ProvidersPanel() {
  const [providers, setProviders] = useState<ProviderDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    kind: "mcp" as NonNullable<ProviderDefinition["kind"]>,
    baseUrl: "",
    authType: "api_key" as NonNullable<ProviderDefinition["authType"]>,
    source: "manual" as NonNullable<ProviderDefinition["source"]>,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/providers", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) {
        setProviders(payload.providers ?? []);
        setNotice(null);
      } else {
        setNotice({ kind: "error", text: payload.error || "Could not load providers." });
      }
    } catch {
      setNotice({ kind: "error", text: "Could not load providers." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (id: string, patch: Record<string, unknown>) => {
    try {
      const response = await fetch(`/api/admin/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json();
      if (!response.ok) {
        setNotice({ kind: "error", text: payload.error || "Could not update provider." });
        return;
      }
      setProviders((prev) => prev.map((p) => (p.id === id ? payload.provider : p)));
      setNotice({ kind: "ok", text: "Provider updated." });
    } catch {
      setNotice({ kind: "error", text: "Could not update provider." });
    }
  };

  const testProvider = async (id: string) => {
    setTestingId(id);
    setNotice(null);
    try {
      const provider = providers.find((p) => p.id === id);
      let ok = false;
      if (provider?.authType === "api_key") {
        ok = Boolean(provider.credentialId);
      } else if (provider?.baseUrl) {
        const probe = await fetch(provider.baseUrl, { method: "HEAD" }).catch(() => null);
        ok = probe ? probe.ok || probe.status < 500 : false;
      } else {
        ok = provider?.authType === "none";
      }
      const response = await fetch(`/api/admin/providers/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testOk: ok }),
      });
      const payload = await response.json();
      if (response.ok && payload.provider) {
        setProviders((prev) => prev.map((p) => (p.id === id ? payload.provider : p)));
      }
      setNotice({ kind: ok ? "ok" : "error", text: ok ? "Provider reachable." : "Provider did not respond to the probe." });
    } catch {
      setNotice({ kind: "error", text: "Could not test provider." });
    } finally {
      setTestingId(null);
    }
  };

  const createProvider = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setNotice({ kind: "error", text: "Provider name is required." });
      return;
    }
    try {
      const response = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          kind: form.kind,
          baseUrl: form.baseUrl.trim() || undefined,
          authType: form.authType,
          source: form.source,
          enabled: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setNotice({ kind: "error", text: payload.error || "Could not create provider." });
        return;
      }
      setProviders((prev) => [...prev, payload.provider]);
      setCreateOpen(false);
      setForm({ name: "", kind: "mcp", baseUrl: "", authType: "api_key", source: "manual" });
      setNotice({ kind: "ok", text: "Provider created." });
    } catch {
      setNotice({ kind: "error", text: "Could not create provider." });
    }
  };

  const deleteProvider = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/providers/${id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice({ kind: "error", text: (payload as { error?: string }).error || "Could not delete provider." });
        return;
      }
      setProviders((prev) => prev.filter((p) => p.id !== id));
      setNotice({ kind: "ok", text: "Provider deleted." });
    } catch {
      setNotice({ kind: "error", text: "Could not delete provider." });
    }
  };

  const activeCount = providers.filter((p) => p.enabled).length;
  const kindCounts = providers.reduce<Record<string, number>>((acc, p) => {
    acc[p.kind] = (acc[p.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Connector infrastructure</p>
          <h2 className="atlas-section__title">Providers</h2>
          <p className="atlas-section__copy">
            Providers are the technical services behind connectors — the endpoint, auth method, and
            implementation kind that powers skills.
          </p>
        </div>

        <div className="atlas-chip-row" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span className="atlas-badge atlas-badge--blue">{providers.length} total</span>
          <span className="atlas-badge atlas-badge--green">{activeCount} enabled</span>
          {KINDS.map((kind) => (
            <span key={kind} className="atlas-badge">{kind}: {kindCounts[kind] ?? 0}</span>
          ))}
        </div>

        {notice ? (
          <div className={`atlas-banner atlas-banner--${notice.kind}`} style={{ marginBottom: 12 }}>
            <span className="atlas-banner__dot" aria-hidden="true" />
            <span>{notice.text}</span>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className="atlas-action atlas-action--primary atlas-action--small"
            onClick={() => setCreateOpen((v) => !v)}
          >
            {createOpen ? "Cancel" : "+ New provider"}
          </button>
          <button
            type="button"
            className="atlas-action atlas-action--ghost atlas-action--small"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {createOpen ? (
          <form className="atlas-card" onSubmit={createProvider} style={{ marginBottom: 16 }}>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">Name</span>
              <input
                className="atlas-assistant__composer-value"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Swiggy MCP"
                required
              />
            </label>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
              <label className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">Kind</span>
                <select
                  className="atlas-assistant__composer-value"
                  value={form.kind}
                  onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as typeof form.kind }))}
                >
                  {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">Auth type</span>
                <select
                  className="atlas-assistant__composer-value"
                  value={form.authType}
                  onChange={(e) => setForm((f) => ({ ...f, authType: e.target.value as typeof form.authType }))}
                >
                  <option value="api_key">api_key</option>
                  <option value="oauth2">oauth2</option>
                  <option value="none">none</option>
                </select>
              </label>
            </div>
            <label className="atlas-assistant__composer-field" style={{ marginTop: 10 }}>
              <span className="atlas-assistant__composer-label">Base URL (optional)</span>
              <input
                className="atlas-assistant__composer-value"
                value={form.baseUrl}
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://mcp.swiggy.com"
              />
            </label>
            <div style={{ marginTop: 12 }}>
              <button type="submit" className="atlas-action atlas-action--primary atlas-action--small">
                Create provider
              </button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div className="atlas-card atlas-card--soft"><div className="atlas-card__body">Loading providers…</div></div>
        ) : providers.length === 0 ? (
          <div className="atlas-card atlas-card--soft">
            <div className="atlas-card__title">No providers yet</div>
            <div className="atlas-card__body">Connectors need a provider behind them. Create one above or run the registry seed.</div>
          </div>
        ) : (
          <div className="atlas-rows">
            {providers.map((provider) => {
              const isExpanded = expandedId === provider.id;
              return (
                <div className="atlas-row" key={provider.id} data-expanded={isExpanded ? "true" : undefined}>
                  <div className="atlas-row__meta">
                    <div className="atlas-row__title">
                      {provider.name}
                      <span className={`atlas-badge ${provider.enabled ? "atlas-badge--green" : "atlas-badge--blue"}`} style={{ marginLeft: 8 }}>
                        {provider.enabled ? "enabled" : "disabled"}
                      </span>
                      {provider.lastTestOk != null ? (
                        <span className={`atlas-badge ${provider.lastTestOk ? "atlas-badge--green" : "atlas-badge--red"}`} style={{ marginLeft: 4 }}>
                          last test {provider.lastTestOk ? "ok" : "fail"}
                        </span>
                      ) : null}
                    </div>
                    <div className="atlas-row__body">
                      {provider.kind} · {provider.authType} · {provider.source}
                      {provider.baseUrl ? ` · ${provider.baseUrl}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="atlas-inline-action"
                      onClick={() => apply(provider.id, { enabled: !provider.enabled })}
                    >
                      {provider.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="atlas-inline-action"
                      onClick={() => testProvider(provider.id)}
                      disabled={testingId === provider.id}
                    >
                      {testingId === provider.id ? "Testing…" : "Test"}
                    </button>
                    <button
                      type="button"
                      className="atlas-inline-action"
                      onClick={() => setExpandedId(isExpanded ? null : provider.id)}
                    >
                      {isExpanded ? "Collapse" : "Detail"}
                    </button>
                    <button
                      type="button"
                      className="atlas-inline-action atlas-inline-action--danger"
                      onClick={() => deleteProvider(provider.id)}
                    >
                      Delete
                    </button>
                  </div>
                  {isExpanded ? (
                    <div className="atlas-llm-log__inspector" style={{ marginTop: 12 }}>
                      <div className="atlas-llm-log__inspector-grid">
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Provider ID</span>
                          <span className="atlas-llm-log__inspector-val">{provider.id}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Status</span>
                          <span className="atlas-llm-log__inspector-val">{provider.status}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Credential</span>
                          <span className="atlas-llm-log__inspector-val">{provider.credentialId ?? "—"}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Last tested</span>
                          <span className="atlas-llm-log__inspector-val">
                            {provider.lastTestedAt ? new Date(provider.lastTestedAt).toLocaleString() : "never"}
                          </span>
                        </div>
                        <div className="atlas-llm-log__inspector-item" style={{ gridColumn: "1 / -1" }}>
                          <span className="atlas-llm-log__inspector-label">Discovered endpoints</span>
                          <span className="atlas-llm-log__inspector-val">
                            {provider.endpoints && provider.endpoints.length > 0
                              ? provider.endpoints.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join(", ")
                              : "none"}
                          </span>
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