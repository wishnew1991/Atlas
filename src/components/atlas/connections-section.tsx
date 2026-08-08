"use client";

import { useCallback, useEffect, useState } from "react";

import { IntegrationAvatar } from "@/components/atlas/integration-avatar";

interface Connection {
  id: string;
  integrationId: string;
  integrationName: string;
  transport: string;
  capabilities: string[];
  displayName: string | null;
  status: string;
  authMethod: string;
  tokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AvailableIntegration {
  integrationId: string;
  integrationName: string;
  capabilities: string[];
  authMethod: string;
}

export function ConnectionsSection() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [available, setAvailable] = useState<AvailableIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [keyFormOpen, setKeyFormOpen] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/user/connections");
      const payload = await response.json();
      if (response.ok) {
        setConnections(payload.connections ?? []);
        setAvailable(payload.available ?? []);
      } else {
        setError((payload as { error?: string }).error || "Could not load connections.");
      }
    } catch {
      setError("Could not reach connections service.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const connect = async (integrationId: string, withApiKey?: string) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/user/connections/${integrationId}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withApiKey ? { apiKey: withApiKey } : {}),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError((payload as { error?: string }).error || "Could not connect.");
        return;
      }
      setKeyFormOpen(null);
      setApiKey("");
      setNotice("Connected.");
      void refresh();
    } catch {
      setError("Could not connect.");
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async (integrationId: string) => {
    if (!window.confirm("Disconnect this service?")) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/user/connections/${integrationId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError((payload as { error?: string }).error || "Could not disconnect.");
        return;
      }
      setNotice("Disconnected.");
      void refresh();
    } catch {
      setError("Could not disconnect.");
    } finally {
      setSaving(false);
    }
  };

  const connectedIds = new Set(connections.map((c) => c.integrationId));

  const grouped = new Map<string, { connected: Connection[]; available: AvailableIntegration[] }>();
  for (const conn of connections) {
    for (const cap of conn.capabilities) {
      if (!grouped.has(cap)) grouped.set(cap, { connected: [], available: [] });
      grouped.get(cap)!.connected.push(conn);
    }
  }
  for (const avail of available) {
    for (const cap of avail.capabilities) {
      if (!grouped.has(cap)) grouped.set(cap, { connected: [], available: [] });
      grouped.get(cap)!.available.push(avail);
    }
  }

  if (loading) {
    return (
      <section className="atlas-profile-block">
        <div className="atlas-profile-block__head">
          <div>
            <h2 className="atlas-profile-block__title">Connections</h2>
            <p className="atlas-profile-block__lede">Loading your connected services…</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="atlas-profile-block">
      <div className="atlas-profile-block__head">
        <div>
          <h2 className="atlas-profile-block__title">Connections</h2>
          <p className="atlas-profile-block__lede">
            Services Atlas can use on your behalf. Connect your accounts to let Atlas act for you.
          </p>
        </div>
        {connections.length > 0 ? (
          <span className="atlas-profile__notice" role="status">
            {notice ?? `${connections.length} connected`}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="atlas-board-empty atlas-board-empty--error" role="alert">{error}</p>
      ) : null}

      {grouped.size === 0 ? (
        <p className="atlas-profile-empty">No integrations available yet. Check back soon.</p>
      ) : (
        Array.from(grouped.entries()).map(([capability, groupData]) => (
          <div key={capability} className="atlas-profile-connections-group">
            <p className="atlas-profile-connections-capability">{capability}</p>
            <ul className="atlas-profile-list">
              {groupData.connected.map((conn) => (
                <li className="atlas-profile-list__item" key={conn.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <IntegrationAvatar integrationId={conn.integrationId} name={conn.integrationName} size="sm" decorative />
                    <div className="atlas-profile-list__meta">
                      <span className="atlas-profile-list__title">{conn.integrationName}</span>
                      <span className="atlas-profile-list__body">
                        {conn.status === "active" ? "Connected" : conn.status}
                        {conn.authMethod ? ` · ${conn.authMethod}` : ""}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="atlas-profile-list__remove"
                    disabled={saving}
                    onClick={() => void disconnect(conn.integrationId)}
                  >
                    Disconnect
                  </button>
                </li>
              ))}
              {groupData.available.filter((a: AvailableIntegration) => !connectedIds.has(a.integrationId)).map((avail: AvailableIntegration) => (
                <li className="atlas-profile-list__item" key={avail.integrationId}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <IntegrationAvatar integrationId={avail.integrationId} name={avail.integrationName} size="sm" decorative />
                    <div className="atlas-profile-list__meta">
                      <span className="atlas-profile-list__title">{avail.integrationName}</span>
                      <span className="atlas-profile-list__body">Not connected · {avail.authMethod}</span>
                    </div>
                  </div>
                  {keyFormOpen === avail.integrationId ? (
                    <div className="atlas-profile-composer">
                      <input
                        className="atlas-assistant__composer-value"
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="API key"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="atlas-action atlas-action--primary atlas-action--small"
                        disabled={saving || !apiKey.trim()}
                        onClick={() => void connect(avail.integrationId, apiKey.trim())}
                        style={{ marginLeft: 8 }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="atlas-inline-action"
                        onClick={() => { setKeyFormOpen(null); setApiKey(""); }}
                        style={{ marginLeft: 4 }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="atlas-profile-list__remove"
                      style={{ color: "var(--green)" }}
                      disabled={saving}
                      onClick={() => {
                        if (avail.authMethod.includes("api_key")) {
                          setKeyFormOpen(avail.integrationId);
                        } else {
                          void connect(avail.integrationId);
                        }
                      }}
                    >
                      Connect
                    </button>
                  )}
                </li>
              ))}
              {/* Preferred toggle placeholder */}
              {groupData.connected.length > 0 ? (
                <li className="atlas-profile-list__item">
                  <div className="atlas-profile-list__meta">
                    <span className="atlas-profile-list__title">Preferred integration</span>
                    <span className="atlas-profile-list__body">Choose which service Atlas uses by default</span>
                  </div>
                  <button
                    type="button"
                    className="atlas-toggle"
                    role="switch"
                    aria-checked="false"
                    aria-label="Preferred integration"
                    disabled
                  >
                    <span className="atlas-toggle__thumb" />
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        ))
      )}

      <p className="atlas-micro" style={{ marginTop: 8 }}>
        Atlas never shares your credentials. You can disconnect any service at any time.
      </p>
    </section>
  );
}
