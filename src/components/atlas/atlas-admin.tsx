"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

import type {
  AtlasActionDomain,
  AtlasCredential,
  AtlasProvider,
  AtlasMcpServer,
} from "@/lib/atlas/server/model-registry";
import type { IntegrationDefinition, AuthMethod } from "@/lib/atlas/integrations/types";
import { TRANSPORT_KINDS } from "@/lib/atlas/integrations/types";
import { IntegrationAvatar } from "@/components/atlas/integration-avatar";
import { AdminDailyBriefPanel } from "@/components/atlas/admin-daily-brief";
import { ConnectorAuditPanel } from "@/components/atlas/connector-audit-panel";
import { ConnectorRecipesPanel } from "@/components/atlas/connector-recipes-panel";
import { SkillsPanel } from "@/components/atlas/skills-panel";
import { ProvidersPanel } from "@/components/atlas/providers-panel";
import { isCanonicalCapability, type CanonicalCapability } from "@/lib/atlas/capabilities/types";
import {
  STT_MODE_LABELS,
  TTS_MODE_LABELS,
  VOICE_STT_MODES,
  VOICE_TTS_MODES,
} from "@/lib/atlas/voice-modes";

interface ModelConfig {
  id: string;
  provider: AtlasProvider;
  label: string;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  credentialId?: string;
  fallbackModelIds?: string[];
}

interface RoutingRule {
  domain: AtlasActionDomain;
  modelId: string;
}

const providers: AtlasProvider[] = ["openai", "anthropic", "google", "nvidia", "custom", "openrouter"];

const builtInDomains = ["shopping", "travel", "food", "rides", "appointments", "admin"];

type AdminTab = "llm" | "integrations" | "connector-audit" | "connector-recipes" | "mcp" | "search" | "domains" | "voice" | "logs" | "brief" | "skills" | "providers";

const adminNav: ReadonlyArray<{
  group: string;
  items: ReadonlyArray<{ id: AdminTab; label: string }>;
}> = [
  {
    group: "AI",
    items: [
      { id: "llm", label: "LLM" },
      { id: "logs", label: "LLM Logs" },
    ],
  },
  {
    group: "Connectors",
    items: [
      { id: "integrations", label: "Connectors" },
      { id: "connector-audit", label: "Audit" },
      { id: "connector-recipes", label: "Recipes" },
    ],
  },
  {
    group: "Registry",
    items: [
      { id: "skills", label: "Skills" },
      { id: "providers", label: "Providers" },
    ],
  },
  {
    group: "Infrastructure",
    items: [
      { id: "mcp", label: "MCP Servers" },
      { id: "search", label: "Search" },
      { id: "domains", label: "Domains" },
    ],
  },
  {
    group: "Experience",
    items: [
      { id: "voice", label: "Voice" },
      { id: "brief", label: "Daily Brief" },
    ],
  },
];

const providerMeta: Record<AtlasProvider, { label: string; hint: string; baseHint?: string }> = {
  openai: { label: "OpenAI", hint: "platform.openai.com", baseHint: "https://api.openai.com/v1" },
  anthropic: { label: "Anthropic", hint: "console.anthropic.com", baseHint: "https://api.anthropic.com/v1" },
  google: { label: "Google", hint: "ai.google.dev", baseHint: "https://generativelanguage.googleapis.com/v1beta" },
  nvidia: { label: "NVIDIA", hint: "build.nvidia.com", baseHint: "https://integrate.api.nvidia.com/v1" },
  custom: { label: "Custom", hint: "OpenAI-compatible endpoint" },
  openrouter: { label: "OpenRouter", hint: "openrouter.ai", baseHint: "https://openrouter.ai/api/v1" },
};
function modelDisplayName(model: ModelConfig, credentials: AtlasCredential[]): string {
  const cred = credentials.find((c) => c.id === model.credentialId);
  const prefix = cred ? `[${cred.label || cred.provider}] ` : "";
  return prefix + (model.label || model.id);
}

