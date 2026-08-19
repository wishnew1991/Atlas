"use client";

import { useCallback, useEffect, useState } from "react";

type AdminBriefDefaults = {
  enabled: boolean;
  triggerTime: string;
  providers: string[];
  maxItems: number;
  llmCompose: boolean;
  triggerMode: "worker" | "lazy";
};

type PreviewItem = { item: { kind: string; title: string; reason: string; body: string }; text: string };

const PROVIDER_OPTIONS: Array<{ id: string; label: string; hint: string }> = [
  { id: "executions", label: "Active tasks", hint: "Unfinished executions" },
  { id: "approvals", label: "Pending approvals", hint: "Actions waiting on you" },
  { id: "memory-deadlines", label: "Memory deadlines", hint: "Deadlines from long-term memory" },
];

/**
 * Admin-facing Daily Brief panel: global defaults (system → admin → user) plus
 * an isolated fixture preview. The preview never persists and never touches
 * real user data.
 */
export function AdminDailyBriefPanel() {
  const [defaults, setDefaults] = useState<AdminBriefDefaults | null>(null);
  const [draft, setDraft] = useState<AdminBriefDefaults | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; items: PreviewItem[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/proactive", { cache: "no-store" });
      const payload = (await response.json()) as { defaults?: AdminBriefDefaults };
      if (!response.ok || !payload.defaults) throw new Error("Could not load defaults.");
      setDefaults(payload.defaults);
      setDraft(payload.defaults);
    } catch {
      setError("Could not load Daily Brief defaults.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleProvider = (id: string) => {
    if (!draft) return;
    const has = draft.providers.includes(id);
    const next = has ? draft.providers.filter((p) => p !== id) : [...draft.providers, id];
    setDraft({ ...draft, providers: next });
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/proactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json()) as { defaults?: AdminBriefDefaults };
      if (!response.ok || !payload.defaults) throw new Error("Could not save.");
      setDefaults(payload.defaults);
      setDraft(payload.defaults);
    } catch {
      setError("Could not save defaults.");
    } finally {
      setSaving(false);
    }
  };

  const showPreview = async () => {
    if (previewing) return;
    setPreviewing(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/proactive/preview", { cache: "no-store" });
      const payload = (await response.json()) as { preview?: { title: string; items: PreviewItem[] } | null };
      if (!response.ok || !payload.preview) throw new Error("Could not load preview.");
      setPreview(payload.preview);
    } catch {
      setError("Could not load preview.");
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) {
    return (
      <div className="atlas-admin-panel">
        <div className="atlas-admin-panel__head">
          <h2 className="atlas-admin-panel__title">Daily Brief</h2>
          <p className="atlas-admin-panel__lede">Loading…</p>
        </div>
      </div>
    );
  }

  if (!draft || !defaults) {
    return (
      <div className="atlas-admin-panel">
        <div className="atlas-admin-panel__head">
          <h2 className="atlas-admin-panel__title">Daily Brief</h2>
          <p className="atlas-admin-panel__lede">Unavailable.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="atlas-admin-panel">
      <div className="atlas-admin-panel__head">
        <div>
          <h2 className="atlas-admin-panel__title">Daily Brief</h2>
          <p className="atlas-admin-panel__lede">
            Global defaults for the proactive brief. Precedence: system → here → each user&apos;s
            own toggle.
          </p>
        </div>
      </div>

      {error ? (
        <p className="atlas-board-empty atlas-board-empty--error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="atlas-admin-list atlas-admin-list--toggles">
        <li className="atlas-admin-list__item">
          <div className="atlas-admin-list__meta">
            <span className="atlas-admin-list__title">Enabled by default</span>
            <span className="atlas-admin-list__body">
              New users get the brief unless they opt out.
            </span>
          </div>
          <button
            type="button"
            className="atlas-toggle"
            role="switch"
            aria-checked={draft.enabled}
            onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
          >
            <span className="atlas-toggle__thumb" />
          </button>
        </li>
        <li className="atlas-admin-list__item">
          <div className="atlas-admin-list__meta">
            <span className="atlas-admin-list__title">Compose with LLM</span>
            <span className="atlas-admin-list__body">
              Summarize items with the model when available (never for privacy-sensitive items).
            </span>
          </div>
          <button
            type="button"
            className="atlas-toggle"
            role="switch"
            aria-checked={draft.llmCompose}
            onClick={() => setDraft({ ...draft, llmCompose: !draft.llmCompose })}
          >
            <span className="atlas-toggle__thumb" />
          </button>
        </li>
        <li className="atlas-admin-list__item">
          <div className="atlas-admin-list__meta">
            <span className="atlas-admin-list__title">Trigger mode</span>
            <span className="atlas-admin-list__body">
              Lazy checks on app activity (honest label, no server cron).
            </span>
          </div>
          <div className="atlas-admin-list__control">
            <select
              value={draft.triggerMode}
              onChange={(e) =>
                setDraft({ ...draft, triggerMode: e.target.value === "worker" ? "worker" : "lazy" })
              }
            >
              <option value="lazy">Lazy (on activity)</option>
              <option value="worker">Worker (scheduled)</option>
            </select>
          </div>
        </li>
        <li className="atlas-admin-list__item">
          <div className="atlas-admin-list__meta">
            <span className="atlas-admin-list__title">Delivery time</span>
            <span className="atlas-admin-list__body">Local time the brief is due, &ldquo;HH:MM&rdquo;.</span>
          </div>
          <div className="atlas-admin-list__control">
            <input
              type="time"
              value={draft.triggerTime}
              onChange={(e) => setDraft({ ...draft, triggerTime: e.target.value })}
              aria-label="Delivery time"
            />
          </div>
        </li>
        <li className="atlas-admin-list__item">
          <div className="atlas-admin-list__meta">
            <span className="atlas-admin-list__title">Max items</span>
            <span className="atlas-admin-list__body">How many items appear in a brief.</span>
          </div>
          <div className="atlas-admin-list__control">
            <input
              type="number"
              min={1}
              max={10}
              value={draft.maxItems}
              onChange={(e) =>
                setDraft({ ...draft, maxItems: Math.min(10, Math.max(1, Number(e.target.value) || 5)) })
              }
              aria-label="Max items"
            />
          </div>
        </li>
      </ul>

      <div className="atlas-admin-panel__section">
        <h3 className="atlas-admin-panel__subtitle">Sources</h3>
        <div className="atlas-admin-checklist">
          {PROVIDER_OPTIONS.map((provider) => {
            const active = draft.providers.includes(provider.id);
            return (
              <button
                type="button"
                key={provider.id}
                className={
                  active
                    ? "atlas-admin-checklist__item atlas-admin-checklist__item--active"
                    : "atlas-admin-checklist__item"
                }
                aria-pressed={active}
                onClick={() => toggleProvider(provider.id)}
              >
                <span className="atlas-admin-checklist__label">{provider.label}</span>
                <span className="atlas-admin-checklist__hint">{provider.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="atlas-admin-panel__actions">
        <button type="button" className="atlas-action atlas-action--primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save defaults"}
        </button>
        <button
          type="button"
          className="atlas-action atlas-action--ghost"
          disabled={previewing}
          onClick={() => void showPreview()}
        >
          {previewing ? "Previewing…" : "Preview fixture"}
        </button>
      </div>

      {preview ? (
        <div className="atlas-brief-card atlas-brief-card--preview">
          <div className="atlas-brief-card__head">
            <div>
              <p className="atlas-brief-card__eyebrow">Demo preview</p>
              <h3 className="atlas-brief-card__title">{preview.title}</h3>
              <p className="atlas-brief-card__lede">
                Fixture items only — this preview is never saved or delivered to any user.
              </p>
            </div>
          </div>
          <ul className="atlas-brief-card__items">
            {preview.items.map((entry, index) => (
              <li className="atlas-brief-card__item" key={`${entry.item.title}-${index}`}>
                <span className="atlas-brief-card__badge">{entry.item.kind}</span>
                <div className="atlas-brief-card__copy">
                  <span className="atlas-brief-card__item-title">{entry.text}</span>
                  <span className="atlas-brief-card__item-reason">{entry.item.reason}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}