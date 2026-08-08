"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IntegrationAvatar } from "./integration-avatar";
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

// ── Connected row ───────────────────────────────────────────────────────────
function ConnectedRow({
  connection,
  saving,
  confirming,
  onRequestDisconnect,
  onCancelDisconnect,
  onDisconnect,
}: {
  connection: Connection;
  saving: boolean;
  confirming: boolean;
  onRequestDisconnect: () => void;
  onCancelDisconnect: () => void;
  onDisconnect: () => void;
}) {
  const chips = capabilityChips(connection.capabilities);

  return (
    <li className="atlas-conn-row">
      <IntegrationAvatar
        integrationId={connection.integrationId}
        name={connection.integrationName}
        size="md"
        decorative
      />
      <div className="atlas-conn-row__meta">
        <span className="atlas-conn-row__name">{connection.integrationName}</span>
        {chips.length > 0 ? (
          <span className="atlas-conn-row__chips">
            {chips.map((chip) => (
              <span className="atlas-conn-row__chip" key={chip}>
                {chip}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      {confirming ? (
        <div className="atlas-conn-row__confirm">
          <span className="atlas-conn-row__confirm-label">Disconnect?</span>
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
    </li>
  );
}

// ── Discover card ───────────────────────────────────────────────────────────
function DiscoverCard({
  integrationId,
  name,
  capabilities,
  authMethod,
  saving,
  onConnect,
}: {
  integrationId: string;
  name: string;
  capabilities: string[];
  authMethod: string;
  saving: boolean;
  onConnect: (integrationId: string, apiKey?: string) => void;
}) {
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const needsApiKey = authMethod.includes("api_key");
  const chips = capabilityChips(capabilities);

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
      {chips.length > 0 ? (
        <span className="atlas-discover-card__chips">
          {chips.map((chip) => (
            <span className="atlas-discover-card__chip" key={chip}>
              {chip}
            </span>
          ))}
        </span>
      ) : null}

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
          {needsApiKey && !showKeyForm ? "Add key" : "Connect"}
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
        setError(
          (payload as { error?: string }).error || "Could not connect."
        );
        return;
      }
      setConfirmingId(null);
      addToast("Connected");
      void refresh();
    } catch {
      setError("Could not connect.");
    } finally {
      setSaving(false);
    }
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

      {error ? (
        <p className="atlas-board-empty atlas-board-empty--error" role="alert">
          {error}
        </p>
      ) : null}

      {connections.length === 0 && allCards.length === 0 ? (
        <div className="atlas-board-empty-card">
          <strong>No integrations yet</strong>
          <p>
            Connect services like Swiggy, Amazon, or Google to let Atlas act on
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
                      saving={saving}
                      onConnect={connect}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      )}

      <p className="atlas-micro">
        Atlas never shares your credentials. You can disconnect any service at
        any time.
      </p>
    </section>
  );
}