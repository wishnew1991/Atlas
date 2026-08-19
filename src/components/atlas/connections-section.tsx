"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IntegrationAvatar } from "./integration-avatar";
import { LoginHandoffCard } from "./login-handoff-card";
import { useToast } from "@/components/ui/ToastProvider";

interface Connection {
  id: string;
  integrationId: string;
  integrationName: string;
  transport: string;
  capabilities: string[];
  displayName: string | null;
  status: string;
  authMethod: string;
  scopes: string[];
  tokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AvailableIntegration {
  integrationId: string;
  integrationName: string;
  capabilities: string[];
  authMethod: string;
  transport: string;
}

interface HandoffState {
  integrationId: string;
  integrationName: string;
  handoffUrl: string;
  expiresAt?: string | null;
}

const CAPABILITY_LABELS: Record<string, string> = {
  food: "Food & dining",
  ride: "Rides",
  rides: "Rides",
  travel: "Travel",
  shopping: "Shopping",
  appointments: "Appointments",
  payments: "Payments",
  calendar: "Calendar",
  email: "Email",
  documents: "Documents",
  messaging: "Messaging",
  communication: "Communication",
  web: "Web",
  investing: "Investing",
  "market-data": "Market data",
};

const TRANSPORT_LABELS: Record<string, { label: string; tone: string }> = {
  mcp: { label: "API", tone: "blue" },
  rest: { label: "API", tone: "blue" },
  sdk: { label: "API", tone: "blue" },
  graphql: { label: "API", tone: "blue" },
  browser: { label: "Browser", tone: "amber" },
};

const STATUS_META: Record<
  string,
  { label: string; badge: string }
> = {
  active: { label: "Connected", badge: "atlas-badge--green" },
  expired: { label: "Session expired", badge: "atlas-badge--amber" },
  revoked: { label: "Revoked", badge: "atlas-badge--red" },
};

function capabilityChips(ids: string[]): string[] {
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const id of ids) {
    const label = CAPABILITY_LABELS[id];
    if (label && !seen.has(label)) {
      seen.add(label);
      chips.push(label);
    }
  }
  return chips.length > 0 ? chips.slice(0, 2) : [];
}

function transportMeta(transport: string) {
  return TRANSPORT_LABELS[transport] ?? { label: "API", tone: "blue" };
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: "Disconnected", badge: "atlas-badge--blue" };
}

// ── Error banner ─────────────────────────────────────────────────────────────
function ConnectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="atlas-banner atlas-banner--error" role="alert">
      <span className="atlas-banner__dot" aria-hidden="true" />
      <span style={{ flex: 1 }}>{message}</span>
      <button type="button" className="atlas-inline-action" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

// ── Connected row ───────────────────────────────────────────────────────────
function ConnectedRow({
  connection,
  saving,
  confirming,
  onRequestDisconnect,
  onCancelDisconnect,
  onDisconnect,
  onReconnect,
}: {
  connection: Connection;
  saving: boolean;
  confirming: boolean;
  onRequestDisconnect: () => void;
  onCancelDisconnect: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
}) {
  const chips = capabilityChips(connection.capabilities);
  const transport = transportMeta(connection.transport);
  const status = statusMeta(connection.status);
  const needsReconnect = connection.status === "expired" || connection.status === "revoked";

  return (
    <li className="atlas-conn-row" data-conn-status={connection.status}>
      <IntegrationAvatar
        integrationId={connection.integrationId}
        name={connection.integrationName}
        size="md"
        decorative
      />
      <div className="atlas-conn-row__meta">
        <span className="atlas-conn-row__name">{connection.integrationName}</span>
        <span className="atlas-conn-row__chips">
          <span className={`atlas-conn-row__chip atlas-conn-row__chip--transport atlas-conn-row__chip--${transport.tone}`}>
            {transport.label}
          </span>
          {chips.map((chip) => (
            <span className="atlas-conn-row__chip" key={chip}>
              {chip}
            </span>
          ))}
        </span>
        {connection.scopes.length > 0 ? (
          <span className="atlas-conn-row__scopes">
            {connection.scopes.join(" · ")}
          </span>
        ) : null}
      </div>

      <div className="atlas-conn-row__side">
        <span className={`atlas-badge ${status.badge}`}>{status.label}</span>
        {confirming ? (
          <div className="atlas-conn-row__confirm">
            <button
              type="button"
              className="atlas-conn-row__keep"
              disabled={saving}
              onClick={onCancelDisconnect}
            >
              Keep
            </button>
            <button
              type="button"
              className="atlas-conn-row__disconnect"
              disabled={saving}
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          </div>
        ) : needsReconnect ? (
          <button
            type="button"
            className="atlas-conn-row__reconnect"
            disabled={saving}
            onClick={onReconnect}
          >
            Reconnect
          </button>
        ) : (
          <button
            type="button"
            className="atlas-conn-row__disconnect"
            disabled={saving}
            onClick={onRequestDisconnect}
          >
            Disconnect
          </button>
        )}
      </div>
    </li>
  );
}

