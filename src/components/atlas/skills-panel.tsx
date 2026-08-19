"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { SkillDefinition } from "@/lib/atlas/registry";

interface StatusNotice {
  kind: "ok" | "error";
  text: string;
}

const CATEGORIES = ["action", "communication", "knowledge"];

export function SkillsPanel() {
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "action",
    capabilityId: "",
    connectorId: "",
    providerId: "",
    requiresApproval: true,
    status: "draft",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/skills", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) {
        setSkills(payload.skills ?? []);
        setNotice(null);
      } else {
        setNotice({ kind: "error", text: payload.error || "Could not load skills." });
      }
    } catch {
      setNotice({ kind: "error", text: "Could not load skills." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (id: string, patch: Record<string, unknown>) => {
    try {
      const response = await fetch(`/api/admin/skills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json();
      if (!response.ok) {
        setNotice({ kind: "error", text: payload.error || "Could not update skill." });
        return;
      }
      setSkills((prev) => prev.map((s) => (s.id === id ? payload.skill : s)));
      setNotice({ kind: "ok", text: "Skill updated." });
    } catch {
      setNotice({ kind: "error", text: "Could not update skill." });
    }
  };

  const createSkill = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.capabilityId.trim()) {
      setNotice({ kind: "error", text: "Skill name and capability are required." });
      return;
    }
    try {
      const response = await fetch("/api/admin/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category,
          capabilityId: form.capabilityId.trim(),
          connectorId: form.connectorId.trim() || undefined,
          providerId: form.providerId.trim() || undefined,
          requiresApproval: form.requiresApproval,
          status: form.status,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setNotice({ kind: "error", text: payload.error || "Could not create skill." });
        return;
      }
      setSkills((prev) => [...prev, payload.skill]);
      setCreateOpen(false);
      setForm({ name: "", category: "action", capabilityId: "", connectorId: "", providerId: "", requiresApproval: true, status: "draft" });
      setNotice({ kind: "ok", text: "Skill created." });
    } catch {
      setNotice({ kind: "error", text: "Could not create skill." });
    }
  };

  const deleteSkill = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/skills/${id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice({ kind: "error", text: (payload as { error?: string }).error || "Could not delete skill." });
        return;
      }
      setSkills((prev) => prev.filter((s) => s.id !== id));
      setNotice({ kind: "ok", text: "Skill deleted." });
    } catch {
      setNotice({ kind: "error", text: "Could not delete skill." });
    }
  };

  const activeCount = skills.filter((s) => s.enabled && s.status === "active").length;
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const skill of skills) counts[skill.category] = (counts[skill.category] ?? 0) + 1;
    return counts;
  }, [skills]);

  return (
    <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Capability registry</p>
          <h2 className="atlas-section__title">Skills</h2>
          <p className="atlas-section__copy">
            Skills are capabilities Atlas can perform — offered by connectors and powered by providers.
            Toggle a skill to make it live for consumers.
          </p>
        </div>

        <div className="atlas-chip-row" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span className="atlas-badge atlas-badge--blue">{skills.length} total</span>
          <span className="atlas-badge atlas-badge--green">{activeCount} live</span>
          {CATEGORIES.map((cat) => (
            <span key={cat} className="atlas-badge">{cat}: {categoryCounts[cat] ?? 0}</span>
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
            {createOpen ? "Cancel" : "+ New skill"}
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
          <form className="atlas-card" onSubmit={createSkill} style={{ marginBottom: 16 }}>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">Name</span>
              <input
                className="atlas-assistant__composer-value"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Order food"
                required
              />
            </label>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">Capability ID</span>
              <input
                className="atlas-assistant__composer-value"
                value={form.capabilityId}
                onChange={(e) => setForm((f) => ({ ...f, capabilityId: e.target.value }))}
                placeholder="food"
                required
              />
            </label>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
              <label className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">Category</span>
                <select
                  className="atlas-assistant__composer-value"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">Status</span>
                <select
                  className="atlas-assistant__composer-value"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="deprecated">deprecated</option>
                </select>
              </label>
              <label className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">Connector (optional)</span>
                <input
                  className="atlas-assistant__composer-value"
                  value={form.connectorId}
                  onChange={(e) => setForm((f) => ({ ...f, connectorId: e.target.value }))}
                  placeholder="swiggy"
                />
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={form.requiresApproval}
                  onChange={(e) => setForm((f) => ({ ...f, requiresApproval: e.target.checked }))}
                />
                <span className="atlas-assistant__composer-label">Requires approval</span>
              </label>
              <button type="submit" className="atlas-action atlas-action--primary atlas-action--small">
                Create skill
              </button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div className="atlas-card atlas-card--soft"><div className="atlas-card__body">Loading skills…</div></div>
        ) : skills.length === 0 ? (
          <div className="atlas-card atlas-card--soft">
            <div className="atlas-card__title">No skills yet</div>
            <div className="atlas-card__body">Create your first skill above, or run the registry seed script.</div>
          </div>
        ) : (
          <div className="atlas-rows">
            {skills.map((skill) => {
              const isExpanded = expandedId === skill.id;
              const isLive = skill.enabled && skill.status === "active";
              return (
                <div className="atlas-row" key={skill.id} data-expanded={isExpanded ? "true" : undefined}>
                  <div className="atlas-row__meta">
                    <div className="atlas-row__title">
                      {skill.name}
                      <span className={`atlas-badge ${isLive ? "atlas-badge--green" : "atlas-badge--blue"}`} style={{ marginLeft: 8 }}>
                        {isLive ? "live" : skill.status}
                      </span>
                    </div>
                    <div className="atlas-row__body">
                      {skill.category} · {skill.capabilityId}
                      {skill.connectorName ? ` · ${skill.connectorName}` : ""}
                      {skill.providerName ? ` · ${skill.providerName}` : ""}
                      {skill.requiresApproval ? " · approval" : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="atlas-inline-action"
                      onClick={() => apply(skill.id, { enabled: !skill.enabled })}
                    >
                      {skill.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="atlas-inline-action"
                      onClick={() => setExpandedId(isExpanded ? null : skill.id)}
                    >
                      {isExpanded ? "Collapse" : "Detail"}
                    </button>
                    <button
                      type="button"
                      className="atlas-inline-action atlas-inline-action--danger"
                      onClick={() => deleteSkill(skill.id)}
                    >
                      Delete
                    </button>
                  </div>
                  {isExpanded ? (
                    <div className="atlas-llm-log__inspector" style={{ marginTop: 12 }}>
                      <div className="atlas-llm-log__inspector-grid">
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Skill ID</span>
                          <span className="atlas-llm-log__inspector-val">{skill.id}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Version</span>
                          <span className="atlas-llm-log__inspector-val">{skill.version}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Connector</span>
                          <span className="atlas-llm-log__inspector-val">{skill.connectorName ?? skill.connectorId ?? "—"}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Provider</span>
                          <span className="atlas-llm-log__inspector-val">{skill.providerName ?? skill.providerId ?? "—"}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item" style={{ gridColumn: "1 / -1" }}>
                          <span className="atlas-llm-log__inspector-label">Description</span>
                          <span className="atlas-llm-log__inspector-val">{skill.description ?? "—"}</span>
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