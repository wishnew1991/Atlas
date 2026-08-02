"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  AtlasActionDomain,
  AtlasCredential,
  AtlasProvider,
  AtlasMcpServer,
} from "@/lib/atlas/server/model-registry";

interface ModelConfig {
  id: string;
  provider: AtlasProvider;
  label: string;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  credentialId?: string;
}

interface RoutingRule {
  domain: AtlasActionDomain;
  modelId: string;
}

const providers: AtlasProvider[] = ["openai", "anthropic", "google", "nvidia", "custom"];

const builtInDomains = ["shopping", "travel", "food", "rides", "appointments"];

const adminTabs = [
  { id: "providers", label: "Providers", icon: "◆" },
  { id: "routing", label: "Routing", icon: "⇄" },
  { id: "mcp", label: "MCP", icon: "🔌" },
  { id: "search", label: "Search", icon: "🔎" },
  { id: "domains", label: "Domains", icon: "⌂" },
  { id: "voice", label: "Voice", icon: "🎙️" },
] as const;

const providerMeta: Record<AtlasProvider, { label: string; hint: string }> = {
  openai: { label: "OpenAI", hint: "platform.openai.com" },
  anthropic: { label: "Anthropic", hint: "console.anthropic.com" },
  google: { label: "Google", hint: "ai.google.dev" },
  nvidia: { label: "NVIDIA", hint: "build.nvidia.com" },
  custom: { label: "Custom", hint: "OpenAI-compatible endpoint" },
};

type AdminTab = (typeof adminTabs)[number]["id"];