// ── Discover card ───────────────────────────────────────────────────────────
function DiscoverCard({
  integrationId,
  name,
  capabilities,
  authMethod,
  transport,
  saving,
  onConnect,
  onHandoff,
}: {
  integrationId: string;
  name: string;
  capabilities: string[];
  authMethod: string;
  transport: string;
  saving: boolean;
  onConnect: (integrationId: string, apiKey?: string) => void;
  onHandoff: (integrationId: string, name: string) => void;
}) {
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const needsApiKey = authMethod.includes("api_key");
  const chips = capabilityChips(capabilities);
  const transportKind = transportMeta(transport);
  const isBrowser = transport === "browser";

  const handleConnectClick = () => {
    if (needsApiKey) {
      setShowKeyForm(true);
    } else {
      onConnect(integrationId);
    }
  };

  const handleSaveKey = () => {
    if (!apiKey.trim()) return;
    onConnect(integrationId, apiKey.trim());
    setShowKeyForm(false);
    setApiKey("");
  };

  return (
    <div className="atlas-discover-card">
      <IntegrationAvatar integrationId={integrationId} name={name} size="lg" decorative />
      <span className="atlas-discover-card__name">{name}</span>
      <span className="atlas-discover-card__chips">
        <span className={`atlas-discover-card__chip atlas-discover-card__chip--transport atlas-discover-card__chip--${transportKind.tone}`}>
          {transportKind.label}
        </span>
        {chips.map((chip) => (
          <span className="atlas-discover-card__chip" key={chip}>
            {chip}
          </span>
        ))}
      </span>

      {showKeyForm ? (
        <div className="atlas-discover-card__keyform">
          <input
            type="password"
            placeholder="Paste API key…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoFocus
          />
          <div className="atlas-discover-card__keyform-actions">
            <button
              type="button"
              className="atlas-discover-card__connect"
              disabled={saving || !apiKey.trim()}
              onClick={handleSaveKey}
            >
              Save
            </button>
            <button
              type="button"
              className="atlas-discover-card__cancel"
              onClick={() => {
                setShowKeyForm(false);
                setApiKey("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="atlas-discover-card__connect"
          disabled={saving}
          onClick={handleConnectClick}
        >
          {isBrowser ? "Login on browser" : needsApiKey && !showKeyForm ? "Add key" : "Connect"}
        </button>
      )}
    </div>
  );
}

// ── Main section ────────────────────────────────────────────────────────────
export function ConnectionsSection() {
  const { addToast } = useToast();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [available, setAvailable] = useState<AvailableIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<HandoffState | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/user/connections");
      const payload = await response.json();
      if (response.ok) {
        setConnections(payload.connections ?? []);
        setAvailable(payload.available ?? []);
      } else {
        setError(
          (payload as { error?: string }).error || "Could not load connections."
        );
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

  const connect = async (integrationId: string, withApiKey?: string) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/user/connections/${integrationId}/connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(withApiKey ? { apiKey: withApiKey } : {}),
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message =
          (payload as { error?: string }).error || "Connection failed.";
        // A handoff response is valid flow, not an error.
        const handoffUrl = (payload as { handoffUrl?: string }).handoffUrl;
        if (handoffUrl) {
          const integration = available.find((a) => a.integrationId === integrationId);
          setHandoff({
            integrationId,
            integrationName: integration?.integrationName ?? integrationId,
            handoffUrl,
            expiresAt: (payload as { expiresAt?: string | null }).expiresAt ?? null,
          });
          return;
        }
        setError(message);
        addToast(message, { kind: "error" });
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (payload && typeof payload.redirectUrl === "string") {
        const integration = available.find((a) => a.integrationId === integrationId);
        setHandoff({
          integrationId,
          integrationName: integration?.integrationName ?? integrationId,
          handoffUrl: new URL(payload.redirectUrl, window.location.origin).toString(),
          expiresAt: (payload as { expiresAt?: string | null }).expiresAt ?? null,
        });
        return;
      }
      if (payload && typeof payload.handoffUrl === "string") {
        const integration = available.find((a) => a.integrationId === integrationId);
        setHandoff({
          integrationId,
          integrationName: integration?.integrationName ?? integrationId,
          handoffUrl: payload.handoffUrl,
          expiresAt: (payload as { expiresAt?: string | null }).expiresAt ?? null,
        });
        return;
      }
      setConfirmingId(null);
      addToast("Connected", { kind: "success" });
      void refresh();
    } catch {
      const message = "Connection failed.";
      setError(message);
      addToast(message, { kind: "error" });
    } finally {
      setSaving(false);
    }
  };

  const startHandoff = (integrationId: string, integrationName: string) => {
    setError(null);
    // Browser transport connectors share the OAuth flow; the backend provides
    // a real handoff link once the connector gateway is wired.
    setHandoff({
      integrationId,
      integrationName,
      handoffUrl: `/api/user/connections/${integrationId}/oauth/start`,
    });
  };

  const disconnect = async (integrationId: string) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/user/connections/${integrationId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(
          (payload as { error?: string }).error || "Could not disconnect."
        );
        return;
      }
      setConfirmingId(null);
      addToast("Disconnected");
      void refresh();
    } catch {
      setError("Could not disconnect.");
    } finally {
      setSaving(false);
    }
  };

  const connectedIds = useMemo(
    () => new Set(connections.map((c) => c.integrationId)),
    [connections]
  );

  const availableMap = useMemo(
    () => new Map(available.map((a) => [a.integrationId, a])),
    [available]
  );

  const allCards = useMemo(
    () =>
      available
        .filter((a) => !connectedIds.has(a.integrationId))
        .map((a) => a.integrationId),
    [available, connectedIds]
  );

  if (loading) {
    return (
      <section className="atlas-profile-block">
        <div className="atlas-profile-block__head">
          <div>
            <h2 className="atlas-profile-block__title">Connections</h2>
            <p className="atlas-profile-block__lede">
              Services Atlas can use on your behalf.
            </p>
          </div>
        </div>
        <div className="atlas-conn-skeleton" aria-hidden="true">
          <div className="atlas-conn-skeleton__row" />
          <div className="atlas-conn-skeleton__row" />
          <div className="atlas-conn-skeleton__grid">
            <span />
            <span />
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
            Services Atlas can use on your behalf.
          </p>
        </div>
        {connections.length > 0 ? (
          <span className="atlas-profile__notice" role="status">
            {connections.length} connected
          </span>
        ) : null}
      </div>

      {error ? <ConnectionError message={error} onRetry={() => void refresh()} /> : null}

      {handoff ? (
        <LoginHandoffCard
          integrationId={handoff.integrationId}
          name={handoff.integrationName}
          handoffUrl={handoff.handoffUrl}
          expiresAt={handoff.expiresAt}
          onCancel={() => setHandoff(null)}
          onComplete={() => {
            setHandoff(null);
            addToast("Signed in", { kind: "success" });
            void refresh();
          }}
        />
      ) : (
        <>
          {connections.length === 0 && allCards.length === 0 ? (
            <div className="atlas-board-empty-card">
              <strong>No integrations yet</strong>
              <p>
                Connect services like Swiggy, Zomato, Uber, or Dhan to let Atlas act on
                your behalf.
              </p>
            </div>
          ) : (
            <>
              {connections.length > 0 ? (
                <div className="atlas-conn-zone">
                  <h3 className="atlas-conn-zone__title">
                    Connected
                    <span className="atlas-conn-zone__count">{connections.length}</span>
                  </h3>
                  <ul className="atlas-profile-list">
                    {connections.map((connection) => (
                      <ConnectedRow
                        key={connection.id}
                        connection={connection}
                        saving={saving}
                        confirming={confirmingId === connection.integrationId}
                        onRequestDisconnect={() =>
                          setConfirmingId(connection.integrationId)
                        }
                        onCancelDisconnect={() => setConfirmingId(null)}
                        onDisconnect={() =>
                          void disconnect(connection.integrationId)
                        }
                        onReconnect={() =>
                          void connect(connection.integrationId)
                        }
                      />
                    ))}
                  </ul>
                </div>
              ) : null}

              {allCards.length > 0 ? (
                <div className="atlas-conn-zone">
                  <h3 className="atlas-conn-zone__title">
                    Discover
                    <span className="atlas-conn-zone__count">{allCards.length}</span>
                  </h3>
                  <div className="atlas-discover-grid">
                    {allCards.map((integrationId) => {
                      const integration = availableMap.get(integrationId);
                      if (!integration) return null;
                      return (
                        <DiscoverCard
                          key={integrationId}
                          integrationId={integration.integrationId}
                          name={integration.integrationName}
                          capabilities={integration.capabilities}
                          authMethod={integration.authMethod}
                          transport={integration.transport}
                          saving={saving}
                          onConnect={connect}
                          onHandoff={startHandoff}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </>
      )}

      <p className="atlas-micro">
        Atlas never shares your credentials. You can disconnect any service at
        any time.
      </p>
    </section>
  );
}