function RoutingChain({
  models,
  credentials,
  defaultModelId,
  onSave,
}: {
  models: ModelConfig[];
  credentials: AtlasCredential[];
  defaultModelId: string;
  onSave: (defaultId: string, backup1Id: string, backup2Id: string) => void;
}) {
  const defaultModel = models.find((m) => m.id === defaultModelId);
  const fallbackIds = defaultModel?.fallbackModelIds ?? [];
  const backup1Id = fallbackIds[0] ?? "";
  const backup2Id = fallbackIds[1] ?? "";

  const [draftDefault, setDraftDefault] = useState(defaultModelId);
  const [draftBackup1, setDraftBackup1] = useState(backup1Id);
  const [draftBackup2, setDraftBackup2] = useState(backup2Id);

  const fallbackKey = fallbackIds.join("|");

  useEffect(() => {
    setDraftDefault(defaultModelId);
    setDraftBackup1(fallbackIds[0] ?? "");
    setDraftBackup2(fallbackIds[1] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultModelId, fallbackKey]);

  const enabledModels = models.filter((m) => m.enabled);

  const handleChange = (
    newDefault: string,
    newBackup1: string,
    newBackup2: string,
  ) => {
    setDraftDefault(newDefault);
    setDraftBackup1(newBackup1);
    setDraftBackup2(newBackup2);
    onSave(newDefault, newBackup1, newBackup2);
  };

  const renderOptions = (excludeId = "") => (
    <>
      <option value="">— none —</option>
      {enabledModels
        .filter((m) => m.id !== excludeId)
        .map((m) => (
          <option key={m.id} value={m.id}>
            {modelDisplayName(m, credentials)}
          </option>
        ))}
    </>
  );

  return (
    <div className="atlas-rchain">
      <div className="atlas-rchain__fields">
        <label className="atlas-rchain__field">
          <span className="atlas-rchain__field-label">Default</span>
          <select
            className="atlas-rchain__select"
            value={draftDefault}
            onChange={(event) =>
              handleChange(event.target.value, draftBackup1, draftBackup2)
            }
          >
            {renderOptions()}
          </select>
        </label>
        <label className="atlas-rchain__field">
          <span className="atlas-rchain__field-label">Backup 1</span>
          <select
            className="atlas-rchain__select"
            value={draftBackup1}
            onChange={(event) =>
              handleChange(draftDefault, event.target.value, draftBackup2)
            }
          >
            {renderOptions(draftDefault)}
          </select>
        </label>
        <label className="atlas-rchain__field">
          <span className="atlas-rchain__field-label">Backup 2</span>
          <select
            className="atlas-rchain__select"
            value={draftBackup2}
            onChange={(event) =>
              handleChange(draftDefault, draftBackup1, event.target.value)
            }
          >
            {renderOptions(draftDefault)}
          </select>
        </label>
      </div>
    </div>
  );
}

function AddModelInline({
  credential,
  available,
  fetchError,
  onAdd,
}: {
  credential: AtlasCredential;
  available: string[];
  fetchError: string | null;
  onAdd: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
    setOpen(false);
  };

  const selectModel = (modelId: string) => {
    onAdd(modelId);
    setOpen(false);
  };

  return (
    <div className="atlas-add-model-inline">
      <button
        type="button"
        className="atlas-add-model-inline__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="atlas-add-model-inline__icon">{open ? "−" : "+"}</span>
        <span>Add model</span>
      </button>
      {open ? (
        <div className="atlas-add-model-inline__popover">
          {available.length > 0 ? (
            <div className="atlas-add-model-inline__list">
              <select
                className="atlas-add-model-inline__select"
                onChange={(event) => {
                  if (event.target.value) selectModel(event.target.value);
                }}
                value=""
              >
                <option value="">Pick a model…</option>
                {available.map((modelId) => (
                  <option key={modelId} value={modelId}>
                    {modelId}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <form className="atlas-add-model-inline__manual" onSubmit={submit}>
            <input
              className="atlas-add-model-inline__input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`Type a ${credential.provider} model ID`}
            />
            <button
              type="submit"
              className="atlas-action atlas-action--primary atlas-action--small"
              disabled={!draft.trim()}
            >
              Add
            </button>
          </form>
          {fetchError ? (
            <div className="atlas-add-model-inline__error">{fetchError}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface LlmLogEntry {
  id: string;
  runId: string | null;
  conversationId: string | null;
  userId: string | null;
  domain: string | null;
  modelId: string | null;
  provider: string | null;
  round: number;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  success: boolean;
  error: string | null;
  toolCalls: string;
  createdAt: string;
}

function parseToolCallList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function LlmLogsPanel() {
  const [logs, setLogs] = useState<LlmLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "ok" | "failed">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/llm-logs?limit=100");
      const payload = await response.json();
      if (!response.ok) {
        setLoadError(payload.error || "Could not load LLM logs.");
        return;
      }
      setLogs(payload.logs ?? []);
      setTotal(payload.total ?? 0);
    } catch {
      setLoadError("Could not load LLM logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const successCount = logs.filter((log) => log.success).length;
  const tokensInTotal = logs.reduce((sum, log) => sum + (log.tokensIn ?? 0), 0);
  const tokensOutTotal = logs.reduce((sum, log) => sum + (log.tokensOut ?? 0), 0);

  return (
    <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Observability</p>
          <h2 className="atlas-section__title">LLM call logs</h2>
          <p className="atlas-section__copy">
            Every live model call the assistant makes — model, provider, tokens, latency, and outcome.
          </p>
        </div>

        <div className="atlas-chip-row" style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span className="atlas-badge atlas-badge--blue">{total} total</span>
          <span className={`atlas-badge ${successCount === logs.length && logs.length > 0 ? "atlas-badge--green" : ""}`}>
            {successCount}/{logs.length} success
          </span>
          <span className="atlas-badge">{tokensInTotal} tokens in</span>
          <span className="atlas-badge">{tokensOutTotal} tokens out</span>
        </div>

        <div className="atlas-chip-row" style={{ marginBottom: 16, display: "flex", gap: "8px" }}>
          <select 
            className="atlas-action atlas-action--ghost atlas-action--small"
            style={{ padding: "4px 8px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "4px", color: "var(--text)" }}
            value={filter} 
            onChange={(e) => setFilter(e.target.value as "all" | "ok" | "failed")}
          >
            <option value="all">All Logs</option>
            <option value="ok">Success Only</option>
            <option value="failed">Failed Only</option>
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

        {logs.length === 0 && !loading ? (
          <div className="atlas-card atlas-card--soft">
            <div className="atlas-card__title">No LLM calls yet</div>
            <div className="atlas-card__body">
              Send a message in chat with a model configured and the calls will appear here.
            </div>
          </div>
        ) : (
          <div className="atlas-llm-log">
            {logs
              .filter(log => filter === "all" ? true : filter === "ok" ? log.success : !log.success)
              .map((log) => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div className="atlas-llm-log__entry" key={log.id} data-expanded={isExpanded ? "true" : undefined}>
                  <button
                    type="button"
                    className="atlas-llm-log__row"
                    data-failed={log.success ? undefined : "true"}
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  >
                    <span className="atlas-llm-log__cell atlas-llm-log__cell--time" data-label="Time">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="atlas-llm-log__cell atlas-llm-log__cell--model" data-label="Model">
                      {log.modelId ?? "—"}
                    </span>
                    <span className="atlas-llm-log__cell atlas-llm-log__cell--status" data-label="Status">
                      <span className={`atlas-badge ${log.success ? "atlas-badge--green" : "atlas-badge--red"}`}>
                        {log.success ? "ok" : "failed"}
                      </span>
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className="atlas-llm-log__inspector">
                      <div className="atlas-llm-log__inspector-grid">
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Provider</span>
                          <span className="atlas-llm-log__inspector-val">{log.provider || "—"}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Domain</span>
                          <span className="atlas-llm-log__inspector-val">{log.domain || "—"}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Round</span>
                          <span className="atlas-llm-log__inspector-val">{log.round || "0"}</span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Latency</span>
                          <span className="atlas-llm-log__inspector-val">
                            {log.latencyMs != null ? `${(log.latencyMs / 1000).toFixed(2)}s` : "—"}
                          </span>
                        </div>
                        <div className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Tokens</span>
                          <span className="atlas-llm-log__inspector-val">
                            In: {log.tokensIn ?? 0} | Out: {log.tokensOut ?? 0}
                          </span>
                        </div>
                      </div>

                      <div className="atlas-llm-log__inspector-section">
                        <span className="atlas-llm-log__inspector-label">Tools Executed</span>
                        <div className="atlas-llm-log__inspector-code">
                          {parseToolCallList(log.toolCalls).length > 0 
                            ? parseToolCallList(log.toolCalls).join("\n") 
                            : "None"}
                        </div>
                      </div>

                      {!log.success && log.error ? (
                        <div className="atlas-llm-log__inspector-section">
                          <span className="atlas-llm-log__inspector-label">Error Output</span>
                          <div className="atlas-llm-log__inspector-code atlas-llm-log__inspector-code--error">
                            {log.error}
                          </div>
                        </div>
                      ) : null}
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

export function AtlasAdmin() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("llm");
  const [viewMode, setViewMode] = useState<"menu" | "detail">("menu");
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [routing, setRouting] = useState<RoutingRule[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("");
  const [embeddingModelId, setEmbeddingModelId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Admin Co-Pilot Chat Drawer States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; text: string; card?: any }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Model List Filter and Collapse States
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [expandedCredentials, setExpandedCredentials] = useState<Record<string, boolean>>({});

  const [selectedCredentialId, setSelectedCredentialId] = useState("");
  const [credentials, setCredentials] = useState<AtlasCredential[]>([]);
  const [credentialForm, setCredentialForm] = useState({
    label: "",
    provider: "openai" as AtlasProvider,
    apiKey: "",
    baseUrl: "",
  });
  const [providerModelsByCredential, setProviderModelsByCredential] = useState<Record<string, string[]>>({});
  const [providerModelsError, setProviderModelsError] = useState<Record<string, string | null>>({});
  const [showApiKey, setShowApiKey] = useState(false);

  const [voice, setVoice] = useState({
    sttLanguage: "en-US",
    ttsVoiceURI: "",
    ttsRate: 1,
    ttsPitch: 1,
    sttModelId: "",
    ttsModelId: "local:piper",
    sttMode: "native_first",
    ttsMode: "server_first",
    dailyVoiceLimitMinutes: 15,
  });
  const [sttModelOptions, setSttModelOptions] = useState<{ id: string; label: string }[]>([]);
  const [ttsModelOptions, setTtsModelOptions] = useState<{ id: string; label: string }[]>([]);
  const [piperAvailable, setPiperAvailable] = useState(false);
  const [ttsTesting, setTtsTesting] = useState(false);
  const [serperKey, setSerperKey] = useState("");
  const [serperConfigured, setSerperConfigured] = useState(false);
  const [serperTesting, setSerperTesting] = useState(false);
  const [serperTestResult, setSerperTestResult] = useState<string | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");

  const [mcpServers, setMcpServers] = useState<AtlasMcpServer[]>([]);
  const [mcpForm, setMcpForm] = useState({
    id: "",
    name: "",
    url: "",
    token: "",
    command: "",
    args: "",
    env: "",
  });
  const [mcpDiscoverError, setMcpDiscoverError] = useState<string | null>(null);
  const [mcpDiscoveredTools, setMcpDiscoveredTools] = useState<string[]>([]);
  const [mcpDiscoveredRoles, setMcpDiscoveredRoles] = useState<string[]>([]);
  const [mcpDiscoveredToolRoles, setMcpDiscoveredToolRoles] = useState<Record<string, string[]>>({});
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const [integrations, setIntegrations] = useState<IntegrationDefinition[]>([]);
  const [integrationCapabilities, setIntegrationCapabilities] = useState<{ id: string; name: string; category: string }[]>([]);
  const [integrationHealth, setIntegrationHealth] = useState<{ integrationId: string; name: string; configured: boolean; status: string }[]>([]);
  const [integrationsView, setIntegrationsView] = useState<"catalog" | "capability">("catalog");
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [integrationConfigForm, setIntegrationConfigForm] = useState({ baseUrl: "", apiKey: "" });
  const [addIntegrationOpen, setAddIntegrationOpen] = useState(false);
  const [addIntegrationForm, setAddIntegrationForm] = useState({
    id: "", name: "", transport: "mcp", authMethods: JSON.stringify([{ kind: "oauth2" }]),
    capabilities: JSON.stringify([]),
  });
  const [editIntegrationOpen, setEditIntegrationOpen] = useState(false);
  const [editIntegrationForm, setEditIntegrationForm] = useState({
    name: "", transport: "mcp", enabled: true,
    authMethods: "", capabilities: "",
  });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/models");
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Could not load admin data.");
        return;
      }

      setModels(payload.models);
      setRouting(payload.routing);
      setDefaultModelId(payload.defaultModelId);
      setEmbeddingModelId(payload.embeddingModelId ?? "");
      setError(null);
    } catch {
      setError("Could not reach the admin service.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!formError) return;
    const timer = window.setTimeout(() => setFormError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [formError]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const loadVoice = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/voice");
      const payload = await response.json();
      if (response.ok && payload.voice) {
        const sttOptions = Array.isArray(payload.sttModels)
          ? payload.sttModels.map((entry: { id: string; label: string }) => ({
              id: entry.id,
              label: entry.label,
            }))
          : [];
        const ttsOptions = Array.isArray(payload.ttsModels)
          ? payload.ttsModels.map((entry: { id: string; label: string }) => ({
              id: entry.id,
              label: entry.label,
            }))
          : [];

        setSttModelOptions(sttOptions);
        setTtsModelOptions(ttsOptions);
        setPiperAvailable(payload.piperAvailable === true);

        const sttIds = new Set(sttOptions.map((entry: { id: string }) => entry.id));
        const ttsIds = new Set(ttsOptions.map((entry: { id: string }) => entry.id));
        const savedStt = typeof payload.voice.sttModelId === "string" ? payload.voice.sttModelId : "";
        const savedTts = typeof payload.voice.ttsModelId === "string" ? payload.voice.ttsModelId : "";

        setVoice({
          sttLanguage: payload.voice.sttLanguage ?? "en-US",
          ttsVoiceURI: payload.voice.ttsVoiceURI ?? "",
          ttsRate: payload.voice.ttsRate ?? 1,
          ttsPitch: payload.voice.ttsPitch ?? 1,
          // Only keep a selection if it is still detected as STT/TTS-capable.
          sttModelId: savedStt && sttIds.has(savedStt) ? savedStt : sttOptions[0]?.id ?? "",
          ttsModelId: savedTts && ttsIds.has(savedTts) ? savedTts : ttsOptions[0]?.id ?? "",
          sttMode: payload.voice.sttMode ?? "native_first",
          ttsMode: payload.voice.ttsMode ?? "server_first",
          dailyVoiceLimitMinutes:
            typeof payload.voice.dailyVoiceLimitMinutes === "number"
              ? payload.voice.dailyVoiceLimitMinutes
              : 15,
        });
      }
    } catch {
      /* non-admin */
    }
  }, []);

  useEffect(() => {
    void loadVoice();
  }, [loadVoice]);

  useEffect(() => {
    if (activeTab === "voice") {
      void loadVoice();
    }
  }, [activeTab, loadVoice]);

  const loadSearchConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/search");
      const payload = await response.json();
      if (response.ok) {
        setSerperConfigured(payload.configured === true);
      }
    } catch {
      /* non-admin */
    }
  }, []);

  useEffect(() => {
    void loadSearchConfig();
  }, [loadSearchConfig]);

  const saveSerperKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setSerperTestResult(null);

    try {
      const response = await fetch("/api/admin/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: serperKey }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Could not save the Serper API key.");
        return;
      }

      setSerperConfigured(Boolean(serperKey.trim()));
      setSerperKey("");
      setNotice(serperKey.trim() ? "Serper API key saved. Web search now uses it." : "Serper API key removed.");
      setError(null);
    } catch {
      setError("Could not save the Serper API key.");
    }
  };

  const testSerperKey = async () => {
    setSerperTesting(true);
    setSerperTestResult(null);

    try {
      const response = await fetch("/api/admin/search", { method: "PUT" });
      const payload = await response.json();
      setSerperTestResult(payload.message || (payload.ok ? "Key works." : "Key did not validate."));
    } catch {
      setSerperTestResult("Could not test the key.");
    } finally {
      setSerperTesting(false);
    }
  };

  const loadDomains = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/domains");
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.domains)) {
        setDomains(payload.domains);
      }
    } catch {
      /* non-admin */
    }
  }, []);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  const loadCredentials = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/credentials");
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.credentials)) {
        setCredentials(payload.credentials);
        if (!selectedCredentialId && payload.credentials[0]) {
          setSelectedCredentialId(payload.credentials[0].id);
        }
      }
    } catch {
      /* non-admin */
    }
  }, [selectedCredentialId]);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const loadMcpServers = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/mcp");
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.servers)) {
        setMcpServers(payload.servers);
      }
    } catch {
      /* non-admin */
    }
  }, []);

  useEffect(() => {
    void loadMcpServers();
  }, [loadMcpServers]);

  const loadIntegrations = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/integrations");
      const payload = await response.json();
      if (response.ok) {
        if (Array.isArray(payload.integrations)) setIntegrations(payload.integrations);
        if (Array.isArray(payload.capabilities)) setIntegrationCapabilities(payload.capabilities);
      }
    } catch {
      /* non-admin */
    }
  }, []);

  const loadIntegrationHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/integrations/health");
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.health)) setIntegrationHealth(payload.health);
    } catch {
      /* non-admin */
    }
  }, []);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  useEffect(() => {
    void loadIntegrationHealth();
  }, [loadIntegrationHealth]);

  useEffect(() => {
    if (activeTab === "integrations") {
      void loadIntegrations();
      void loadIntegrationHealth();
    }
  }, [activeTab, loadIntegrations, loadIntegrationHealth]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("mcp_oauth_success")) {
      setNotice("Swiggy authorization complete. The token is saved; run Discover to list tools.");
      setError(null);
      void loadMcpServers();
      window.history.replaceState({}, "", "/admin");
    }

    const oauthError = params.get("mcp_oauth_error");

    if (oauthError) {
      setError(oauthError);
      window.history.replaceState({}, "", "/admin");
    }
  }, [loadMcpServers]);

  const fetchModelsForCredential = useCallback(async (credential: AtlasCredential) => {
    if (!credential.apiKey) {
      setProviderModelsByCredential((prev) => ({ ...prev, [credential.id]: [] }));
      return;
    }

    setProviderModelsError((prev) => ({ ...prev, [credential.id]: null }));

    try {
      const response = await fetch("/api/admin/provider-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId: credential.id,
          provider: credential.provider,
          apiKey: credential.apiKey,
          baseUrl: credential.baseUrl ?? "",
        }),
      });
      const payload = await response.json();

      if (Array.isArray(payload.models) && payload.models.length > 0) {
        setProviderModelsByCredential((prev) => ({ ...prev, [credential.id]: payload.models }));
      } else {
        setProviderModelsByCredential((prev) => ({ ...prev, [credential.id]: [] }));
        if (payload.error) {
          setProviderModelsError((prev) => ({ ...prev, [credential.id]: payload.error }));
        }
      }
    } catch {
      setProviderModelsByCredential((prev) => ({ ...prev, [credential.id]: [] }));
      setProviderModelsError((prev) => ({ ...prev, [credential.id]: "Could not load models from the provider." }));
    }
  }, []);

  useEffect(() => {
    credentials.forEach((credential) => {
      if (credential.apiKey && !(credential.id in providerModelsByCredential)) {
        void fetchModelsForCredential(credential);
      }
    });
  }, [credentials, providerModelsByCredential, fetchModelsForCredential]);

  const saveCredential = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setFormError(null);
    setSubmitting(true);

    const label = credentialForm.label.trim() || providerMeta[credentialForm.provider].label;

    try {
      const response = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...credentialForm, label }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setFormError(payload.error || "Could not save credential.");
        return;
      }

      setCredentials((prev) => [...prev, payload.credential]);
      setSelectedCredentialId(payload.credential.id);
      setCredentialForm({ label: "", provider: "openai", apiKey: "", baseUrl: "" });
      setNotice(
        payload.credential.provider === "custom"
          ? "Provider connected. Type a model ID to attach it."
          : "Provider connected. Pick a model from the list to attach it."
      );

      if (payload.credential.apiKey) {
        void fetchModelsForCredential(payload.credential);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save credential.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCredential = async (id: string) => {
    try {
      const response = await fetch("/api/admin/credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        setError("Could not remove credential.");
        return;
      }

      setCredentials((prev) => prev.filter((entry) => entry.id !== id));
      setNotice("Credential removed.");
    } catch {
      setError("Could not remove credential.");
    }
  };

  const sendAdminChatMessage = async (msg: string) => {
    if (!msg.trim()) return;
    setChatLoading(true);
    const userTurn = { role: "user" as const, text: msg };
    setChatHistory((prev) => [...prev, userTurn]);
    setChatMessage("");

    try {
      const response = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: chatHistory.map(h => ({ role: h.role, text: h.text }))
        }),
      });

      const payload = await response.json();
      if (response.ok) {
        setChatHistory((prev) => [...prev, { role: "assistant", text: payload.reply, card: payload.card }]);
        // If a system modification occurred, refresh backend states
        if (payload.card && payload.card.status === "success") {
          void load();
          void loadCredentials();
          void loadMcpServers();
          void loadIntegrations();
        }
      } else {
        setChatHistory((prev) => [...prev, { role: "assistant", text: payload.error || "Co-Pilot could not process request." }]);
      }
    } catch {
      setChatHistory((prev) => [...prev, { role: "assistant", text: "Connection error. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  };

  const addDomain = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);

    try {
      const response = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Could not add domain.");
        return;
      }

      setDomains(payload.domains);
      setNewDomain("");
      setNotice("Domain added. It is now available for routing and the assistant.");
      setError(null);
    } catch {
      setError("Could not add domain.");
    }
  };

  const deleteDomain = async (domain: string) => {
    try {
      const response = await fetch("/api/admin/domains", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Could not remove domain.");
        return;
      }

      setDomains(payload.domains);
      setNotice("Domain removed.");
    } catch {
      setError("Could not remove domain.");
    }
  };

  const saveVoice = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);

    try {
      const response = await fetch("/api/admin/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voice),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Could not save voice config.");
        return;
      }

      setVoice({
        sttLanguage: payload.voice.sttLanguage ?? "en-US",
        ttsVoiceURI: payload.voice.ttsVoiceURI ?? "",
        ttsRate: payload.voice.ttsRate ?? 1,
        ttsPitch: payload.voice.ttsPitch ?? 1,
        sttModelId: payload.voice.sttModelId ?? "",
        ttsModelId: payload.voice.ttsModelId ?? "local:piper",
        sttMode: payload.voice.sttMode ?? "native_first",
        ttsMode: payload.voice.ttsMode ?? "server_first",
        dailyVoiceLimitMinutes:
          typeof payload.voice.dailyVoiceLimitMinutes === "number"
            ? payload.voice.dailyVoiceLimitMinutes
            : 15,
      });
      setNotice("Voice configuration saved. Mic and speak in chat will use these modes and models.");
      setError(null);
    } catch {
      setError("Could not save voice config.");
    }
  };

  const testTts = async () => {
    setTtsTesting(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Atlas voice check. Text to speech is working." }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        const payload = contentType.includes("application/json")
          ? await response.json().catch(() => ({}))
          : {};
        setError((payload as { error?: string }).error || "TTS test failed.");
        return;
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 44) {
        setError("TTS returned empty audio.");
        return;
      }

      const blob = new Blob([buffer], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = url;

      await new Promise<void>((resolve, reject) => {
        audio.oncanplaythrough = () => resolve();
        audio.onerror = () => reject(new Error("Browser could not decode the TTS audio."));
        // Some browsers never fire canplaythrough for short clips.
        window.setTimeout(() => resolve(), 500);
      });

      await audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
      setNotice("TTS test played successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "TTS test failed.";
      setError(
        message.includes("NotAllowedError") || message.includes("play()")
          ? "Browser blocked audio playback. Click Test TTS again (needs a user gesture)."
          : `${message} Check Admin → Voice TTS target and Piper install.`
      );
    } finally {
      setTtsTesting(false);
    }
  };

  const addModelToCredential = async (credentialId: string, modelId: string) => {
    const cleanId = modelId.trim();
    if (!cleanId || !credentialId) {
      return;
    }

    setNotice(null);

    try {
      const response = await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cleanId,
          credentialId,
          label: cleanId,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Could not save model.");
        return;
      }

      setModels(payload.models);
      setDefaultModelId(payload.defaultModelId);
      setEmbeddingModelId(payload.embeddingModelId ?? "");
      setNotice("Model added to provider.");
      setError(null);
    } catch {
      setError("Could not save model.");
    }
  };

  const deleteModel = async (id: string) => {
    try {
      const response = await fetch("/api/admin/models", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Could not delete model.");
        return;
      }

      setModels(payload.models);
      setDefaultModelId(payload.defaultModelId);
      setEmbeddingModelId(payload.embeddingModelId ?? "");
      setNotice("Model removed.");
    } catch {
      setError("Could not delete model.");
    }
  };

  const saveProviderChain = async (
    defaultId: string,
    backup1Id: string,
    backup2Id: string
  ) => {
    setNotice(null);
    setError(null);

    const fallbacks: string[] = [];
    if (backup1Id) fallbacks.push(backup1Id);
    if (backup2Id) fallbacks.push(backup2Id);

    try {
      // Step 1: save the default model.
      const defaultResponse = await fetch("/api/admin/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setDefault", modelId: defaultId }),
      });
      const defaultPayload = await defaultResponse.json();

      if (!defaultResponse.ok) {
        setError(defaultPayload.error || "Could not set default model.");
        return;
      }

      // Step 2: save the fallback models for the default.
      const fallbackResponse = await fetch("/api/admin/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setFallbacks", modelId: defaultId, fallbackModelIds: fallbacks }),
      });
      const fallbackPayload = await fallbackResponse.json();

      if (!fallbackResponse.ok) {
        setError(fallbackPayload.error || "Could not save fallback models.");
        return;
      }

      setModels(fallbackPayload.models);
      setDefaultModelId(fallbackPayload.defaultModelId);
      setEmbeddingModelId(fallbackPayload.embeddingModelId ?? "");
      setNotice("Provider chain saved.");
    } catch {
      setError("Could not save provider chain.");
    }
  };

  const saveEmbeddingModel = async (id: string) => {
    setNotice(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setEmbedding", modelId: id }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Could not save embedding model.");
        return;
      }

      setEmbeddingModelId(payload.embeddingModelId ?? "");
      setNotice("Embedding model saved.");
    } catch {
      setError("Could not save embedding model.");
    }
  };

  const saveMcpServer = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setMcpDiscoveredTools([]);
    setMcpDiscoverError(null);

    try {
      const response = await fetch("/api/admin/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mcpForm.id || undefined,
          name: mcpForm.name || undefined,
          url: mcpForm.url,
          token: mcpForm.token,
          command: mcpForm.command,
          args: mcpForm.args,
          env: mcpForm.env,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Could not save MCP server.");
        return;
      }

      setMcpServers((prev) => {
        const without = prev.filter((entry) => entry.id !== payload.server.id);
        return [...without, payload.server];
      });
      setMcpForm({ id: "", name: "", url: "", token: "", command: "", args: "", env: "" });
      setMcpDiscoveredRoles(payload.server.roles ?? []);
      setMcpDiscoveredToolRoles(payload.server.toolRoles ?? {});
      setNotice(
        payload.server.lastError
          ? "MCP server saved, but tool discovery failed. Check the endpoint and token."
          : "MCP connected. Tools and roles were discovered automatically."
      );
      setError(null);
    } catch {
      setError("Could not save MCP server.");
    }
  };

  const editMcpServer = (server: AtlasMcpServer) => {
    setMcpForm({
      id: server.id,
      name: server.name,
      url: server.url ?? "",
      token: server.token ?? "",
      command: server.command,
      args: server.args.join("\n"),
      env: Object.entries(server.env)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n"),
    });
    setMcpDiscoveredTools([]); // placeholder; real list comes from discover
    setMcpDiscoverError(null);
  };

  const deleteMcpServer = async (id: string) => {
    try {
      const response = await fetch("/api/admin/mcp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        setError("Could not remove MCP server.");
        return;
      }

      setMcpServers((prev) => prev.filter((entry) => entry.id !== id));
      setNotice("MCP server removed.");
    } catch {
      setError("Could not remove MCP server.");
    }
  };

  const discoverMcpTools = async (id: string) => {
    setMcpDiscoveredTools([]);
    setMcpDiscoverError(null);
    setConnectingId(id);

    try {
      const response = await fetch("/api/admin/mcp/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMcpDiscoverError(payload.error || "Could not discover tools.");
        return;
      }

      setMcpDiscoveredTools(payload.tools.map((tool: { name: string }) => tool.name));
      setMcpDiscoveredRoles(payload.roles ?? []);
      setMcpDiscoveredToolRoles(payload.toolRoles ?? {});
      setMcpServers((prev) =>
        prev.map((server) =>
          server.id === id
            ? { ...server, roles: payload.roles ?? [], toolRoles: payload.toolRoles ?? {}, toolCount: payload.tools?.length ?? server.toolCount }
            : server
        )
      );
    } catch {
      setMcpDiscoverError("Could not discover tools.");
    } finally {
      setConnectingId(null);
    }
  };

  const saveRouting = async (extra: Partial<{ defaultModelId: string }> = {}) => {
    try {
      const response = await fetch("/api/admin/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extra }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Could not save routing.");
        return;
      }

      setRouting(payload.routing);
      setDefaultModelId(payload.defaultModelId);
      setNotice("Routing updated.");
    } catch {
      setError("Could not save routing.");
    }
  };

  const updateDomainRoute = async (domain: AtlasActionDomain, modelId: string) => {
    const response = await fetch("/api/admin/routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, modelId }),
    });
    const payload = await response.json();

    if (response.ok) {
      setRouting(payload.routing);
      setNotice(`Routing for ${domain} updated.`);
    }
  };

  const handleAddIntegration = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setError(null);
    try {
      const authMethods = JSON.parse(addIntegrationForm.authMethods);
      const capabilities = JSON.parse(addIntegrationForm.capabilities || "[]");
      const response = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: addIntegrationForm.id.trim(),
          name: addIntegrationForm.name.trim(),
          transport: addIntegrationForm.transport,
          authMethods,
          capabilities,
        }),
      });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error || "Could not create integration."); return; }
      setIntegrations((prev) => [...prev, payload.integration]);
      setAddIntegrationOpen(false);
      setAddIntegrationForm({ id: "", name: "", transport: "mcp", authMethods: JSON.stringify([{ kind: "oauth2" }]), capabilities: JSON.stringify([]) });
      setNotice("Integration created.");
      void loadIntegrationHealth();
    } catch {
      setError("Could not create integration.");
    }
  };

  const handleDeleteIntegration = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/integrations/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError((payload as { error?: string }).error || "Could not delete integration.");
        return;
      }
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
      setSelectedIntegrationId(null);
      setNotice("Integration deleted.");
      void loadIntegrationHealth();
    } catch {
      setError("Could not delete integration.");
    }
  };

  const handleToggleIntegration = async (id: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/admin/integrations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (response.ok) {
        setIntegrations((prev) => prev.map((i) => (i.id === id ? { ...i, enabled } : i)));
        void loadIntegrationHealth();
      }
    } catch { /* ignore */ }
  };

  const handleSaveIntegrationConfig = async (integrationId: string) => {
    setNotice(null);
    setError(null);
    try {
      const response = await fetch(`/api/admin/integrations/${integrationId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: integrationConfigForm.baseUrl || undefined,
          apiKey: integrationConfigForm.apiKey || undefined,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError((payload as { error?: string }).error || "Could not save config.");
        return;
      }
      setNotice("Configuration saved.");
      void loadIntegrationHealth();
    } catch {
      setError("Could not save config.");
    }
  };

  const handleUpdateIntegration = async (id: string) => {
    setNotice(null);
    setError(null);
    try {
      const authMethods = editIntegrationForm.authMethods ? JSON.parse(editIntegrationForm.authMethods) : undefined;
      const capabilities = editIntegrationForm.capabilities ? JSON.parse(editIntegrationForm.capabilities) : undefined;
      const response = await fetch(`/api/admin/integrations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editIntegrationForm.name || undefined,
          transport: editIntegrationForm.transport || undefined,
          enabled: editIntegrationForm.enabled,
          authMethods,
          capabilities,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError((payload as { error?: string }).error || "Could not update integration.");
        return;
      }
      setEditIntegrationOpen(false);
      setSelectedIntegrationId(null);
      void loadIntegrations();
      void loadIntegrationHealth();
      setNotice("Integration updated.");
    } catch {
      setError("Could not update integration.");
    }
  };

  const loadIntegrationConfig = async (integrationId: string) => {
    try {
      const response = await fetch(`/api/admin/integrations/${integrationId}/config`);
      const payload = await response.json();
      if (response.ok && payload.config) {
        setIntegrationConfigForm({ baseUrl: payload.config.baseUrl || "", apiKey: "" });
      }
    } catch { /* ignore */ }
  };

  const selectIntegration = (id: string) => {
    if (selectedIntegrationId === id) {
      setSelectedIntegrationId(null);
      setEditIntegrationOpen(false);
      return;
    }
    setSelectedIntegrationId(id);
    setEditIntegrationOpen(false);
    void loadIntegrationConfig(id);
  };

  const startEditIntegration = (integration: IntegrationDefinition) => {
    setEditIntegrationForm({
      name: integration.name,
      transport: integration.transport,
      enabled: integration.enabled,
      authMethods: JSON.stringify(integration.authMethods),
      capabilities: JSON.stringify(integration.capabilities),
    });
    setEditIntegrationOpen(true);
  };

  return (
    <div className="atlas-admin" style={{ display: "flex", width: "100%", height: "100vh", background: "#0b1220", position: "relative", overflow: "hidden" }}>
      {/* Navigation Sidebar */}
      <aside
        className={`atlas-admin-sidebar ${isMobileMenuOpen ? "open" : ""}`}
        style={{
          width: 280,
          background: "#0f172a",
          borderRight: "1px solid rgba(148, 163, 184, 0.15)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "24px 18px",
          height: "100%",
          zIndex: 100,
          transition: "transform 0.3s ease-in-out",
          position: typeof window !== "undefined" && window.innerWidth < 1024 ? "absolute" : "relative",
          transform: typeof window !== "undefined" && window.innerWidth < 1024 && !isMobileMenuOpen ? "translateX(-100%)" : "translateX(0)"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24, overflowY: "auto" }}>
          {/* Logo Brand */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ margin: 0, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#10b981", fontWeight: 700 }}>Configure</p>
              <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#f8fafc" }}>Control plane</h1>
            </div>
            {isMobileMenuOpen && (
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Grouped Links */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {adminNav.map((section) => (
              <div key={section.group} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>{section.group}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {section.items.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(tab.id);
                          setIsMobileMenuOpen(false);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: isActive ? "rgba(16, 185, 129, 0.1)" : "transparent",
                          color: isActive ? "#10b981" : "#94a3b8",
                          border: "none",
                          fontSize: "0.88rem",
                          fontWeight: isActive ? 700 : 500,
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Pinned Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid rgba(148, 163, 184, 0.1)", paddingTop: 16 }}>
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 40,
              borderRadius: 8,
              background: "rgba(255, 255, 255, 0.04)",
              color: "#f8fafc",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
              border: "1px solid rgba(148, 163, 184, 0.15)",
              transition: "background 0.2s"
            }}
          >
            ← Back to App
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 40,
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "1px solid rgba(239, 68, 68, 0.2)",
              cursor: "pointer",
              transition: "background 0.2s"
            }}
          >
            {signingOut ? "Signing out…" : "Sign Out"}
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", position: "relative" }}>
        {/* Top Header for Mobile Menu Toggles */}
        <header
          style={{
            padding: "16px 20px",
            background: "#0f172a",
            borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            justifyContent: "space-between"
          }}
          className="atlas-admin-topbar-mobile"
        >
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "#f8fafc",
              fontSize: 20,
              cursor: "pointer"
            }}
            className="atlas-admin-menu-toggle-btn"
          >
            ☰ Menu
          </button>
          <span style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.95rem" }}>
            {adminNav.flatMap((g) => g.items).find((t) => t.id === activeTab)?.label}
          </span>
          <div style={{ width: 40 }} /> {/* Spacer */}
        </header>

        <div className="atlas-admin__main" style={{ flex: 1, padding: "24px 20px", maxWidth: 1000, width: "100%", margin: "0 auto" }}>
          {error ? (
            <div className="atlas-banner atlas-banner--error" style={{ marginBottom: 20 }}>
              <span className="atlas-banner__dot" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {notice ? (
            <div className="atlas-banner atlas-banner--success" style={{ marginBottom: 20 }}>
              <span className="atlas-banner__dot" aria-hidden="true" />
              <span>{notice}</span>
            </div>
          ) : null}

      {activeTab === "llm" ? (
        <div className="atlas-admin-panel">
          {/* Admin Co-Pilot Dedicated Model Config */}
          <section className="atlas-section">
            <div className="atlas-section__header">
              <p className="atlas-section__eyebrow">Co-Pilot Settings</p>
              <h2 className="atlas-section__title">Admin Co-Pilot Model</h2>
              <p className="atlas-section__copy">
                Select a dedicated AI model to power your administrative chat co-pilot helper.
              </p>
            </div>
            <div className="atlas-card" style={{ padding: 16 }}>
              <label className="atlas-rchain__field" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="atlas-rchain__field-label" style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--muted)" }}>Co-Pilot Model</span>
                <select
                  className="atlas-rchain__select"
                  style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)" }}
                  value={routing.find((r) => r.domain === "admin")?.modelId || defaultModelId}
                  onChange={(event) => {
                    void updateDomainRoute("admin", event.target.value);
                  }}
                >
                  <option value={defaultModelId}>Default ({defaultModelId || "none"})</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label || model.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* Configure Provider Card */}
          <section className="atlas-section">
            <div className="atlas-section__header">
              <p className="atlas-section__eyebrow">AI Provider Configuration</p>
              <h2 className="atlas-section__title">Configure AI Provider</h2>
              <p className="atlas-section__copy">
                Select your preferred provider and input your API key to connect.
              </p>
            </div>

            <form className="atlas-card" onSubmit={saveCredential}>
              <div className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">Select Provider</span>
                <select
                  className="atlas-assistant__composer-value"
                  style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)", width: "100%" }}
                  value={credentialForm.provider}
                  onChange={(e) => setCredentialForm({ ...credentialForm, provider: e.target.value as AtlasProvider, baseUrl: "" })}
                >
                  {providers.map((p) => (
                    <option key={p} value={p}>{providerMeta[p]?.label ?? p}</option>
                  ))}
                </select>
              </div>

              {credentialForm.provider === "custom" && (
                <label className="atlas-assistant__composer-field">
                  <span className="atlas-assistant__composer-label">Base URL</span>
                  <input
                    className="atlas-assistant__composer-value"
                    value={credentialForm.baseUrl}
                    onChange={(event) => setCredentialForm({ ...credentialForm, baseUrl: event.target.value })}
                    placeholder="https://your-endpoint/v1"
                    required
                  />
                </label>
              )}

              <label className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">API Key</span>
                <div className="atlas-provider__key">
                  <input
                    className="atlas-assistant__composer-value"
                    type={showApiKey ? "text" : "password"}
                    value={credentialForm.apiKey}
                    onChange={(event) => setCredentialForm({ ...credentialForm, apiKey: event.target.value })}
                    placeholder={`Enter your ${providerMeta[credentialForm.provider]?.label || ""} API key`}
                    required
                  />
                  <button
                    type="button"
                    className="atlas-provider__key-toggle"
                    onClick={() => setShowApiKey((visible) => !visible)}
                    style={{ background: "transparent", border: "none", color: "var(--muted)", padding: "0 8px", cursor: "pointer" }}
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <div className="atlas-form__actions" style={{ marginTop: 12 }}>
                <button
                  type="submit"
                  className="atlas-action atlas-action--primary"
                  style={{ width: "100%", justifyContent: "center", minHeight: 48, borderRadius: 12 }}
                  disabled={submitting}
                >
                  {submitting ? "Connecting & Fetching..." : "Connect & Fetch Models"}
                </button>
                {formError && (
                  <div className="atlas-form__error" role="alert" style={{ marginTop: 12 }}>
                    <span>{formError}</span>
                  </div>
                )}
              </div>
            </form>
          </section>

          {/* Dynamic Available Models Table */}
          <section className="atlas-section">
            <div className="atlas-section__header">
              <p className="atlas-section__eyebrow">Models</p>
              <h2 className="atlas-section__title">Available Models</h2>
              <p className="atlas-section__copy">
                These models were auto-discovered from your connected providers. Toggle to enable/disable them.
              </p>
            </div>

            {credentials.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <input
                  type="text"
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  placeholder="Search available models..."
                  style={{
                    width: "100%",
                    minHeight: 44,
                    borderRadius: 12,
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    padding: "0 12px",
                    fontSize: "0.9rem"
                  }}
                />
              </div>
            )}

            {credentials.length === 0 ? (
              <div className="atlas-card atlas-card--soft" style={{ textAlign: "center", padding: 24 }}>
                <p style={{ color: "var(--muted)" }}>No provider connected yet. Connect a provider above to fetch models.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {credentials.map((credential) => {
                  const fetchedModels = providerModelsByCredential[credential.id] ?? [];
                  
                  // Filter by search query
                  const filteredModels = fetchedModels.filter((modelId) =>
                    modelId.toLowerCase().includes(modelSearchQuery.toLowerCase())
                  );

                  if (fetchedModels.length === 0) return null;
                  if (modelSearchQuery && filteredModels.length === 0) return null;

                  const isExpanded = expandedCredentials[credential.id] !== false; // expanded by default

                  return (
                    <div
                      key={credential.id}
                      className="atlas-card"
                      style={{
                        padding: 0,
                        overflow: "hidden",
                        border: "1px solid rgba(148, 163, 184, 0.15)",
                        background: "rgba(15, 23, 42, 0.2)"
                      }}
                    >
                      {/* Provider Header Button */}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCredentials((prev) => ({
                            ...prev,
                            [credential.id]: !isExpanded
                          }))
                        }
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: "rgba(15, 23, 42, 0.6)",
                          border: "none",
                          padding: "16px 20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          color: "#f8fafc"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontWeight: 700, fontSize: "1rem" }}>
                            {providerMeta[credential.provider]?.label || credential.label} Models
                          </span>
                          <span className="atlas-badge atlas-badge--blue" style={{ fontSize: "0.7rem", padding: "2px 8px" }}>
                            {filteredModels.length} available
                          </span>
                        </div>
                        <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                          {isExpanded ? "▲ Hide" : "▼ Show"}
                        </span>
                      </button>

                      {/* Models List */}
                      {isExpanded && (
                        <div className="atlas-rows" style={{ borderTop: "1px solid rgba(148, 163, 184, 0.1)" }}>
                          {filteredModels.map((modelId) => {
                            const matchedModel = models.find((m) => m.id === modelId && m.credentialId === credential.id);
                            const isEnabled = matchedModel ? matchedModel.enabled : false;

                            return (
                              <div
                                className="atlas-row"
                                key={`${credential.id}-${modelId}`}
                                style={{
                                  padding: "14px 20px",
                                  borderBottom: "1px solid rgba(148, 163, 184, 0.08)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between"
                                }}
                              >
                                <div className="atlas-row__meta" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#e2e8f0" }}>{modelId}</span>
                                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                                    {credential.label}
                                  </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  <span style={{ fontSize: "0.75rem", color: isEnabled ? "#10b981" : "var(--muted)" }}>
                                    {isEnabled ? "Enabled" : "Disabled"}
                                  </span>
                                  <button
                                    type="button"
                                    className={`atlas-switch ${isEnabled ? "atlas-switch--active" : ""}`}
                                    style={{
                                      width: 46,
                                      height: 24,
                                      borderRadius: 12,
                                      background: isEnabled ? "#10b981" : "#334155",
                                      position: "relative",
                                      border: "none",
                                      cursor: "pointer",
                                      transition: "background 0.2s"
                                    }}
                                    onClick={() => {
                                      if (isEnabled && matchedModel) {
                                        void deleteModel(matchedModel.id);
                                      } else {
                                        void addModelToCredential(credential.id, modelId);
                                      }
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 18,
                                        height: 18,
                                        borderRadius: "50%",
                                        background: "#fff",
                                        position: "absolute",
                                        top: 3,
                                        left: isEnabled ? 25 : 3,
                                        transition: "left 0.2s"
                                      }}
                                    />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Default Routing Chain Settings */}
          <section className="atlas-section">
            <div className="atlas-section__header">
              <p className="atlas-section__eyebrow">Routing</p>
              <h2 className="atlas-section__title">Default Model & Routing</h2>
            </div>
            <div className="atlas-card" style={{ padding: 16 }}>
              <RoutingChain
                models={models}
                credentials={credentials}
                defaultModelId={defaultModelId}
                onSave={saveProviderChain}
              />
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "integrations" ? (
        <div className="atlas-admin-panel">
          {!selectedIntegrationId && !addIntegrationOpen ? (
            <>
              <div className="atlas-section__header">
                <p className="atlas-section__eyebrow">Connectors</p>
                <h2 className="atlas-section__title">Connector catalog</h2>
                <p className="atlas-section__copy">
                  Manage the connector catalog — define connectors, map capabilities,
                  transports, and monitor health.
                </p>
              </div>

              {/* Stats */}
              <div className="atlas-admin-menu__status" style={{ marginBottom: 24, borderTop: "none", paddingTop: 0 }}>
                <span className="atlas-badge atlas-badge--blue">{integrations.length} total</span>
                <span className="atlas-badge atlas-badge--green">{integrations.filter((i) => i.enabled).length} enabled</span>
                <span className="atlas-badge atlas-badge--red">{integrations.filter((i) => !i.enabled).length} disabled</span>
                <span className={`atlas-badge ${integrationHealth.filter((h) => h.status === "healthy").length > 0 ? "atlas-badge--green" : ""}`}>
                  {integrationHealth.filter((h) => h.status === "healthy").length} healthy
                </span>
                <span className={`atlas-badge ${integrationHealth.filter((h) => h.status === "unconfigured").length > 0 ? "atlas-badge--amber" : ""}`}>
                  {integrationHealth.filter((h) => h.status === "unconfigured").length} unconfigured
                </span>
              </div>

              {/* Connector List */}
              <div className="atlas-admin-menu__list" style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", margin: "0 -14px" }}>
                {integrations.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No connectors yet</div>
                ) : (
                  integrations.map((integration) => {
                    const health = integrationHealth.find((h) => h.integrationId === integration.id);
                    const requiredScopes = integration.authMethods.flatMap((m) => m.scopes ?? []);
                    return (
                      <button
                        key={integration.id}
                        type="button"
                        className="atlas-admin-menu__row"
                        style={{ padding: "16px 14px" }}
                        onClick={() => selectIntegration(integration.id)}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
                          <span className="atlas-admin-menu__row-label" style={{ fontWeight: 600 }}>{integration.name}</span>
                          <span className="atlas-chip-row" style={{ gap: 6 }}>
                            <span className={`atlas-badge ${integration.enabled ? "atlas-badge--green" : "atlas-badge--red"}`} style={{ fontSize: "0.6rem", padding: "4px 8px" }}>
                              {integration.transport.toUpperCase()}
                            </span>
                            {requiredScopes.length > 0 ? (
                              <span className="atlas-badge atlas-badge--blue" style={{ fontSize: "0.6rem", padding: "4px 8px" }}>
                                {requiredScopes.length} scope{requiredScopes.length === 1 ? "" : "s"}
                              </span>
                            ) : null}
                            <span style={{ fontSize: "0.7rem", color: "var(--faint)", fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                              {integration.authMethods.map((m) => m.kind).join(", ")}
                            </span>
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {health ? (
                            <span className={`atlas-badge ${health.status === "healthy" ? "atlas-badge--green" : health.status === "unconfigured" ? "atlas-badge--amber" : "atlas-badge--red"}`} style={{ fontSize: "0.6rem" }}>
                              {health.status}
                            </span>
                          ) : null}
                          <span className="atlas-admin-menu__row-arrow">→</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div style={{ marginTop: 24 }}>
                <button
                  type="button"
                  className="atlas-action atlas-action--primary"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => setAddIntegrationOpen(true)}
                >
                  + Add Connector
                </button>
              </div>
            </>
          ) : addIntegrationOpen ? (
            /* Add form Detail View */
            <div className="atlas-admin-detail">
              <div className="atlas-admin-detail__topbar">
                <button
                  type="button"
                  className="atlas-admin-detail__back"
                  onClick={() => setAddIntegrationOpen(false)}
                >
                  ← Back
                </button>
                <span className="atlas-admin-detail__title">Add Connector</span>
              </div>
              <form className="atlas-llm-log__inspector" style={{ background: "transparent", borderTop: "none", padding: 0 }} onSubmit={handleAddIntegration}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <label className="atlas-llm-log__inspector-item">
                    <span className="atlas-llm-log__inspector-label">ID (slug)</span>
                    <input className="atlas-action atlas-action--ghost" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)" }} value={addIntegrationForm.id} onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, id: e.target.value })} placeholder="swiggy" required />
                  </label>
                  <label className="atlas-llm-log__inspector-item">
                    <span className="atlas-llm-log__inspector-label">Name</span>
                    <input className="atlas-action atlas-action--ghost" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)" }} value={addIntegrationForm.name} onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, name: e.target.value })} placeholder="Swiggy" required />
                  </label>
                  <label className="atlas-llm-log__inspector-item">
                    <span className="atlas-llm-log__inspector-label">Transport</span>
                    <select className="atlas-action atlas-action--ghost" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)" }} value={addIntegrationForm.transport} onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, transport: e.target.value })}>
                      {TRANSPORT_KINDS.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                  </label>
                  <label className="atlas-llm-log__inspector-item">
                    <span className="atlas-llm-log__inspector-label">Auth Methods (JSON)</span>
                    <textarea className="atlas-action atlas-action--ghost" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)", minHeight: 80 }} value={addIntegrationForm.authMethods} onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, authMethods: e.target.value })} placeholder='[{"kind":"oauth2"}]' />
                  </label>
                  <label className="atlas-llm-log__inspector-item">
                    <span className="atlas-llm-log__inspector-label">Capabilities (JSON)</span>
                    <textarea className="atlas-action atlas-action--ghost" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)", minHeight: 80 }} value={addIntegrationForm.capabilities} onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, capabilities: e.target.value })} placeholder='[{"capabilityId":"food","priority":10}]' />
                  </label>
                </div>
                <div style={{ marginTop: 24 }}>
                  <button type="submit" className="atlas-action atlas-action--primary" style={{ width: "100%", justifyContent: "center" }}>Create Connector</button>
                </div>
              </form>
            </div>
          ) : selectedIntegrationId ? (
            /* Selected Integration Detail View */
            (() => {
              const integration = integrations.find((i) => i.id === selectedIntegrationId);
              if (!integration) return null;
              const health = integrationHealth.find((h) => h.integrationId === integration.id);

              return (
                <div className="atlas-admin-detail">
                  <div className="atlas-admin-detail__topbar">
                    <button
                      type="button"
                      className="atlas-admin-detail__back"
                      onClick={() => { setSelectedIntegrationId(null); setEditIntegrationOpen(false); }}
                    >
                      ← Back
                    </button>
                    <span className="atlas-admin-detail__title">{integration.name}</span>
                  </div>

                  <div className="atlas-chip-row" style={{ marginTop: 4, marginBottom: 16 }}>
                    <button type="button" className={`atlas-action ${integration.enabled ? "atlas-action--ghost" : "atlas-action--primary"} atlas-action--small`} onClick={() => void handleToggleIntegration(integration.id, !integration.enabled)}>{integration.enabled ? "Disable" : "Enable"}</button>
                    <button type="button" className={`atlas-action ${editIntegrationOpen ? "atlas-action--primary" : "atlas-action--ghost"} atlas-action--small`} onClick={() => editIntegrationOpen ? setEditIntegrationOpen(false) : startEditIntegration(integration)}>{editIntegrationOpen ? "Cancel Edit" : "Edit Metadata"}</button>
                    <button type="button" className="atlas-action atlas-action--ghost atlas-action--small" style={{ color: "var(--red)", borderColor: "rgba(246, 173, 85, 0.3)" }} onClick={() => { if (window.confirm(`Delete ${integration.name}?`)) { void handleDeleteIntegration(integration.id); setSelectedIntegrationId(null); } }}>Delete</button>
                  </div>

                  {editIntegrationOpen ? (
                    <form className="atlas-llm-log__inspector" style={{ background: "transparent", borderTop: "none", padding: 0 }} onSubmit={(e) => { e.preventDefault(); void handleUpdateIntegration(integration.id); }}>
                      <div className="atlas-section__eyebrow" style={{ marginBottom: 16 }}>Edit Metadata</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <label className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Name</span>
                          <input className="atlas-action atlas-action--ghost" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)" }} value={editIntegrationForm.name} onChange={(e) => setEditIntegrationForm({ ...editIntegrationForm, name: e.target.value })} />
                        </label>
                        <label className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Transport</span>
                          <select className="atlas-action atlas-action--ghost" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)" }} value={editIntegrationForm.transport} onChange={(e) => setEditIntegrationForm({ ...editIntegrationForm, transport: e.target.value })}>
                            {TRANSPORT_KINDS.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                          </select>
                        </label>
                        <label className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Auth Methods (JSON)</span>
                          <textarea className="atlas-action atlas-action--ghost" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)", minHeight: 80 }} value={editIntegrationForm.authMethods} onChange={(e) => setEditIntegrationForm({ ...editIntegrationForm, authMethods: e.target.value })} />
                        </label>
                        <label className="atlas-llm-log__inspector-item">
                          <span className="atlas-llm-log__inspector-label">Capabilities (JSON)</span>
                          <textarea className="atlas-action atlas-action--ghost" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)", minHeight: 80 }} value={editIntegrationForm.capabilities} onChange={(e) => setEditIntegrationForm({ ...editIntegrationForm, capabilities: e.target.value })} />
                        </label>
                      </div>
                      <div style={{ marginTop: 24 }}>
                        <button type="submit" className="atlas-action atlas-action--primary" style={{ width: "100%", justifyContent: "center" }}>Save Changes</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="atlas-llm-log__inspector" style={{ borderRadius: 8, borderTop: "1px solid var(--line)" }}>
                        <div className="atlas-section__eyebrow" style={{ marginBottom: 16 }}>Configuration</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          <label className="atlas-llm-log__inspector-item">
                            <span className="atlas-llm-log__inspector-label">Base URL</span>
                            <input className="atlas-action atlas-action--ghost" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)" }} value={integrationConfigForm.baseUrl} onChange={(e) => setIntegrationConfigForm({ ...integrationConfigForm, baseUrl: e.target.value })} placeholder="https://" />
                          </label>
                          <label className="atlas-llm-log__inspector-item">
                            <span className="atlas-llm-log__inspector-label">API Key</span>
                            <input className="atlas-action atlas-action--ghost" style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 12px", borderRadius: 6, color: "var(--text)" }} type="password" value={integrationConfigForm.apiKey} onChange={(e) => setIntegrationConfigForm({ ...integrationConfigForm, apiKey: e.target.value })} placeholder="Configure if needed" />
                          </label>
                        </div>
                        <div style={{ marginTop: 16 }}>
                          <button type="button" className="atlas-action atlas-action--primary atlas-action--small" onClick={() => void handleSaveIntegrationConfig(integration.id)}>Save Config</button>
                        </div>
                      </div>

                      <div className="atlas-llm-log__inspector" style={{ borderRadius: 8, borderTop: "1px solid var(--line)", marginTop: 16 }}>
                        <div className="atlas-section__eyebrow" style={{ marginBottom: 16 }}>Status & Health</div>
                        <div className="atlas-llm-log__inspector-grid">
                          <div className="atlas-llm-log__inspector-item">
                            <span className="atlas-llm-log__inspector-label">Health</span>
                            <span className={`atlas-llm-log__inspector-val`} style={{ color: health?.status === "healthy" ? "var(--green)" : health?.status === "unconfigured" ? "var(--red)" : "var(--red)" }}>
                              {health?.status ?? "unknown"}
                            </span>
                          </div>
                          <div className="atlas-llm-log__inspector-item">
                            <span className="atlas-llm-log__inspector-label">Transport</span>
                            <span className="atlas-llm-log__inspector-val">{integration.transport.toUpperCase()}</span>
                          </div>
                          <div className="atlas-llm-log__inspector-item" style={{ gridColumn: "1 / -1" }}>
                            <span className="atlas-llm-log__inspector-label">Required scopes</span>
                            <div className="atlas-chip-row" style={{ marginTop: 4 }}>
                              {integration.authMethods.flatMap((m) => m.scopes ?? []).length === 0 ? (
                                <span className="atlas-llm-log__inspector-val">None</span>
                              ) : null}
                              {integration.authMethods.flatMap((m) => m.scopes ?? []).map((scope) => (
                                <span key={scope} className="atlas-badge" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>{scope}</span>
                              ))}
                            </div>
                          </div>
                          <div className="atlas-llm-log__inspector-item" style={{ gridColumn: "1 / -1" }}>
                            <span className="atlas-llm-log__inspector-label">Capabilities</span>
                            <div className="atlas-chip-row" style={{ marginTop: 4 }}>
                              {integration.capabilities.length === 0 ? <span className="atlas-llm-log__inspector-val">None</span> : null}
                              {integration.capabilities.map((cap) => <span key={cap.capabilityId} className="atlas-badge" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>{cap.capabilityId} (p{cap.priority})</span>)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()
          ) : null}
        </div>
      ) : null}

      {activeTab === "connector-audit" ? (
        <ConnectorAuditPanel integrations={integrations} />
      ) : null}

      {activeTab === "connector-recipes" ? (
        <ConnectorRecipesPanel integrations={integrations} />
      ) : null}

      {activeTab === "skills" ? (
        <SkillsPanel />
      ) : null}

      {activeTab === "providers" ? (
        <ProvidersPanel />
      ) : null}

      {activeTab === "domains" ? (
        <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Domains</p>
          <h2 className="atlas-section__title">Action domains</h2>
          <p className="atlas-section__copy">
            Add a domain (for example &quot;flights&quot; or &quot;events&quot;) and it becomes available
            for routing and the assistant&apos;s tools. Built-in domains cannot be removed.
          </p>
        </div>

        <div className="atlas-rows">
          {domains.map((domain) => {
            const isBuiltIn = builtInDomains.includes(domain);

            return (
              <div className="atlas-row" key={domain}>
                <div className="atlas-row__meta">
                  <div className="atlas-row__title">{domain}</div>
                  <div className="atlas-row__body">{isBuiltIn ? "Built-in" : "Custom"}</div>
                </div>
                {isBuiltIn ? (
                  <span className="atlas-badge atlas-badge--blue">Locked</span>
                ) : (
                  <button
                    type="button"
                    className="atlas-inline-action"
                    onClick={() => deleteDomain(domain)}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <form className="atlas-card" onSubmit={addDomain} style={{ marginTop: 12 }}>
          <label className="atlas-assistant__composer-field">
            <span className="atlas-assistant__composer-label">New domain</span>
            <input
              className="atlas-assistant__composer-value"
              value={newDomain}
              onChange={(event) => setNewDomain(event.target.value)}
              placeholder="events"
              required
            />
          </label>
          <div style={{ marginTop: 14 }}>
            <button type="submit" className="atlas-action atlas-action--primary">
              Add domain
            </button>
          </div>
        </form>
      </section>
        </div>
      ) : null}

      {activeTab === "mcp" ? (
        <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">MCP Servers</p>
          <h2 className="atlas-section__title">Connected MCP servers</h2>
          <p className="atlas-section__copy">
            Add an endpoint and authentication, then Atlas discovers the tools and detects the
            server&apos;s roles automatically. No manual category needed.
          </p>
        </div>

        <div className="atlas-rows">
          {mcpServers.length === 0 ? (
            <div className="atlas-card atlas-card--soft">
              <div className="atlas-card__body">No MCP servers yet. Add one below.</div>
            </div>
          ) : (
            mcpServers.map((server) => (
              <div className="atlas-mcp" key={server.id}>
                <div className="atlas-mcp__head">
                  <div className="atlas-mcp__mark" aria-hidden="true">
                    {server.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="atlas-mcp__meta">
                    <div className="atlas-mcp__name">{server.name}</div>
                    <div className="atlas-mcp__detail">
                      {server.url ?? `${server.command}${server.args.length > 0 ? ` ${server.args.join(" ")}` : ""}`}
                      {" · "}
                      {server.toolCount} tool{server.toolCount === 1 ? "" : "s"}
                      {server.token ? " · token set" : ""}
                    </div>
                  </div>
                  <div className="atlas-mcp__actions">
                    {server.url ? (
                      <a
                        className="atlas-inline-action"
                        href={`/api/admin/mcp/oauth/start?serverId=${server.id}`}
                      >
                        Connect
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="atlas-inline-action"
                      onClick={() => discoverMcpTools(server.id)}
                      disabled={connectingId === server.id}
                    >
                      {connectingId === server.id ? "Discovering…" : "Discover"}
                    </button>
                    <button
                      type="button"
                      className="atlas-inline-action"
                      onClick={() => editMcpServer(server)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="atlas-inline-action"
                      onClick={() => deleteMcpServer(server.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="atlas-mcp__roles">
                  <span className="atlas-mcp__roles-label">Roles</span>
                  {(server.roles?.length ?? 0) > 0 ? (
                    server.roles!.map((role) => (
                      <span className="atlas-badge atlas-badge--green" key={role}>
                        {role}
                      </span>
                    ))
                  ) : (
                    <span className="atlas-micro">Not detected yet — run Discover</span>
                  )}
                </div>

                {server.lastError ? (
                  <div className="atlas-micro" style={{ color: "var(--red)" }}>
                    Last discovery: {server.lastError}
                  </div>
                ) : null}

                {mcpDiscoveredTools.length > 0 ? (
                  <div className="atlas-mcp__tools">
                    <div className="atlas-mcp__tools-label">Discovered tools</div>
                    <div className="atlas-mcp__tool-chips">
                      {mcpDiscoveredTools.map((toolName) => (
                        <span className="atlas-chip" key={toolName}>
                          {toolName}
                          {mcpDiscoveredToolRoles[toolName]
                            ? ` · ${mcpDiscoveredToolRoles[toolName].join(", ")}`
                            : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        {mcpDiscoverError ? (
          <div className="atlas-card atlas-card--soft">
            <div className="atlas-card__body" style={{ color: "var(--red)" }}>
              {mcpDiscoverError}
            </div>
          </div>
        ) : null}

        <form className="atlas-card" onSubmit={saveMcpServer} style={{ marginTop: 12 }}>
          <div className="atlas-grid">
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">Endpoint URL (streamable HTTP)</span>
              <input
                className="atlas-assistant__composer-value"
                value={mcpForm.url}
                onChange={(event) => setMcpForm({ ...mcpForm, url: event.target.value })}
                placeholder="https://mcp.example.com/food"
              />
            </label>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">Authentication (Bearer token, optional)</span>
              <input
                className="atlas-assistant__composer-value"
                type="password"
                value={mcpForm.token}
                onChange={(event) => setMcpForm({ ...mcpForm, token: event.target.value })}
                placeholder="Paste the access token from the MCP provider"
              />
            </label>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">Name (optional — detected if blank)</span>
              <input
                className="atlas-assistant__composer-value"
                value={mcpForm.name}
                onChange={(event) => setMcpForm({ ...mcpForm, name: event.target.value })}
                placeholder="My MCP server"
              />
            </label>
          </div>
          <details className="atlas-mcp__advanced">
            <summary>Advanced — local command instead of URL</summary>
            <div className="atlas-grid">
              <label className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">Command (local stdio)</span>
                <input
                  className="atlas-assistant__composer-value"
                  value={mcpForm.command}
                  onChange={(event) => setMcpForm({ ...mcpForm, command: event.target.value })}
                  placeholder="agora-mcp"
                />
              </label>
              <label className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">Args (one per line)</span>
                <input
                  className="atlas-assistant__composer-value"
                  value={mcpForm.args}
                  onChange={(event) => setMcpForm({ ...mcpForm, args: event.target.value })}
                  placeholder="--port 8080"
                />
              </label>
              <label className="atlas-assistant__composer-field" style={{ gridColumn: "1 / -1" }}>
                <span className="atlas-assistant__composer-label">Environment (KEY=value per line)</span>
                <textarea
                  className="atlas-assistant__composer-value"
                  value={mcpForm.env}
                  onChange={(event) => setMcpForm({ ...mcpForm, env: event.target.value })}
                  placeholder="AGORA_TOKEN=secret"
                  rows={3}
                />
              </label>
            </div>
          </details>
          <button type="submit" className="atlas-action atlas-action--primary">
            {mcpForm.id ? "Update MCP server" : "Connect"}
          </button>
        </form>
      </section>
        </div>
      ) : null}

      {activeTab === "search" ? (
        <div className="atlas-admin-panel">
          <section className="atlas-section">
            <div className="atlas-section__header">
              <p className="atlas-section__eyebrow">Web search</p>
              <h2 className="atlas-section__title">Serper API key</h2>
              <p className="atlas-section__copy">
                Add your Serper.dev API key so Atlas can search the web for current information,
                news, and facts. The key is stored server-side only and never sent to the browser.
              </p>
            </div>

            {serperConfigured ? (
              <div className="atlas-banner atlas-banner--success">
                <span className="atlas-banner__dot" aria-hidden="true" />
                <span>Serper is configured. Web search is active.</span>
              </div>
            ) : (
              <div className="atlas-banner atlas-banner--error">
                <span className="atlas-banner__dot" aria-hidden="true" />
                <span>No Serper key yet — web search falls back to connected MCP servers.</span>
              </div>
            )}

            <form className="atlas-card" onSubmit={saveSerperKey}>
              <label className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">Serper API key</span>
                <input
                  className="atlas-assistant__composer-value"
                  type="password"
                  value={serperKey}
                  onChange={(event) => setSerperKey(event.target.value)}
                  placeholder="Paste your Serper API key from serper.dev"
                  required
                />
              </label>
              <button type="submit" className="atlas-action atlas-action--primary">
                Save API key
              </button>
            </form>

            {serperConfigured ? (
              <div className="atlas-chip-row">
                <button
                  type="button"
                  className="atlas-inline-action"
                  onClick={testSerperKey}
                  disabled={serperTesting}
                >
                  {serperTesting ? "Testing…" : "Test key"}
                </button>
              </div>
            ) : null}

            {serperTestResult ? (
              <div className={`atlas-banner ${serperTestResult.includes("works") ? "atlas-banner--success" : "atlas-banner--error"}`}>
                <span className="atlas-banner__dot" aria-hidden="true" />
                <span>{serperTestResult}</span>
              </div>
            ) : null}

            {serperConfigured ? (
              <form className="atlas-card atlas-card--soft" onSubmit={saveSerperKey}>
                <div className="atlas-card__title">Replace or remove the key</div>
                <div className="atlas-card__body">
                  Paste a new key to replace it, or submit with an empty field to remove it.
                </div>
                <label className="atlas-assistant__composer-field">
                  <span className="atlas-assistant__composer-label">New API key (optional)</span>
                  <input
                    className="atlas-assistant__composer-value"
                    type="password"
                    value={serperKey}
                    onChange={(event) => setSerperKey(event.target.value)}
                    placeholder="Leave empty to remove the key"
                  />
                </label>
                <button type="submit" className="atlas-action atlas-action--primary">
                  {serperKey.trim() ? "Replace key" : "Remove key"}
                </button>
              </form>
            ) : null}
          </section>
        </div>
      ) : null}

      {activeTab === "voice" ? (
        <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Voice</p>
          <h2 className="atlas-section__title">STT / TTS routing</h2>
          <p className="atlas-section__copy">
            Prefer device speech for the mic, and server TTS (Piper) for replies — with automatic
            fallback. Modes are Capacitor-ready for Android/iOS later. Model dropdowns only apply
            when the server engine is used.
          </p>
        </div>

        <div className="atlas-chip-row" style={{ marginBottom: 12 }}>
          <span className={`atlas-badge ${sttModelOptions.length > 0 ? "atlas-badge--green" : ""}`}>
            STT {sttModelOptions.length > 0 ? `${sttModelOptions.length} detected` : "none detected"}
          </span>
          <span className={`atlas-badge ${ttsModelOptions.length > 0 ? "atlas-badge--green" : ""}`}>
            TTS {ttsModelOptions.length > 0 ? `${ttsModelOptions.length} detected` : "none detected"}
          </span>
        </div>

        <form className="atlas-card" onSubmit={saveVoice}>
          <div className="atlas-grid atlas-grid--2">
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">STT mode (microphone)</span>
              <select
                className="atlas-assistant__composer-value"
                value={voice.sttMode}
                onChange={(event) => setVoice({ ...voice, sttMode: event.target.value })}
              >
                {VOICE_STT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {STT_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">TTS mode (spoken replies)</span>
              <select
                className="atlas-assistant__composer-value"
                value={voice.ttsMode}
                onChange={(event) => setVoice({ ...voice, ttsMode: event.target.value })}
              >
                {VOICE_TTS_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {TTS_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">STT model (server fallback)</span>
              <select
                className="atlas-assistant__composer-value"
                value={voice.sttModelId}
                onChange={(event) => setVoice({ ...voice, sttModelId: event.target.value })}
                disabled={sttModelOptions.length === 0}
              >
                {sttModelOptions.length === 0 ? (
                  <option value="">No STT-capable models detected</option>
                ) : (
                  sttModelOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">STT language</span>
              <input
                className="atlas-assistant__composer-value"
                value={voice.sttLanguage}
                onChange={(event) => setVoice({ ...voice, sttLanguage: event.target.value })}
                placeholder="en-US"
              />
            </label>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">TTS target (server)</span>
              <select
                className="atlas-assistant__composer-value"
                value={voice.ttsModelId}
                onChange={(event) => setVoice({ ...voice, ttsModelId: event.target.value })}
                disabled={ttsModelOptions.length === 0}
              >
                {ttsModelOptions.length === 0 ? (
                  <option value="">No TTS-capable engines detected</option>
                ) : (
                  ttsModelOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">Piper voice id (when using Local Piper)</span>
              <input
                className="atlas-assistant__composer-value"
                value={voice.ttsVoiceURI}
                onChange={(event) => setVoice({ ...voice, ttsVoiceURI: event.target.value })}
                placeholder="en_US-lessac-medium"
                disabled={voice.ttsModelId !== "local:piper" && !voice.ttsModelId.startsWith("piper:")}
              />
            </label>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">TTS rate ({voice.ttsRate})</span>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={voice.ttsRate}
                onChange={(event) => setVoice({ ...voice, ttsRate: Number(event.target.value) })}
              />
            </label>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">TTS pitch ({voice.ttsPitch}) — device TTS</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={voice.ttsPitch}
                onChange={(event) => setVoice({ ...voice, ttsPitch: Number(event.target.value) })}
              />
            </label>
            <label className="atlas-assistant__composer-field">
              <span className="atlas-assistant__composer-label">Daily voice limit (minutes / user, admins &amp; dev exempt)</span>
              <input
                className="atlas-assistant__composer-value"
                type="number"
                min={0}
                step={1}
                value={voice.dailyVoiceLimitMinutes}
                onChange={(event) =>
                  setVoice({ ...voice, dailyVoiceLimitMinutes: Math.max(0, Number(event.target.value) || 0) })
                }
              />
            </label>
          </div>
          <p className="atlas-micro" style={{ marginTop: 12 }}>
            Default: mic uses device speech first, then Whisper/omni. Replies use Piper/server first,
            then device speechSynthesis. iOS Safari often lacks Web Speech STT — server STT covers that.
            {sttModelOptions.length === 0
              ? " Add a Whisper or omni model under Providers for server STT fallback."
              : ""}
            {!piperAvailable && ttsModelOptions.length === 0
              ? " Install Piper or add a TTS model for server spoken replies."
              : ""}
          </p>
          <div className="atlas-chip-row" style={{ marginTop: 14 }}>
            <button type="submit" className="atlas-action atlas-action--primary">
              Save voice config
            </button>
            <button
              type="button"
              className="atlas-action atlas-action--ghost"
              onClick={() => void testTts()}
              disabled={ttsTesting || ttsModelOptions.length === 0}
            >
              {ttsTesting ? "Testing…" : "Test TTS"}
            </button>
            <button type="button" className="atlas-action atlas-action--ghost" onClick={() => void loadVoice()}>
              Refresh detection
            </button>
          </div>
        </form>
      </section>
        </div>
      ) : null}

      {activeTab === "logs" ? <LlmLogsPanel /> : null}

      {activeTab === "brief" ? <AdminDailyBriefPanel /> : null}
          </div>
        </div>

      {/* Floating Action Button (FAB) */}
      <button
        type="button"
        className="atlas-admin-fab"
        onClick={() => setIsChatOpen(!isChatOpen)}
        aria-label="Open Admin Co-Pilot"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          background: "radial-gradient(circle at 30% 30%, #10b981, #059669)",
          border: "none",
          boxShadow: "0 8px 32px rgba(16, 185, 129, 0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 1000,
          transition: "transform 0.2s, box-shadow 0.2s"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.05)";
          e.currentTarget.style.boxShadow = "0 8px 32px rgba(16, 185, 129, 0.6)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 8px 32px rgba(16, 185, 129, 0.4)";
        }}
      >
        <span style={{ fontSize: 24, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}>🤖</span>
      </button>

      {/* Admin Co-Pilot Bottom Sheet Chat Drawer */}
      {isChatOpen && (
        <div
          className="atlas-admin-chat-sheet"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: "80vh",
            background: "#0f172a",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            boxShadow: "0 -12px 40px rgba(0,0,0,0.5)",
            zIndex: 1001,
            display: "flex",
            flexDirection: "column",
            borderTop: "1px solid rgba(148, 163, 184, 0.15)",
            fontFamily: "inherit"
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>🤖</span>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.95rem" }}>Admin Co-Pilot</span>
                <span style={{ fontSize: "0.75rem", color: "#10b981", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} /> Active
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 20, cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "20px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 16
            }}
          >
            {chatHistory.length === 0 ? (
              <div style={{ textAlign: "center", color: "#64748b", marginTop: 40, padding: 20 }}>
                <p style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 4 }}>Welcome, Admin!</p>
                <p style={{ fontSize: "0.8rem" }}>Ask me to add connectors, install MCP servers, register skills, or configure AI models.</p>
              </div>
            ) : (
              chatHistory.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                    gap: 6
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "10px 14px",
                      borderRadius: 14,
                      background: msg.role === "user" ? "#1e293b" : "transparent",
                      color: msg.role === "user" ? "#f8fafc" : "#e2e8f0",
                      fontSize: "0.88rem",
                      lineHeight: "1.4",
                      border: msg.role === "user" ? "none" : "1px solid rgba(148, 163, 184, 0.1)"
                    }}
                  >
                    {msg.text}

                    {/* Interactive Success/Error Cards */}
                    {msg.card && (
                      <div
                        style={{
                          marginTop: 12,
                          background: "#020617",
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                          borderRadius: 12,
                          padding: 14,
                          display: "flex",
                          flexDirection: "column",
                          gap: 10
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 20, color: "#10b981" }}>✓</span>
                          <span style={{ fontWeight: 700, color: "#10b981", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {msg.card.type === "mcp_installed" ? "MCP Server Installation Success" :
                             msg.card.type === "connector_added" ? "Connector Registration Success" :
                             msg.card.type === "skill_installed" ? "Skill Registered" :
                             msg.card.type === "provider_connected" ? "Provider Connected" : "Action Executed"}
                          </span>
                        </div>
                        <div style={{ borderTop: "1px solid rgba(148, 163, 184, 0.1)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem" }}>
                          {msg.card.serverName && <div><strong>Server:</strong> {msg.card.serverName}</div>}
                          {msg.card.connectorName && <div><strong>Connector:</strong> {msg.card.connectorName}</div>}
                          {msg.card.transport && <div><strong>Transport:</strong> {msg.card.transport}</div>}
                          {msg.card.skillName && <div><strong>Skill:</strong> {msg.card.skillName}</div>}
                          {msg.card.provider && <div><strong>Provider:</strong> {msg.card.provider}</div>}
                          <div><strong>Status:</strong> Active & Connected</div>
                        </div>
                        {msg.card.type === "mcp_installed" && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setIsChatOpen(false);
                                setActiveTab("mcp");
                              }}
                              style={{
                                flex: 1,
                                padding: "6px 10px",
                                background: "#10b981",
                                border: "none",
                                borderRadius: 6,
                                color: "#000",
                                fontWeight: 600,
                                fontSize: "0.75rem",
                                cursor: "pointer"
                              }}
                            >
                              Configure Server
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsChatOpen(false);
                                setActiveTab("logs");
                              }}
                              style={{
                                flex: 1,
                                padding: "6px 10px",
                                background: "#1e293b",
                                border: "1px solid rgba(148, 163, 184, 0.2)",
                                borderRadius: 6,
                                color: "#f8fafc",
                                fontSize: "0.75rem",
                                cursor: "pointer"
                              }}
                            >
                              View Logs
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: "0.85rem" }}>
                <span>🤖 Co-Pilot is thinking...</span>
              </div>
            )}
          </div>

          {/* Composer */}
          <div
            style={{
              padding: "12px 16px",
              borderTop: "1px solid rgba(148, 163, 184, 0.1)",
              display: "flex",
              gap: 8,
              background: "#020617"
            }}
          >
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask the Admin Co-Pilot..."
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                border: "1px solid rgba(148, 163, 184, 0.2)",
                background: "#0f172a",
                color: "#f8fafc",
                padding: "0 12px",
                fontSize: "0.9rem"
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void sendAdminChatMessage(chatMessage);
              }}
              disabled={chatLoading}
            />
            <button
              type="button"
              onClick={() => void sendAdminChatMessage(chatMessage)}
              disabled={chatLoading || !chatMessage.trim()}
              style={{
                padding: "0 16px",
                background: "#10b981",
                border: "none",
                borderRadius: 12,
                color: "#000",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