function AddModelForm({
  credential,
  providerModels,
  attachedModelIds,
  error,
  onAdd,
}: {
  credential: AtlasCredential;
  providerModels: string[];
  attachedModelIds: string[];
  error: string | null;
  onAdd: (modelId: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onAdd(draft);
    setDraft("");
  };

  const attached = new Set(attachedModelIds);
  const available = providerModels.filter((modelId) => !attached.has(modelId));

  return (
    <div className="atlas-provider__add">
      {available.length > 0 ? (
        <form className="atlas-provider__add-model" onSubmit={submit}>
          <select
            className="atlas-assistant__composer-value"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          >
            <option value="">Select a model…</option>
            {available.map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </select>
          <button type="submit" className="atlas-action atlas-action--primary" disabled={!draft}>
            Add
          </button>
        </form>
      ) : (
        <form className="atlas-provider__add-model" onSubmit={submit}>
          <input
            className="atlas-assistant__composer-value"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Type a ${credential.provider} model ID`}
          />
          <button type="submit" className="atlas-action atlas-action--primary" disabled={!draft.trim()}>
            Add
          </button>
        </form>
      )}
      {error ? (
        <div className="atlas-micro" style={{ color: "var(--amber)" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function AtlasAdmin() {
  const [activeTab, setActiveTab] = useState<AdminTab>("providers");
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [routing, setRouting] = useState<RoutingRule[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
  });
  const [browserVoices, setBrowserVoices] = useState<{ name: string; voiceURI: string }[]>([]);
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
      setError(null);
    } catch {
      setError("Could not reach the admin service.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const sync = () => {
      setBrowserVoices(
        window.speechSynthesis.getVoices().map((voice) => ({ name: voice.name, voiceURI: voice.voiceURI }))
      );
    };

    sync();
    window.speechSynthesis.onvoiceschanged = sync;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const loadVoice = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/voice");
      const payload = await response.json();
      if (response.ok && payload.voice) {
        setVoice(payload.voice);
      }
    } catch {
      /* non-admin */
    }
  }, []);

  useEffect(() => {
    void loadVoice();
  }, [loadVoice]);

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

    try {
      const response = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentialForm),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Could not save credential.");
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
      setError(null);

      if (payload.credential.apiKey) {
        void fetchModelsForCredential(payload.credential);
      }
    } catch {
      setError("Could not save credential.");
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

      setVoice(payload.voice);
      setNotice("Voice configuration saved.");
      setError(null);
    } catch {
      setError("Could not save voice config.");
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
      setNotice("Model removed.");
    } catch {
      setError("Could not delete model.");
    }
  };

  const setDefault = async (id: string) => {
    setDefaultModelId(id);
    await saveRouting({ defaultModelId: id });
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

  return (
    <div className="atlas-page">
      <section className="atlas-hero">
        <div className="atlas-card atlas-card--dark">
          <div className="atlas-mini-stack">
            <p className="atlas-hero__subtle">Admin</p>
            <h1 className="atlas-hero__title">Control center</h1>
            <p className="atlas-hero__lede" style={{ color: "rgba(241, 245, 249, 0.76)" }}>
              Choose which provider and model powers each domain. API keys are stored
              server-side only and never sent to the browser.
            </p>
          </div>
        </div>
      </section>

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

      <nav className="atlas-admin-tabs" aria-label="Admin sections">
        {adminTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="atlas-admin-tabs__tab"
            data-active={activeTab === tab.id ? "true" : "false"}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
          >
            <span className="atlas-admin-tabs__icon" aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "providers" ? (
        <div className="atlas-admin-panel">
          <section className="atlas-section">
            <div className="atlas-section__header">
              <p className="atlas-section__eyebrow">Providers</p>
              <h2 className="atlas-section__title">Connected providers</h2>
              <p className="atlas-section__copy">
                Each provider holds one API key. Models are attached to the provider and share its key.
              </p>
            </div>

            {credentials.length === 0 ? (
              <div className="atlas-card atlas-card--soft">
                <div className="atlas-card__title">No providers connected</div>
                <div className="atlas-card__body">Add your first provider below to start routing models.</div>
              </div>
            ) : (
              <div className="atlas-providers">
                {credentials.map((credential) => {
                  const credentialModels = models.filter((model) => model.credentialId === credential.id);

                  return (
                    <div className="atlas-provider" key={credential.id}>
                      <div className="atlas-provider__head">
                        <div className="atlas-provider__mark" aria-hidden="true">
                          {credential.label.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="atlas-provider__meta">
                          <div className="atlas-provider__name">
                            {credential.label}
                            <span className="atlas-badge atlas-badge--blue">{credential.provider}</span>
                          </div>
                          <div className="atlas-provider__detail">
                            {credential.provider === "custom" && credential.baseUrl
                              ? credential.baseUrl
                              : providerMeta[credential.provider]?.hint}
                            {credential.provider !== "custom" && credential.baseUrl
                              ? ` · ${credential.baseUrl}`
                              : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="atlas-inline-action atlas-provider__remove"
                          onClick={() => deleteCredential(credential.id)}
                        >
                          Remove
                        </button>
                      </div>

                      <div className="atlas-provider__body">
                        {credentialModels.length === 0 ? (
                          <div className="atlas-provider__empty">
                            No models attached yet. Add the first one below.
                          </div>
                        ) : (
                          <div className="atlas-provider__models">
                            {credentialModels.map((model) => (
                              <div className="atlas-provider__model" key={model.id}>
                                <div className="atlas-provider__model-meta">
                                  <div className="atlas-provider__model-name">
                                    {model.label || model.id}
                                    {model.id !== model.label ? (
                                      <span className="atlas-provider__model-id">{model.id}</span>
                                    ) : null}
                                  </div>
                                  <div className="atlas-provider__model-state">
                                    {model.enabled ? "Active" : "Disabled"}
                                  </div>
                                </div>
                                <div className="atlas-provider__model-actions">
                                  {defaultModelId === model.id ? (
                                    <span className="atlas-badge atlas-badge--green">Default</span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="atlas-inline-action"
                                      onClick={() => setDefault(model.id)}
                                    >
                                      Set default
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="atlas-inline-action"
                                    onClick={() => deleteModel(model.id)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <AddModelForm
                          credential={credential}
                          providerModels={providerModelsByCredential[credential.id] ?? []}
                          attachedModelIds={credentialModels.map((model) => model.id)}
                          error={providerModelsError[credential.id] ?? null}
                          onAdd={(modelId) => void addModelToCredential(credential.id, modelId)}
                        />
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
                Pick a provider, paste its API key, and Atlas will list the models you can attach.
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

              <label className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">Label</span>
                <input
                  className="atlas-assistant__composer-value"
                  value={credentialForm.label}
                  onChange={(event) => setCredentialForm({ ...credentialForm, label: event.target.value })}
                  placeholder={providerMeta[credentialForm.provider].label}
                />
              </label>

              <label className="atlas-assistant__composer-field">
                <span className="atlas-assistant__composer-label">
                  Base URL {credentialForm.provider === "custom" ? "(required)" : "(optional)"}
                </span>
                <input
                  className="atlas-assistant__composer-value"
                  value={credentialForm.baseUrl}
                  onChange={(event) => setCredentialForm({ ...credentialForm, baseUrl: event.target.value })}
                  placeholder="https://your-endpoint/v1"
                  required={credentialForm.provider === "custom"}
                />
              </label>

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

              <button type="submit" className="atlas-action atlas-action--primary">
                Add provider
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {activeTab === "routing" ? (
        <div className="atlas-admin-panel">
      <section className="atlas-section">
        <div className="atlas-section__header">
          <p className="atlas-section__eyebrow">Routing</p>
          <h2 className="atlas-section__title">Per-domain model</h2>
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
          <p className="atlas-section__eyebrow">MCP builder</p>
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
          <h2 className="atlas-section__title">STT / TTS settings</h2>
          <p className="atlas-section__copy">
            Speech-to-text language and text-to-speech voice used by the browser voice assistant.
            Voices are provided by the user&apos;s browser.
          </p>
        </div>        <form className="atlas-card" onSubmit={saveVoice}>
          <div className="atlas-grid atlas-grid--2">
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
              <span className="atlas-assistant__composer-label">TTS voice</span>
              <select
                className="atlas-assistant__composer-value"
                value={voice.ttsVoiceURI}
                onChange={(event) => setVoice({ ...voice, ttsVoiceURI: event.target.value })}
              >
                <option value="">Browser default</option>
                {browserVoices.map((browserVoice) => (
                  <option key={browserVoice.voiceURI} value={browserVoice.voiceURI}>
                    {browserVoice.name}
                  </option>
                ))}
              </select>
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
              <span className="atlas-assistant__composer-label">TTS pitch ({voice.ttsPitch})</span>
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
          <div style={{ marginTop: 14 }}>
            <button type="submit" className="atlas-action atlas-action--primary">
              Save voice config
            </button>
          </div>
        </form>
      </section>
        </div>
      ) : null}
    </div>
  );
}
