"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  AtlasActionDomain,
  AtlasCredential,
  AtlasProvider,
  AtlasMcpServer,
} from "@/lib/atlas/server/model-registry";
import type { IntegrationDefinition, AuthMethod } from "@/lib/atlas/integrations/types";
import { TRANSPORT_KINDS } from "@/lib/atlas/integrations/types";
import { IntegrationAvatar } from "@/components/atlas/integration-avatar";
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

const providers: AtlasProvider[] = ["openai", "anthropic", "google", "nvidia", "custom"];

const builtInDomains = ["shopping", "travel", "food", "rides", "appointments"];

type AdminTab = "llm" | "integrations" | "mcp" | "search" | "domains" | "voice" | "logs";

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
    group: "Platform",
    items: [
      { id: "integrations", label: "Integrations" },
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
    ],
  },
];

const providerMeta: Record<AtlasProvider, { label: string; hint: string; baseHint?: string }> = {
  openai: { label: "OpenAI", hint: "platform.openai.com", baseHint: "https://api.openai.com/v1" },
  anthropic: { label: "Anthropic", hint: "console.anthropic.com", baseHint: "https://api.anthropic.com/v1" },
  google: { label: "Google", hint: "ai.google.dev", baseHint: "https://generativelanguage.googleapis.com/v1beta" },
  nvidia: { label: "NVIDIA", hint: "build.nvidia.com", baseHint: "https://integrate.api.nvidia.com/v1" },
  custom: { label: "Custom", hint: "OpenAI-compatible endpoint" },
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

        <div className="atlas-chip-row" style={{ marginBottom: 12 }}>
          <span className="atlas-badge atlas-badge--blue">{total} total</span>
          <span className={`atlas-badge ${successCount === logs.length && logs.length > 0 ? "atlas-badge--green" : ""}`}>
            {successCount}/{logs.length} success
          </span>
          <span className="atlas-badge">{tokensInTotal} tokens in</span>
          <span className="atlas-badge">{tokensOutTotal} tokens out</span>
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
            <div className="atlas-llm-log__head">
              <span className="atlas-llm-log__cell atlas-llm-log__cell--time">Time</span>
              <span className="atlas-llm-log__cell atlas-llm-log__cell--model">Model</span>
              <span className="atlas-llm-log__cell atlas-llm-log__cell--tokens">Tokens</span>
              <span className="atlas-llm-log__cell atlas-llm-log__cell--latency">Latency</span>
              <span className="atlas-llm-log__cell atlas-llm-log__cell--status">Status</span>
              <span className="atlas-llm-log__cell atlas-llm-log__cell--tools">Tools</span>
            </div>
            {logs.map((log) => (
              <div className="atlas-llm-log__entry" key={log.id}>
                <div className="atlas-llm-log__row" data-failed={log.success ? undefined : "true"}>
                  <span className="atlas-llm-log__cell atlas-llm-log__cell--time">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                  <span className="atlas-llm-log__cell atlas-llm-log__cell--model">
                    {log.modelId ?? "—"}
                    <span className="atlas-llm-log__meta">
                      {[log.provider, log.domain, log.round > 0 ? `round ${log.round}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </span>
                  <span className="atlas-llm-log__cell atlas-llm-log__cell--tokens">
                    {log.tokensIn ?? "–"} → {log.tokensOut ?? "–"}
                  </span>
                  <span className="atlas-llm-log__cell atlas-llm-log__cell--latency">
                    {log.latencyMs != null ? `${(log.latencyMs / 1000).toFixed(1)}s` : "–"}
                  </span>
                  <span className="atlas-llm-log__cell atlas-llm-log__cell--status">
                    <span className={`atlas-badge ${log.success ? "atlas-badge--green" : "atlas-badge--red"}`}>
                      {log.success ? "ok" : "failed"}
                    </span>
                  </span>
                  <span className="atlas-llm-log__cell atlas-llm-log__cell--tools">
                    {parseToolCallList(log.toolCalls).join(", ") || "—"}
                  </span>
                </div>
                {!log.success && log.error ? (
                  <div className="atlas-llm-log__error">{log.error}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function AtlasAdmin() {
  const [activeTab, setActiveTab] = useState<AdminTab>("llm");
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [routing, setRouting] = useState<RoutingRule[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("");
  const [embeddingModelId, setEmbeddingModelId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    <div className="atlas-admin">
      <aside className="atlas-admin__nav" aria-label="Admin sections">
        <div className="atlas-admin__nav-head">
          <p className="atlas-admin__nav-eyebrow">Configure</p>
          <h1 className="atlas-admin__nav-title">Control plane</h1>
        </div>

        {adminNav.map((section) => (
          <div className="atlas-admin__nav-group" key={section.group}>
            <p className="atlas-admin__nav-group-label">{section.group}</p>
            {section.items.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="atlas-admin__nav-link"
                data-active={activeTab === tab.id ? "true" : "false"}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={activeTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ))}

        <div className="atlas-admin__nav-status">
          <span className={`atlas-badge ${credentials.length > 0 ? "atlas-badge--green" : ""}`}>
            {credentials.length} provider{credentials.length === 1 ? "" : "s"}
          </span>
          <span className={`atlas-badge ${mcpServers.length > 0 ? "atlas-badge--green" : ""}`}>
            {mcpServers.length} MCP Servers
          </span>
          <span className={`atlas-badge ${models.some((m) => m.enabled) ? "atlas-badge--green" : ""}`}>
            {models.filter((m) => m.enabled).length} models
          </span>
        </div>
      </aside>

      <div className="atlas-admin__main">
        {error ? (
          <div className="atlas-banner atlas-banner--error">
            <span className="atlas-banner__dot" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {notice ? (
          <div className="atlas-banner atlas-banner--success">
            <span className="atlas-banner__dot" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        ) : null}

      {activeTab === "llm" ? (
        <div className="atlas-admin-panel">
          <section className="atlas-section">
            <div className="atlas-section__header">
              <p className="atlas-section__eyebrow">Models</p>
              <h2 className="atlas-section__title">Routing chain</h2>
              <p className="atlas-section__copy">
                Default model and fallbacks — pulled from all connected providers.
              </p>
            </div>
            <RoutingChain
              models={models}
              credentials={credentials}
              defaultModelId={defaultModelId}
              onSave={saveProviderChain}
            />
          </section>

          <section className="atlas-section">
            <div className="atlas-section__header">
              <p className="atlas-section__eyebrow">Embedding</p>
              <h2 className="atlas-section__title">Memory embedding model</h2>
              <p className="atlas-section__copy">
                Model used to generate embeddings for long-term memory. Memory is
                disabled when no embedding model is selected.
              </p>
            </div>
            <div className="atlas-rchain">
              <div className="atlas-rchain__fields">
                <label className="atlas-rchain__field">
                  <span className="atlas-rchain__field-label">Embedding model</span>
                  <select
                    className="atlas-rchain__select"
                    value={embeddingModelId}
                    onChange={(event) => saveEmbeddingModel(event.target.value)}
                  >
                    <option value="">None (memory disabled)</option>
                    {models
                      .filter((m) => m.enabled && m.provider !== "anthropic")
                      .map((model) => (
                        <option key={model.id} value={model.id}>
                          {modelDisplayName(model, credentials)}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </div>
            {embeddingModelId && !models.find((m) => m.id === embeddingModelId && m.enabled) ? (
              <div className="atlas-banner atlas-banner--warn" style={{ marginTop: "0.5rem" }}>
                The selected embedding model is not enabled. Memory is disabled.
              </div>
            ) : null}
          </section>

          {/* ── Per-Domain Model Routing ── */}

          <section className="atlas-section">
            <div className="atlas-section__header">
              <p className="atlas-section__eyebrow">Model map</p>
              <h2 className="atlas-section__title">Per-domain model routing</h2>
              <p className="atlas-section__copy">
                Assign specific models to action domains. Falls back to the default routing chain when unset.
              </p>
            </div>

            <div className="atlas-rows">
              {domains.map((domain) => {
                const current = routing.find((entry) => entry.domain === domain)?.modelId || defaultModelId;

                return (
                  <div className="atlas-row" key={domain}>
                    <div className="atlas-row__meta">
                      <div className="atlas-row__title">{domain}</div>
                      <div className="atlas-row__body">Falls back to default if unset</div>
                    </div>
                    <select
                      className="atlas-action atlas-action--ghost"
                      value={current}
                      onChange={(event) => updateDomainRoute(domain, event.target.value)}
                    >
                      <option value={defaultModelId}>Default ({defaultModelId || "none"})</option>
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label || model.id}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Connected Providers ── */}

          <section className="atlas-section">
            <div className="atlas-section__header">
              <p className="atlas-section__eyebrow">Credentials</p>
              <h2 className="atlas-section__title">Connected providers</h2>
            </div>

            {credentials.length === 0 ? (
              <div className="atlas-card atlas-card--soft">
                <div className="atlas-card__title">No providers connected</div>
                <div className="atlas-card__body">Add your first provider below to start routing models.</div>
              </div>
            ) : (
              <div className="atlas-prows">
                {credentials.map((credential) => {
                  const credentialModels = models.filter((model) => model.credentialId === credential.id);
                  const fetchedModels = providerModelsByCredential[credential.id] ?? [];
                  const attachedIds = credentialModels.map((m) => m.id);
                  const available = fetchedModels.filter((id) => !attachedIds.includes(id));
                  const fetchError = providerModelsError[credential.id] ?? null;

                  return (
                    <div className="atlas-prow" key={credential.id}>
                      <div className="atlas-prow__info">
                        <span className="atlas-prow__icon" aria-hidden="true">
                          {credential.label.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="atlas-prow__meta">
                          <span className="atlas-prow__name">{credential.label}</span>
                          <span className="atlas-prow__detail">
                            {providerMeta[credential.provider]?.hint}
                            {credential.baseUrl && credential.provider !== "custom" ? ` · ${credential.baseUrl}` : ""}
                          </span>
                        </div>
                        <span className="atlas-badge atlas-badge--blue">{credential.provider}</span>
                      </div>

                      <div className="atlas-prow__models">
                        <span className="atlas-prow__models-label">Models</span>
                        {credentialModels.length === 0 ? (
                          <span className="atlas-prow__models-empty">None</span>
                        ) : (
                          <select
                            className="atlas-prow__select"
                            value=""
                            onChange={(event) => {
                              if (event.target.value) deleteModel(event.target.value);
                            }}
                          >
                            <option value="">{credentialModels.length} attached</option>
                            {credentialModels.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label || m.id}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="atlas-prow__actions">
                        <AddModelInline
                          credential={credential}
                          available={available}
                          fetchError={fetchError}
                          onAdd={(modelId) => { void addModelToCredential(credential.id, modelId); }}
                        />
                        <button
                          type="button"
                          className="atlas-inline-action atlas-prow__remove"
                          onClick={() => deleteCredential(credential.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="atlas-section">
            <div className="atlas-section__header">
              <p className="atlas-section__eyebrow">Add provider</p>
              <h2 className="atlas-section__title">Connect a provider</h2>
              <p className="atlas-section__copy">
                Pick a provider and paste your API key. Atlas knows the endpoints.
              </p>
            </div>

            <form className="atlas-card" onSubmit={saveCredential}>
              <div className="atlas-provider__pickers">
                {providers.map((provider) => {
                  const active = credentialForm.provider === provider;
                  const meta = providerMeta[provider];

                  return (
                    <button
                      key={provider}
                      type="button"
                      className="atlas-provider__picker"
                      data-active={active ? "true" : "false"}
                      onClick={() => setCredentialForm({ ...credentialForm, provider, baseUrl: "" })}
                    >
                      <span className="atlas-provider__picker-name">{meta.label}</span>
                      <span className="atlas-provider__picker-hint">{meta.hint}</span>
                    </button>
                  );
                })}
              </div>

              {credentialForm.provider === "custom" ? (
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
              ) : null}

              <label className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">API key</span>
                <div className="atlas-provider__key">
                  <input
                    className="atlas-assistant__composer-value"
                    type={showApiKey ? "text" : "password"}
                    value={credentialForm.apiKey}
                    onChange={(event) => setCredentialForm({ ...credentialForm, apiKey: event.target.value })}
                    placeholder="sk-..."
                    required
                  />
                  <button
                    type="button"
                    className="atlas-provider__key-toggle"
                    onClick={() => setShowApiKey((visible) => !visible)}
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <div className="atlas-form__actions">
                <button
                  type="submit"
                  className="atlas-action atlas-action--primary"
                  disabled={submitting}
                >
                  {submitting ? "Connecting..." : "Connect"}
                </button>
                {formError ? (
                  <div className="atlas-form__error" role="alert">
                    <span className="atlas-form__error-dot" aria-hidden="true" />
                    <span>{formError}</span>
                    <button
                      type="button"
                      className="atlas-form__error-dismiss"
                      onClick={() => setFormError(null)}
                      aria-label="Dismiss error"
                    >
                      ×
                    </button>
                  </div>
                ) : null}
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {activeTab === "integrations" ? (
        <div className="atlas-admin-panel">
          <section className="atlas-section">
            <div className="atlas-section__header">
              <p className="atlas-section__eyebrow">Platform</p>
              <h2 className="atlas-section__title">Integrations</h2>
              <p className="atlas-section__copy">
                Manage the service catalog — define integrations, map capabilities, and monitor health.
              </p>
            </div>

            {/* Stats */}
            <div className="atlas-chip-row" style={{ marginBottom: 12 }}>
              <span className="atlas-badge atlas-badge--blue">{integrations.length} total</span>
              <span className="atlas-badge atlas-badge--green">{integrations.filter((i) => i.enabled).length} enabled</span>
              <span className="atlas-badge atlas-badge--red">{integrations.filter((i) => !i.enabled).length} disabled</span>
              <span className={`atlas-badge ${integrationHealth.filter((h) => h.status === "healthy").length > 0 ? "atlas-badge--green" : ""}`}>
                {integrationHealth.filter((h) => h.status === "healthy").length} healthy
              </span>
              <span className={`atlas-badge ${integrationHealth.filter((h) => h.status === "unconfigured").length > 0 ? "atlas-badge--amber" : ""}`}>
                {integrationHealth.filter((h) => h.status === "unconfigured").length} unconfigured
              </span>
              <span className="atlas-badge atlas-badge--blue">
                {integrations.filter((i) => i.authMethods.some((m) => m.kind === "oauth2")).length} OAuth
              </span>
              <span className="atlas-badge">
                {integrations.filter((i) => i.authMethods.some((m) => m.kind === "api_key")).length} API key
              </span>
            </div>

            {/* View toggle */}
            <div className="atlas-chip-row" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={`atlas-chip ${integrationsView === "catalog" ? "atlas-chip--primary" : ""}`}
                onClick={() => { setIntegrationsView("catalog"); setSelectedIntegrationId(null); }}
              >
                Catalog
              </button>
              <button
                type="button"
                className={`atlas-chip ${integrationsView === "capability" ? "atlas-chip--primary" : ""}`}
                onClick={() => { setIntegrationsView("capability"); setSelectedIntegrationId(null); }}
              >
                By Capability
              </button>
              <button
                type="button"
                className="atlas-action atlas-action--primary atlas-action--small"
                style={{ marginLeft: "auto" }}
                onClick={() => setAddIntegrationOpen((v) => !v)}
              >
                {addIntegrationOpen ? "Cancel" : "+ Add Integration"}
              </button>
            </div>

            {/* Add form */}
            {addIntegrationOpen ? (
              <form className="atlas-card" onSubmit={handleAddIntegration} style={{ marginBottom: 14 }}>
                <div className="atlas-grid atlas-grid--2">
                  <label className="atlas-assistant__composer-field">
                    <span className="atlas-assistant__composer-label">ID (slug)</span>
                    <input className="atlas-assistant__composer-value" value={addIntegrationForm.id} onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, id: e.target.value })} placeholder="swiggy" required />
                  </label>
                  <label className="atlas-assistant__composer-field">
                    <span className="atlas-assistant__composer-label">Name</span>
                    <input className="atlas-assistant__composer-value" value={addIntegrationForm.name} onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, name: e.target.value })} placeholder="Swiggy" required />
                  </label>
                  <label className="atlas-assistant__composer-field">
                    <span className="atlas-assistant__composer-label">Transport</span>
                    <select className="atlas-assistant__composer-value" value={addIntegrationForm.transport} onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, transport: e.target.value })}>
                      {TRANSPORT_KINDS.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                  </label>
                  <label className="atlas-assistant__composer-field">
                    <span className="atlas-assistant__composer-label">Auth Methods (JSON)</span>
                    <textarea className="atlas-assistant__composer-value" value={addIntegrationForm.authMethods} onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, authMethods: e.target.value })} placeholder='[{"kind":"oauth2"}]' rows={2} />
                  </label>
                </div>
                <label className="atlas-assistant__composer-field">
                  <span className="atlas-assistant__composer-label">Capabilities (JSON)</span>
                  <textarea className="atlas-assistant__composer-value" value={addIntegrationForm.capabilities} onChange={(e) => setAddIntegrationForm({ ...addIntegrationForm, capabilities: e.target.value })} placeholder='[{"capabilityId":"food","priority":10}]' rows={2} />
                </label>
                <div style={{ marginTop: 14 }}>
                  <button type="submit" className="atlas-action atlas-action--primary">Create Integration</button>
                </div>
              </form>
            ) : null}

            {/* Catalog View */}
            {integrationsView === "catalog" ? (
              <div className="atlas-prows">
                {integrations.length === 0 ? (
                  <div className="atlas-card atlas-card--soft">
                    <div className="atlas-card__title">No integrations yet</div>
                    <div className="atlas-card__body">Add your first integration above to start building the service catalog.</div>
                  </div>
                ) : (
                  integrations.map((integration) => {
                    const health = integrationHealth.find((h) => h.integrationId === integration.id);
                    const isSelected = selectedIntegrationId === integration.id;
                    return (
                      <div key={integration.id}>
                        <div className="atlas-prow" role="button" tabIndex={0} aria-expanded={isSelected} onClick={() => selectIntegration(integration.id)} onKeyDown={(e) => { if (e.key === "Enter") selectIntegration(integration.id); }}>
                          <div className="atlas-prow__info">
                            <IntegrationAvatar integrationId={integration.id} name={integration.name} size="md" decorative />
                            <div className="atlas-prow__meta">
                              <span className="atlas-prow__name">{integration.name}</span>
                              <span className="atlas-prow__detail">
                                {integration.transport.toUpperCase()} · {integration.authMethods.map((m) => m.kind).join(", ")}
                              </span>
                            </div>
                            <span className={`atlas-badge ${integration.enabled ? "atlas-badge--green" : "atlas-badge--red"}`}>
                              {integration.enabled ? "Active" : "Disabled"}
                            </span>
                            {health ? (
                              <span className={`atlas-badge ${health.status === "healthy" ? "atlas-badge--green" : health.status === "unconfigured" ? "atlas-badge--amber" : "atlas-badge--red"}`}>
                                {health.status}
                              </span>
                            ) : null}
                          </div>
                          <div className="atlas-prow__models">
                            <span className="atlas-prow__models-label">Capabilities</span>
                            {integration.capabilities.length === 0 ? (
                              <span className="atlas-prow__models-empty">None</span>
                            ) : (
                              <div className="atlas-chip-row">
                                {integration.capabilities.map((cap) => (
                                  <span key={cap.capabilityId} className="atlas-chip atlas-chip--quiet">{cap.capabilityId}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="atlas-prow__actions">
                            <button type="button" className="atlas-inline-action" onClick={(e) => { e.stopPropagation(); startEditIntegration(integration); }}>Edit</button>
                            <button type="button" className="atlas-inline-action" onClick={(e) => { e.stopPropagation(); void handleToggleIntegration(integration.id, !integration.enabled); }}>{integration.enabled ? "Disable" : "Enable"}</button>
                            <button type="button" className="atlas-inline-action atlas-prow__remove" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete ${integration.name}?`)) void handleDeleteIntegration(integration.id); }}>Delete</button>
                          </div>
                        </div>

                        {/* Inline Detail + Edit Panel */}
                        {isSelected ? (
                          <div className="atlas-card atlas-card--soft" style={{ marginTop: 8, marginBottom: 12 }}>
                            {editIntegrationOpen ? (
                              /* Edit mode */
                              <form onSubmit={(e) => { e.preventDefault(); void handleUpdateIntegration(integration.id); }}>
                                <div className="atlas-card__eyebrow">Edit — {integration.name}</div>
                                <div className="atlas-grid atlas-grid--2" style={{ marginTop: 12 }}>
                                  <label className="atlas-assistant__composer-field">
                                    <span className="atlas-assistant__composer-label">Name</span>
                                    <input className="atlas-assistant__composer-value" value={editIntegrationForm.name} onChange={(e) => setEditIntegrationForm({ ...editIntegrationForm, name: e.target.value })} />
                                  </label>
                                  <label className="atlas-assistant__composer-field">
                                    <span className="atlas-assistant__composer-label">Transport</span>
                                    <select className="atlas-assistant__composer-value" value={editIntegrationForm.transport} onChange={(e) => setEditIntegrationForm({ ...editIntegrationForm, transport: e.target.value })}>
                                      {TRANSPORT_KINDS.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                                    </select>
                                  </label>
                                </div>
                                <label className="atlas-assistant__composer-field">
                                  <span className="atlas-assistant__composer-label">Auth Methods (JSON)</span>
                                  <textarea className="atlas-assistant__composer-value" value={editIntegrationForm.authMethods} onChange={(e) => setEditIntegrationForm({ ...editIntegrationForm, authMethods: e.target.value })} rows={2} />
                                </label>
                                <label className="atlas-assistant__composer-field">
                                  <span className="atlas-assistant__composer-label">Capabilities (JSON)</span>
                                  <textarea className="atlas-assistant__composer-value" value={editIntegrationForm.capabilities} onChange={(e) => setEditIntegrationForm({ ...editIntegrationForm, capabilities: e.target.value })} rows={2} />
                                </label>
                                <div className="atlas-chip-row" style={{ marginTop: 14 }}>
                                  <button type="submit" className="atlas-action atlas-action--primary atlas-action--small">Save Changes</button>
                                  <button type="button" className="atlas-action atlas-action--ghost atlas-action--small" onClick={() => setEditIntegrationOpen(false)}>Cancel</button>
                                </div>
                              </form>
                            ) : (
                              /* Detail view */
                              <>
                                <div className="atlas-card__eyebrow">Configuration</div>
                                <div className="atlas-grid atlas-grid--2" style={{ marginTop: 8 }}>
                                  <label className="atlas-assistant__composer-field">
                                    <span className="atlas-assistant__composer-label">Base URL</span>
                                    <input className="atlas-assistant__composer-value" value={integrationConfigForm.baseUrl} onChange={(e) => setIntegrationConfigForm({ ...integrationConfigForm, baseUrl: e.target.value })} placeholder="https://" />
                                  </label>
                                  <label className="atlas-assistant__composer-field">
                                    <span className="atlas-assistant__composer-label">API Key</span>
                                    <input className="atlas-assistant__composer-value" type="password" value={integrationConfigForm.apiKey} onChange={(e) => setIntegrationConfigForm({ ...integrationConfigForm, apiKey: e.target.value })} placeholder="Configure if needed" />
                                  </label>
                                </div>
                                <div className="atlas-chip-row" style={{ marginTop: 8 }}>
                                  <button type="button" className="atlas-action atlas-action--primary atlas-action--small" onClick={() => void handleSaveIntegrationConfig(integration.id)}>Save Config</button>
                                </div>

                                <div className="atlas-card__eyebrow" style={{ marginTop: 14 }}>Health</div>
                                <div className="atlas-rows" style={{ marginTop: 4 }}>
                                  <div className="atlas-row">
                                    <div className="atlas-row__meta">
                                      <div className="atlas-row__title">Status</div>
                                    </div>
                                    <span className={`atlas-badge ${health?.status === "healthy" ? "atlas-badge--green" : health?.status === "unconfigured" ? "atlas-badge--amber" : "atlas-badge--red"}`}>
                                      {health?.status ?? "unknown"}
                                    </span>
                                  </div>
                                  <div className="atlas-row">
                                    <div className="atlas-row__meta">
                                      <div className="atlas-row__title">Transport</div>
                                      <div className="atlas-row__body">{integration.transport.toUpperCase()}</div>
                                    </div>
                                  </div>
                                  <div className="atlas-row">
                                    <div className="atlas-row__meta">
                                      <div className="atlas-row__title">Capabilities</div>
                                    </div>
                                    <div className="atlas-chip-row">
                                      {integration.capabilities.map((cap) => <span key={cap.capabilityId} className="atlas-chip atlas-chip--quiet">{cap.capabilityId} (p{cap.priority})</span>)}
                                    </div>
                                  </div>
                                </div>

                                <div className="atlas-chip-row" style={{ marginTop: 12 }}>
                                  <button type="button" className="atlas-inline-action" onClick={() => startEditIntegration(integration)}>Edit</button>
                                  <button type="button" className="atlas-inline-action" onClick={() => { selectIntegration(integration.id); }}>Close</button>
                                </div>
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}

            {/* By Capability View */}
            {integrationsView === "capability" ? (
              <div className="atlas-rows">
                {integrationCapabilities.length === 0 ? (
                  <div className="atlas-card atlas-card--soft">
                    <div className="atlas-card__body">No capabilities registered.</div>
                  </div>
                ) : (
                  integrationCapabilities.map((cap) => {
                    const mapped = integrations.filter((i) => i.capabilities.some((c) => c.capabilityId === cap.id));
                    return (
                      <div key={cap.id} className="atlas-mcp" style={{ marginBottom: 12 }}>
                        <div className="atlas-mcp__head">
                          <div className="atlas-mcp__mark" aria-hidden="true">{cap.name.slice(0, 1).toUpperCase()}</div>
                          <div className="atlas-mcp__meta">
                            <div className="atlas-mcp__name">{cap.name}</div>
                            <div className="atlas-mcp__detail">{cap.category} · {mapped.length} integration{mapped.length !== 1 ? "s" : ""}</div>
                          </div>
                        </div>
                        <div className="atlas-rows" style={{ marginTop: 4 }}>
                          {mapped.length === 0 ? (
                            <div className="atlas-micro" style={{ padding: "4px 8px" }}>No integrations mapped to this capability.</div>
                          ) : (
                            mapped.map((integration) => {
                              const capLink = integration.capabilities.find((c) => c.capabilityId === cap.id);
                              return (
                                <div className="atlas-row" key={integration.id}>
                                  <IntegrationAvatar integrationId={integration.id} name={integration.name} size="sm" decorative />
                                  <div className="atlas-row__meta">
                                    <div className="atlas-row__title">{integration.name}</div>
                                    <div className="atlas-row__body">{integration.transport.toUpperCase()} · Auth: {integration.authMethods.map((m) => m.kind).join(", ")}</div>
                                  </div>
                                  <span className="atlas-badge atlas-badge--blue">Priority {capLink?.priority ?? "-"}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}
          </section>
        </div>
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
      </div>
    </div>
  );
}
