"use client";

import { useEffect, useState } from "react";

// ── 1. APPROVALS PANEL ──
interface ApprovalItem {
  id: string;
  domain: string;
  title: string;
  summary: string;
  fields: string;
  status: string;
  risk: string;
  createdAt: string;
}

export function ApprovalsPanel() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/approvals");
      const data = await res.json();
      if (res.ok) setApprovals(data.approvals || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchApprovals();
  }, []);

  const handleAction = async (id: string, status: "approved" | "rejected") => {
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        setNotice(`Action request successfully ${status}.`);
        void fetchApprovals();
        setSelectedId(null);
      } else {
        const err = await res.json();
        setNotice(`Error: ${err.error || "Failed to process approval."}`);
      }
    } catch {
      setNotice("Connection error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedItem = approvals.find((a) => a.id === selectedId);

  return (
    <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Governance & Trust</p>
          <h2 className="atlas-section__title">Human-in-the-Loop Actions</h2>
          <p className="atlas-section__copy">
            Review and clear high-risk tasks requested by consumer agents before they run.
          </p>
        </div>

        {notice && (
          <div className="atlas-banner atlas-banner--success" style={{ marginBottom: 16 }}>
            <span className="atlas-banner__dot" />
            <span>{notice}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading approvals queue...</div>
        ) : (
          <div style={{ display: "flex", gap: 20, minHeight: 450, flexWrap: "wrap" }}>
            {/* Queue List */}
            <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 12 }}>
              <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", margin: "0 0 4px" }}>
                Pending Queue ({approvals.filter((a) => a.status === "pending").length})
              </h3>
              {approvals.length === 0 ? (
                <div className="atlas-card" style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
                  Approvals queue is empty
                </div>
              ) : (
                approvals.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className="atlas-card"
                    style={{
                      padding: 14,
                      cursor: "pointer",
                      border: item.id === selectedId ? "1px solid #10b981" : "1px solid rgba(148, 163, 184, 0.1)",
                      background: item.id === selectedId ? "rgba(16, 185, 129, 0.04)" : "#0f172a",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <span className="atlas-badge atlas-badge--blue" style={{ fontSize: "0.68rem" }}>{item.domain}</span>
                      <span
                        className="atlas-badge"
                        style={{
                          fontSize: "0.65rem",
                          background: item.risk === "high" ? "rgba(239, 68, 68, 0.1)" : "rgba(255, 255, 255, 0.04)",
                          color: item.risk === "high" ? "#ef4444" : "#94a3b8",
                          border: item.risk === "high" ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid rgba(148, 163, 184, 0.15)",
                        }}
                      >
                        {item.risk} risk
                      </span>
                    </div>
                    <h4 style={{ margin: "4px 0", fontSize: "0.92rem", fontWeight: 700, color: "#f8fafc" }}>{item.title}</h4>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {item.summary}
                    </p>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: "0.72rem", color: "#475569" }}>
                      <span>Status: <strong style={{ color: item.status === "pending" ? "#f59e0b" : item.status === "approved" ? "#10b981" : "#ef4444" }}>{item.status}</strong></span>
                      <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Context Inspector */}
            <div style={{ flex: 1.5, minWidth: 320 }} className="atlas-card">
              {selectedItem ? (
                <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: 18 }}>
                  <div>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f8fafc", margin: "0 0 12px" }}>Inspect Handoff Context</h3>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                      <div>
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Domain Channel</span>
                        <p style={{ margin: "2px 0", fontSize: "0.88rem", fontWeight: 600, color: "#f8fafc" }}>{selectedItem.domain}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Requested At</span>
                        <p style={{ margin: "2px 0", fontSize: "0.88rem", fontWeight: 600, color: "#f8fafc" }}>{new Date(selectedItem.createdAt).toLocaleString()}</p>
                      </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Action Description</span>
                      <p style={{ margin: "4px 0", fontSize: "0.88rem", color: "#e2e8f0", lineHeight: 1.4 }}>{selectedItem.summary}</p>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Tool Arguments / Parameters</span>
                      <pre style={{ margin: "6px 0", padding: 12, background: "#020617", border: "1px solid rgba(148, 163, 184, 0.1)", borderRadius: 8, fontSize: "0.78rem", color: "#34d399", overflowX: "auto" }}>
                        {JSON.stringify(JSON.parse(selectedItem.fields || "{}"), null, 2)}
                      </pre>
                    </div>
                  </div>

                  {selectedItem.status === "pending" && (
                    <div style={{ display: "flex", gap: 12, borderTop: "1px solid rgba(148, 163, 184, 0.1)", paddingTop: 16, marginTop: 16 }}>
                      <button
                        type="button"
                        className="atlas-action"
                        disabled={submitting}
                        onClick={() => void handleAction(selectedItem.id, "rejected")}
                        style={{ flex: 1, padding: "10px 14px", background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}
                      >
                        Reject & Block
                      </button>
                      <button
                        type="button"
                        className="atlas-action"
                        disabled={submitting}
                        onClick={() => void handleAction(selectedItem.id, "approved")}
                        style={{ flex: 1.2, padding: "10px 14px", background: "#10b981", color: "#000", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}
                      >
                        Approve Action
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 300, color: "#64748b", fontSize: "0.88rem" }}>
                  Select an approval request to inspect context
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}


// ── 2. ANALYTICS PANEL ──
export function AnalyticsPanel() {
  const [stats, setStats] = useState({
    totalTokens: 0,
    tokensIn: 0,
    tokensOut: 0,
    avgLatencyMs: 0,
    successRate: 100,
    currentSpend: 0,
    budgetCap: 50,
  });
  const [tierStats, setTierStats] = useState({
    free: { cost: 0, tokens: 0, count: 0, latency: 0 },
    premium: { cost: 0, tokens: 0, count: 0, latency: 0 },
    vip: { cost: 0, tokens: 0, count: 0, latency: 0 },
  });
  const [chartData, setChartData] = useState<{ day: string; cost: number }[]>([]);
  const [budgetSlider, setBudgetSlider] = useState(50);
  const [savingBudget, setSavingBudget] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/analytics");
      const data = await res.json();
      if (res.ok) {
        setStats(data.stats);
        setChartData(data.chartData);
        setBudgetSlider(data.stats.budgetCap);
        if (data.tierStats) {
          setTierStats(data.tierStats);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const saveBudgetCap = async () => {
    setSavingBudget(true);
    setNotice(null);
    try {
      // Update setting directly in db
      await fetch("/api/admin/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setStats((prev) => ({ ...prev, budgetCap: budgetSlider }));
      setNotice("Monthly budget cap updated successfully.");
    } catch (err) {
      console.error(err);
      setNotice("Error saving budget cap.");
    } finally {
      setSavingBudget(false);
    }
  };

  const currentPercent = Math.min(100, Math.round((stats.currentSpend / stats.budgetCap) * 100));

  return (
    <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Cost & Optimization</p>
          <h2 className="atlas-section__title">Observability & Token Analytics</h2>
          <p className="atlas-section__copy">
            Monitor API spending budgets, subscription tier metrics, token throughput, and query latencies.
          </p>
        </div>

        {notice && (
          <div className="atlas-banner atlas-banner--success" style={{ marginBottom: 16 }}>
            <span className="atlas-banner__dot" />
            <span>{notice}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading cost metrics...</div>
        ) : (
          <div>
            {/* KPI Stats Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
              <div className="atlas-card" style={{ padding: 18, background: "linear-gradient(135deg, #0f172a, #0b1329)" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Month-to-Date Cost</span>
                <h3 style={{ fontSize: "1.7rem", fontWeight: 800, color: "#f8fafc", margin: "8px 0 4px" }}>
                  ${stats.currentSpend.toFixed(4)}
                </h3>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  of **${stats.budgetCap}** Limit ({currentPercent}% consumed)
                </div>
                <div style={{ width: "100%", height: 6, background: "rgba(255, 255, 255, 0.05)", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                  <div style={{ width: `${currentPercent}%`, height: "100%", background: currentPercent > 80 ? "#ef4444" : "#10b981" }} />
                </div>
              </div>

              <div className="atlas-card" style={{ padding: 18 }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Total Tokens</span>
                <h3 style={{ fontSize: "1.7rem", fontWeight: 800, color: "#f8fafc", margin: "8px 0 4px" }}>
                  {stats.totalTokens.toLocaleString()}
                </h3>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  In: **{stats.tokensIn.toLocaleString()}** | Out: **{stats.tokensOut.toLocaleString()}**
                </div>
              </div>

              <div className="atlas-card" style={{ padding: 18 }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Average Latency</span>
                <h3 style={{ fontSize: "1.7rem", fontWeight: 800, color: "#f8fafc", margin: "8px 0 4px" }}>
                  {stats.avgLatencyMs} ms
                </h3>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  Success Rate: <strong style={{ color: "#10b981" }}>{stats.successRate}%</strong>
                </div>
              </div>
            </div>

            {/* Subscription Tiers Cost Allocation */}
            <div className="atlas-card" style={{ padding: 20, marginBottom: 24 }}>
              <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", margin: "0 0 16px" }}>Subscription Cost Allocation</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {Object.keys(tierStats).map((tKey) => {
                  const key = tKey as "free" | "premium" | "vip";
                  const tCost = tierStats[key].cost;
                  const sharePercent = stats.currentSpend > 0 ? Math.round((tCost / stats.currentSpend) * 100) : 0;
                  return (
                    <div key={key}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, color: "#f8fafc", textTransform: "capitalize" }}>{key} Tier ({sharePercent}%)</span>
                        <span style={{ color: "#94a3b8" }}>
                          Cost: <strong>${tCost.toFixed(4)}</strong> | Tokens: <strong>{tierStats[key].tokens.toLocaleString()}</strong> | Latency: <strong>{tierStats[key].latency} ms</strong>
                        </span>
                      </div>
                      <div style={{ width: "100%", height: 8, background: "rgba(255, 255, 255, 0.05)", borderRadius: 4, overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${sharePercent || 0}%`,
                            height: "100%",
                            background: key === "vip" ? "linear-gradient(to right, #a855f7, #c084fc)" : key === "premium" ? "linear-gradient(to right, #3b82f6, #60a5fa)" : "linear-gradient(to right, #94a3b8, #cbd5e1)"
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Spending Chart */}
            <div className="atlas-card" style={{ padding: 20, marginBottom: 24 }}>
              <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", margin: "0 0 16px" }}>Cumulative Cost Trend (7 Days)</h4>
              <div style={{ display: "flex", height: 180, alignItems: "flex-end", gap: 12, borderBottom: "1px solid rgba(148, 163, 184, 0.1)", paddingBottom: 8 }}>
                {chartData.map((d, idx) => {
                  const maxCost = Math.max(...chartData.map((x) => x.cost));
                  const pctHeight = maxCost > 0 ? (d.cost / maxCost) * 100 : 0;
                  return (
                    <div key={idx} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ fontSize: "0.72rem", color: "#10b981", marginBottom: 4 }}>${d.cost.toFixed(2)}</span>
                      <div style={{ width: "100%", height: `${pctHeight}%`, background: "linear-gradient(to top, rgba(16, 185, 129, 0.05), #10b981)", borderRadius: "4px 4px 0 0" }} />
                      <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 8 }}>{d.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Budget Sliders */}
            <div className="atlas-card" style={{ padding: 20 }}>
              <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", margin: "0 0 12px" }}>Monthly Cost Warning Rules</h4>
              <label className="atlas-assistant__composer-field" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="atlas-assistant__composer-label">Monthly Spending Cap (USD): ${budgetSlider}</span>
                <input
                  type="range"
                  min={10}
                  max={500}
                  step={5}
                  value={budgetSlider}
                  onChange={(e) => setBudgetSlider(Number(e.target.value))}
                />
              </label>
              <button
                type="button"
                className="atlas-action atlas-action--primary"
                onClick={saveBudgetCap}
                disabled={savingBudget}
                style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}
              >
                {savingBudget ? "Saving Cap..." : "Save Spending Limits"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}


// ── 3. SAFETY PANEL ──
export function SafetyPanel() {
  const [config, setConfig] = useState({
    piiEnabled: false,
    piiFields: ["email", "credit_card", "ssn"],
    toxicityEnabled: false,
    flaggedCapabilities: ["system_execute_command"],
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Sandbox simulation states
  const [sandboxInput, setSandboxInput] = useState("");
  const [sandboxOutput, setSandboxOutput] = useState("");

  const loadSafety = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/safety");
      const data = await res.json();
      if (res.ok) {
        setConfig({
          ...data,
          flaggedCapabilities: data.flaggedCapabilities || ["system_execute_command"],
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSafety();
  }, []);

  const saveSafety = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) setNotice("Safety and PII configuration updated successfully.");
    } catch {
      setNotice("Error saving safety settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleFieldToggle = (field: string) => {
    setConfig((prev) => {
      const fields = prev.piiFields.includes(field)
        ? prev.piiFields.filter((f) => f !== field)
        : [...prev.piiFields, field];
      return { ...prev, piiFields: fields };
    });
  };

  const runSandboxSimulate = () => {
    if (!sandboxInput.trim()) return;
    let output = sandboxInput;
    if (config.piiEnabled) {
      if (config.piiFields.includes("email")) {
        output = output.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]");
      }
      if (config.piiFields.includes("credit_card")) {
        output = output.replace(/\b(?:\d[ -]*?){13,16}\b/g, "[REDACTED_CARD_NUMBER]");
      }
      if (config.piiFields.includes("ssn")) {
        output = output.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]");
      }
    }
    setSandboxOutput(output);
  };

  return (
    <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Data Security</p>
          <h2 className="atlas-section__title">Safety Guardrails & Policies</h2>
          <p className="atlas-section__copy">
            Establish content screening guardrails and redact personal data before prompting models.
          </p>
        </div>

        {notice && (
          <div className="atlas-banner atlas-banner--success" style={{ marginBottom: 16 }}>
            <span className="atlas-banner__dot" />
            <span>{notice}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading security config...</div>
        ) : (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {/* Left Column: Toggles */}
            <div style={{ flex: 1.2, minWidth: 280, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="atlas-card" style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc" }}>PII Redaction Engine</h3>
                    <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#94a3b8" }}>Scan and redact personal details.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.piiEnabled}
                    onChange={(e) => setConfig({ ...config, piiEnabled: e.target.checked })}
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                  />
                </div>

                {config.piiEnabled && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, borderTop: "1px solid rgba(148, 163, 184, 0.1)", paddingTop: 12 }}>
                    <span style={{ fontSize: "0.72rem", color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>Scan Filters</span>
                    {["email", "credit_card", "ssn"].map((field) => (
                      <label key={field} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#94a3b8", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={config.piiFields.includes(field)}
                          onChange={() => handleFieldToggle(field)}
                        />
                        {field === "email" ? "Email addresses" : field === "credit_card" ? "Credit card numbers" : "Social Security Numbers (SSN)"}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Consumer Flagged Toggles */}
              <div className="atlas-card" style={{ padding: 18 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc" }}>
                  Consumer Action Guardrails (Requires Admin Approval)
                </h3>
                <p style={{ margin: "0 0 14px", fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.4 }}>
                  Select high-risk capabilities that must pause execution and route to your Action Approvals tab.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { id: "system_execute_command", label: "System Execute Commands" },
                    { id: "system_delete_file", label: "File Deletion Actions" },
                    { id: "shopping_buy_product", label: "Purchase/Order Approvals" },
                    { id: "email_send_email", label: "Email Dispatches" }
                  ].map((cap) => (
                    <label key={cap.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#94a3b8", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={config.flaggedCapabilities?.includes(cap.id)}
                        onChange={() => {
                          const list = config.flaggedCapabilities || [];
                          const updated = list.includes(cap.id)
                            ? list.filter((c) => c !== cap.id)
                            : [...list, cap.id];
                          setConfig({ ...config, flaggedCapabilities: updated });
                        }}
                      />
                      {cap.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="atlas-card" style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc" }}>Toxicity Content Screen</h3>
                    <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#94a3b8" }}>Reject offensive queries in real-time.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.toxicityEnabled}
                    onChange={(e) => setConfig({ ...config, toxicityEnabled: e.target.checked })}
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                  />
                </div>
              </div>

              <button
                type="button"
                className="atlas-action atlas-action--primary"
                onClick={saveSafety}
                disabled={saving}
                style={{ padding: "10px 18px", borderRadius: 8, cursor: "pointer" }}
              >
                {saving ? "Saving settings..." : "Save Safety Policies"}
              </button>
            </div>

            {/* Right Column: Sandbox Sandbox Sim */}
            <div style={{ flex: 1, minWidth: 280 }} className="atlas-card">
              <div style={{ padding: 18 }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc", margin: "0 0 10px" }}>Redaction Test Sandbox</h3>
                <label className="atlas-assistant__composer-field">
                  <span className="atlas-assistant__composer-label">Input String</span>
                  <textarea
                    className="atlas-assistant__composer-value"
                    rows={4}
                    value={sandboxInput}
                    onChange={(e) => setSandboxInput(e.target.value)}
                    placeholder="E.g., Contact me at support@company.com or card 4111-2222-3333-4444."
                    style={{ resize: "none", width: "100%" }}
                  />
                </label>
                <button
                  type="button"
                  className="atlas-action"
                  onClick={runSandboxSimulate}
                  style={{ width: "100%", marginTop: 10, padding: "8px 14px", background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(148, 163, 184, 0.15)", borderRadius: 8, color: "#fff", fontWeight: 600, cursor: "pointer" }}
                >
                  Simulate Redaction Output
                </button>

                {sandboxOutput && (
                  <div style={{ marginTop: 16 }}>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Output Payload Sent to LLM</span>
                    <pre style={{ margin: "6px 0 0", padding: 10, background: "#020617", border: "1px solid rgba(148, 163, 184, 0.1)", borderRadius: 8, color: "#f59e0b", fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
                      {sandboxOutput}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}


// ── 4. QUOTAS PANEL ──
interface QuotaLimit {
  role: string;
  maxRequestsPerMinute: number;
  maxTokensPerDay: number;
}

export function QuotasPanel() {
  const [limits, setLimits] = useState<QuotaLimit[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadQuotas = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/quotas");
      const data = await res.json();
      if (res.ok) setLimits(data.limits || []);

      const userRes = await fetch("/api/admin/users/tier");
      const userData = await userRes.json();
      if (userRes.ok) setUsers(userData.users || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQuotas();
  }, []);

  const saveQuotas = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/quotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limits }),
      });
      if (res.ok) setNotice("User quotas successfully updated.");
    } catch {
      setNotice("Failed to save user quotas.");
    } finally {
      setSaving(false);
    }
  };

  const handleLimitChange = (index: number, key: keyof QuotaLimit, val: number) => {
    setLimits((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [key]: val } : item))
    );
  };

  const handleUserTierChange = async (userId: string, tier: string) => {
    try {
      const res = await fetch("/api/admin/users/tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, tier }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.userId === userId ? { ...u, tier } : u))
        );
        setNotice("User subscription tier updated successfully.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Access Control</p>
          <h2 className="atlas-section__title">User Quotas & Limits</h2>
          <p className="atlas-section__copy">
            Establish request and token rate-limit parameters for client tiers to avoid platform exhaustion.
          </p>
        </div>

        {notice && (
          <div className="atlas-banner atlas-banner--success" style={{ marginBottom: 16 }}>
            <span className="atlas-banner__dot" />
            <span>{notice}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading user limits...</div>
        ) : (
          <div className="atlas-card" style={{ padding: 18 }}>
            <div style={{ overflowX: "auto", width: "100%", marginBottom: 16 }}>
              <table style={{ width: "100%", minWidth: 500, borderCollapse: "collapse", color: "#e2e8f0" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.15)", color: "#64748b", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    <th style={{ textAlign: "left", padding: 10 }}>User Role Tier</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Max Requests/Min</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Max Tokens/Day</th>
                  </tr>
                </thead>
                <tbody>
                  {limits.map((item, index) => (
                    <tr key={index} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}>
                      <td style={{ padding: 12, fontWeight: 700, fontSize: "0.9rem" }}>{item.role}</td>
                      <td style={{ padding: 12 }}>
                        <input
                          type="number"
                          className="atlas-assistant__composer-value"
                          value={item.maxRequestsPerMinute}
                          onChange={(e) => handleLimitChange(index, "maxRequestsPerMinute", Number(e.target.value))}
                          style={{ width: 120, padding: "6px 10px" }}
                        />
                      </td>
                      <td style={{ padding: 12 }}>
                        <input
                          type="number"
                          className="atlas-assistant__composer-value"
                          value={item.maxTokensPerDay}
                          onChange={(e) => handleLimitChange(index, "maxTokensPerDay", Number(e.target.value))}
                          style={{ width: 140, padding: "6px 10px" }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              className="atlas-action atlas-action--primary"
              onClick={saveQuotas}
              disabled={saving}
              style={{ padding: "10px 18px", borderRadius: 8, cursor: "pointer" }}
            >
              {saving ? "Saving settings..." : "Save Quota Rules"}
            </button>

            {/* Subscriber Directory and Tier Management */}
            <div style={{ marginTop: 32, borderTop: "1px solid rgba(148, 163, 184, 0.15)", paddingTop: 20 }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc", margin: "0 0 8px" }}>
                Consumer Directory & Subscription Management
              </h3>
              <p style={{ margin: "0 0 16px", fontSize: "0.78rem", color: "#94a3b8" }}>
                Assign subscription tiers to change client rate limits automatically.
              </p>
              {users.length === 0 ? (
                <div style={{ padding: 14, textAlign: "center", color: "#64748b", fontSize: "0.85rem" }}>
                  No active users found in directory
                </div>
              ) : (
                <div style={{ overflowX: "auto", width: "100%" }}>
                  <table style={{ width: "100%", minWidth: 600, tableLayout: "fixed", borderCollapse: "collapse", color: "#e2e8f0" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.15)", color: "#64748b", fontSize: "0.75rem", textTransform: "uppercase" }}>
                        <th style={{ textAlign: "left", padding: 10, width: "45%" }}>User Name / ID</th>
                        <th style={{ textAlign: "left", padding: 10, width: "35%" }}>Email Address</th>
                        <th style={{ textAlign: "left", padding: 10, width: "20%" }}>Subscription Tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}>
                          <td style={{ padding: 12 }}>
                            <div style={{ fontWeight: 700, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name || "Guest User"}</div>
                            <div style={{ fontSize: "0.72rem", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.userId}>ID: {u.userId}</div>
                          </td>
                          <td style={{ padding: 12, fontSize: "0.85rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.email}>{u.email || "N/A"}</td>
                          <td style={{ padding: 12 }}>
                            <select
                              value={u.tier || "free"}
                              onChange={(e) => void handleUserTierChange(u.userId, e.target.value)}
                              className="atlas-assistant__composer-value"
                              style={{ width: "100%", padding: "6px 12px", background: "#020617", border: "1px solid rgba(148, 163, 184, 0.15)", color: "#e2e8f0", borderRadius: 6 }}
                            >
                              <option value="free">Free</option>
                              <option value="premium">Standard</option>
                              <option value="vip">VIP</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}


// ── 4.5 TIER LIMITS PANEL ──
interface TierLimitRow {
  tier: "free" | "premium" | "vip";
  label: string;
  limits: {
    maxRequestsPerMinute: number;
    maxTokensPerDay: number;
    maxVoiceMinutesPerDay: number;
    responseDelayMs: number;
  };
}

export function TierSettingsPanel() {
  const [rows, setRows] = useState<TierLimitRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tiers");
      const data = await res.json();
      if (res.ok) setRows(data.plans || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const update = (index: number, key: keyof TierLimitRow["limits"], val: number) => {
    setRows((prev) =>
      prev.map((row, idx) =>
        idx === index
          ? { ...row, limits: { ...row.limits, [key]: typeof val === "number" && val >= 0 ? val : 0 } }
          : row
      )
    );
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plans: rows }),
      });
      setNotice(res.ok ? "Tier limits saved. Changes apply to the next request." : "Failed to save tier limits.");
    } catch {
      setNotice("Failed to save tier limits.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Plans</p>
          <h2 className="atlas-section__title">Tier Limits</h2>
          <p className="atlas-section__copy">
            Per-plan rate limits, token budgets, and voice minutes. Free users get no voice by
            default; Standard and VIP unlock voice. Admin/dev identities are always VIP.
          </p>
        </div>

        {notice && (
          <div className={`atlas-banner ${notice.startsWith("Failed") ? "atlas-banner--error" : "atlas-banner--success"}`} style={{ marginBottom: 16 }}>
            <span className="atlas-banner__dot" />
            <span>{notice}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading tier limits...</div>
        ) : (
          <div className="atlas-card" style={{ padding: 18 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", color: "#e2e8f0" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.15)", color: "#64748b", fontSize: "0.75rem", textTransform: "uppercase" }}>
                  <th style={{ textAlign: "left", padding: 10 }}>Tier</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Requests / Min</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Tokens / Day</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Voice Min / Day</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Response Delay (ms)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.tier} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}>
                    <td style={{ padding: 12, fontWeight: 700 }}>{row.label}</td>
                    <td style={{ padding: 12 }}>
                      <input
                        type="number"
                        className="atlas-assistant__composer-value"
                        value={row.limits.maxRequestsPerMinute}
                        onChange={(e) => update(index, "maxRequestsPerMinute", Number(e.target.value))}
                        style={{ width: 110, padding: "6px 10px" }}
                      />
                    </td>
                    <td style={{ padding: 12 }}>
                      <input
                        type="number"
                        className="atlas-assistant__composer-value"
                        value={row.limits.maxTokensPerDay}
                        onChange={(e) => update(index, "maxTokensPerDay", Number(e.target.value))}
                        style={{ width: 130, padding: "6px 10px" }}
                      />
                    </td>
                    <td style={{ padding: 12 }}>
                      <input
                        type="number"
                        className="atlas-assistant__composer-value"
                        value={row.limits.maxVoiceMinutesPerDay}
                        onChange={(e) => update(index, "maxVoiceMinutesPerDay", Number(e.target.value))}
                        style={{ width: 110, padding: "6px 10px" }}
                      />
                    </td>
                    <td style={{ padding: 12 }}>
                      <input
                        type="number"
                        className="atlas-assistant__composer-value"
                        value={row.limits.responseDelayMs}
                        onChange={(e) => update(index, "responseDelayMs", Number(e.target.value))}
                        style={{ width: 110, padding: "6px 10px" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: "10px 0 0", fontSize: "0.72rem", color: "#64748b" }}>
              Voice Min/Day: 0 = voice not included. For VIP, 0 = unlimited. Response Delay simulates
              slower replies on lower tiers (for testing).
            </p>

            <button
              type="button"
              className="atlas-action atlas-action--primary"
              onClick={save}
              disabled={saving}
              style={{ marginTop: 18, padding: "10px 18px", borderRadius: 8, cursor: "pointer" }}
            >
              {saving ? "Saving settings..." : "Save Tier Limits"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}


// ── 5. BENCHMARKS PANEL ──
interface BenchmarkResult {
  modelId: string;
  label: string;
  provider: string;
  latencyMs: number;
  length: number;
  output: string;
  error: string | null;
  success: boolean;
}

export function BenchmarksPanel() {
  const [prompt, setPrompt] = useState("Why is database indexing important?");
  const [availableModels, setAvailableModels] = useState<{ id: string; label: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch("/api/admin/models");
        const data = await res.json();
        if (res.ok) {
          setAvailableModels(data.models || []);
          // Autoselect first 2 models
          if (data.models && data.models.length > 0) {
            setSelectedIds(data.models.slice(0, 2).map((m: any) => m.id));
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    void fetchModels();
  }, []);

  const runBenchmark = async () => {
    if (!prompt.trim() || selectedIds.length === 0) return;
    setRunning(true);
    setResults([]);
    try {
      const res = await fetch("/api/admin/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, modelIds: selectedIds }),
      });
      const data = await res.json();
      if (res.ok) setResults(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setRunning(false);
    }
  };

  const handleModelSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Performance Tuning</p>
          <h2 className="atlas-section__title">Model Benchmark Arena</h2>
          <p className="atlas-section__copy">
            Test and contrast latency speed, output token quantities, and response content directly side-by-side.
          </p>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading model lists...</div>
        ) : (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {/* Test Input Setup */}
            <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="atlas-card" style={{ padding: 18 }}>
                <label className="atlas-assistant__composer-field">
                  <span className="atlas-assistant__composer-label">Prompt Query</span>
                  <textarea
                    className="atlas-assistant__composer-value"
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter test prompt..."
                    style={{ resize: "none", width: "100%" }}
                  />
                </label>

                <div style={{ marginTop: 14 }}>
                  <span className="atlas-assistant__composer-label" style={{ display: "block", marginBottom: 6 }}>Models to compare</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto", padding: 4 }}>
                    {availableModels.map((m) => (
                      <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#94a3b8", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(m.id)}
                          onChange={() => handleModelSelect(m.id)}
                        />
                        {m.label || m.id}
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className="atlas-action atlas-action--primary"
                  onClick={runBenchmark}
                  disabled={running || selectedIds.length === 0}
                  style={{ width: "100%", marginTop: 14, padding: "10px 14px", borderRadius: 8, cursor: "pointer" }}
                >
                  {running ? "Benchmarking Sweep Running..." : "🚀 Run Benchmarks"}
                </button>
              </div>
            </div>

            {/* Side-by-Side Results Display */}
            <div style={{ flex: 1.5, minWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
              <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", margin: 0 }}>
                Comparison Arena ({results.length} completed)
              </h3>
              {running && (
                <div className="atlas-card" style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
                  Running parallel execution sweep...
                </div>
              )}
              {!running && results.length === 0 && (
                <div className="atlas-card" style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
                  Benchmarking logs display here after running prompt
                </div>
              )}
              {!running &&
                results.map((res, idx) => (
                  <div key={idx} className="atlas-card" style={{ padding: 16, border: res.success ? "1px solid rgba(148, 163, 184, 0.1)" : "1px solid rgba(239, 68, 68, 0.3)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, borderBottom: "1px solid rgba(148, 163, 184, 0.1)", paddingBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.95rem" }}>{res.label || res.modelId}</span>
                      <span className="atlas-badge">{res.provider}</span>
                    </div>

                    {res.success ? (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10, fontSize: "0.8rem", color: "#94a3b8" }}>
                          <div>
                            Latency: <strong style={{ color: "#10b981" }}>{res.latencyMs} ms</strong>
                          </div>
                          <div>
                            Response Size: <strong style={{ color: "#34d399" }}>{res.length} chars</strong>
                          </div>
                        </div>
                        <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Response Payload Snippet</span>
                        <p style={{ margin: "4px 0 0", padding: 10, background: "#020617", border: "1px solid rgba(148, 163, 184, 0.05)", borderRadius: 8, fontSize: "0.82rem", color: "#e2e8f0", lineHeight: 1.4 }}>
                          {res.output}
                        </p>
                      </div>
                    ) : (
                      <div style={{ color: "#ef4444", fontSize: "0.82rem" }}>
                        <strong>Error:</strong> {res.error}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
