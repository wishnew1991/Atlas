import "server-only";

import { parseVoiceSttMode, parseVoiceTtsMode, type VoiceSttMode, type VoiceTtsMode } from "@/lib/atlas/voice-modes";
import { decryptSecret, encryptSecret } from "@/lib/security/secrets";
import { prisma } from "./prisma";

export type AtlasProvider = "openai" | "anthropic" | "google" | "nvidia" | "custom";

export interface AtlasModelConfig {
  id: string;
  provider: AtlasProvider;
  label: string;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  credentialId?: string;
  fallbackModelIds?: string[];
}

export interface AtlasCredential {
  id: string;
  label: string;
  provider: AtlasProvider;
  apiKey: string;
  baseUrl?: string;
}

export type AtlasActionDomain = "shopping" | "travel" | "food" | "rides" | "appointments" | (string & {});

export interface AtlasRoutingRule {
  domain: AtlasActionDomain;
  modelId: string;
}

export interface AtlasVoiceConfig {
  sttLanguage: string;
  ttsVoiceURI: string;
  ttsRate: number;
  ttsPitch: number;
  /** ModelConfig.id for STT. Empty = auto-detect. */
  sttModelId: string;
  /** Model id or virtual TTS target (`local:piper`). */
  ttsModelId: string;
  /** Device vs server STT preference (Capacitor-ready). */
  sttMode: VoiceSttMode;
  /** Device vs server TTS preference (Capacitor-ready). */
  ttsMode: VoiceTtsMode;
}

export interface AtlasModelRegistry {
  models: AtlasModelConfig[];
  routing: AtlasRoutingRule[];
  defaultModelId: string;
  embeddingModelId: string;
  voice: AtlasVoiceConfig;
  domains: string[];
}

const builtInDomains = ["shopping", "travel", "food", "rides", "appointments"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function ensureSeed() {
  const domainCount = await prisma.domain.count();

  if (domainCount === 0) {
    await prisma.domain.createMany({
      data: builtInDomains.map((slug) => ({ slug, builtIn: true })),
    });
  }

  const voice = await prisma.voiceConfig.findUnique({ where: { id: 1 } });

  if (!voice) {
    await prisma.voiceConfig.create({ data: { id: 1 } });
  }
}

export async function readRegistry(): Promise<AtlasModelRegistry> {
  await ensureSeed();

  const [models, routing, domains, voice] = await Promise.all([
    prisma.modelConfig.findMany({ include: { credential: true } }),
    prisma.routingRule.findMany(),
    prisma.domain.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.voiceConfig.findUnique({ where: { id: 1 } }),
  ]);

  const defaultModel = models.find((model) => model.isDefault);

  return {
    models: models.map((model) => ({
      id: model.id,
      provider: model.credential.provider as AtlasProvider,
      label: model.label,
      apiKey: decryptSecret(model.credential.apiKey),
      baseUrl: model.credential.baseUrl ?? undefined,
      enabled: model.enabled,
      credentialId: model.credentialId,
      fallbackModelIds: parseFallbackModelIds(model.fallbackModelIds),
    })),
    routing: routing.map((rule) => ({ domain: rule.domain as AtlasActionDomain, modelId: rule.modelId })),
    defaultModelId: defaultModel?.id ?? models[0]?.id ?? "",
    embeddingModelId: (await prisma.setting.findUnique({ where: { key: "embeddingModelId" } }))?.value ?? "",
    voice: {
      sttLanguage: voice?.sttLanguage ?? "en-US",
      ttsVoiceURI: voice?.ttsVoiceURI ?? "",
      ttsRate: voice?.ttsRate ?? 1,
      ttsPitch: voice?.ttsPitch ?? 1,
      sttModelId: voice?.sttModelId ?? "",
      ttsModelId: voice?.ttsModelId ?? "local:piper",
      sttMode: parseVoiceSttMode(voice?.sttMode),
      ttsMode: parseVoiceTtsMode(voice?.ttsMode),
    },
    domains: domains.map((domain) => domain.slug),
  };
}

function parseFallbackModelIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string");
    }
    return [];
  } catch {
    return [];
  }
}

export async function writeRegistry(_registry: AtlasModelRegistry): Promise<void> {
  // Persisted incrementally via the functions below; kept for interface compatibility.
}

export async function resolveModelForDomain(
  domain: AtlasActionDomain
): Promise<AtlasModelConfig | null> {
  const registry = await readRegistry();
  const rule = registry.routing.find((entry) => entry.domain === domain);
  const modelId = rule?.modelId || registry.defaultModelId;
  const model = registry.models.find((entry) => entry.id === modelId);

  return model && model.enabled ? model : null;
}

export async function resolveDefaultModel(): Promise<AtlasModelConfig | null> {
  const registry = await readRegistry();
  const model = registry.models.find((entry) => entry.id === registry.defaultModelId);

  return model && model.enabled ? model : null;
}

export async function resolveEmbeddingModel(): Promise<AtlasModelConfig | null> {
  const registry = await readRegistry();
  if (!registry.embeddingModelId) return null;

  const model = registry.models.find((entry) => entry.id === registry.embeddingModelId);
  return model && model.enabled ? model : null;
}

export async function setEmbeddingModel(id: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "embeddingModelId" },
    create: { key: "embeddingModelId", value: id },
    update: { value: id },
  });
}

export function hasRegistryModels(): boolean {
  return Boolean(process.env.ATLAS_REGISTRY_ENABLED);
}

export const builtInDomainList = builtInDomains;

export async function addDomain(domain: string): Promise<string[]> {
  const clean = domain.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const registry = await readRegistry();

  if (clean && !registry.domains.includes(clean)) {
    await prisma.domain.create({ data: { slug: clean, builtIn: false } });
  }

  const refreshed = await prisma.domain.findMany({ orderBy: { createdAt: "asc" } });

  return refreshed.map((entry) => entry.slug);
}

export async function removeDomain(domain: string): Promise<string[]> {
  await prisma.routingRule.deleteMany({ where: { domain } });
  await prisma.domain.deleteMany({ where: { slug: domain, builtIn: false } });
  const refreshed = await prisma.domain.findMany({ orderBy: { createdAt: "asc" } });

  return refreshed.map((entry) => entry.slug);
}

export async function readVoiceConfig(): Promise<AtlasVoiceConfig> {
  const registry = await readRegistry();

  return registry.voice;
}

export async function writeVoiceConfig(voice: AtlasVoiceConfig): Promise<AtlasVoiceConfig> {
  await prisma.voiceConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...voice },
    update: { ...voice },
  });

  return voice;
}

export async function readSerperApiKey(): Promise<string> {
  const record = await prisma.setting.findUnique({ where: { key: "serperApiKey" } });
  return decryptSecret(record?.value ?? "");
}

export async function writeSerperApiKey(apiKey: string): Promise<void> {
  const clean = apiKey.trim();

  if (!clean) {
    await prisma.setting.deleteMany({ where: { key: "serperApiKey" } });
    return;
  }

  await prisma.setting.upsert({
    where: { key: "serperApiKey" },
    create: { key: "serperApiKey", value: encryptSecret(clean, "Serper API key") },
    update: { value: encryptSecret(clean, "Serper API key") },
  });
}

export async function upsertModel(model: AtlasModelConfig): Promise<void> {
  const credentialId = model.credentialId;

  if (!credentialId) {
    throw new Error("A credential is required to add a model.");
  }

  const existing = await prisma.modelConfig.findUnique({ where: { id: model.id } });

  if (existing) {
    await prisma.modelConfig.update({
      where: { id: model.id },
      data: {
        label: model.label,
        enabled: model.enabled,
        credentialId,
      },
    });
  } else {
    await prisma.modelConfig.create({
      data: {
        id: model.id,
        label: model.label,
        enabled: model.enabled,
        isDefault: false,
        credential: { connect: { id: credentialId } },
      },
    });
  }
}

export async function createCredential(input: AtlasCredential): Promise<AtlasCredential> {
  const created = await prisma.credential.create({
    data: {
      label: input.label,
      provider: input.provider,
      apiKey: encryptSecret(input.apiKey, "credential API key"),
      baseUrl: input.baseUrl,
    },
  });

  return {
    id: created.id,
    label: created.label,
    provider: created.provider as AtlasProvider,
    apiKey: input.apiKey,
    baseUrl: created.baseUrl ?? undefined,
  };
}

export async function listCredentials(): Promise<AtlasCredential[]> {
  const credentials = await prisma.credential.findMany({ orderBy: { createdAt: "asc" } });

  return credentials.map((credential) => ({
    id: credential.id,
    label: credential.label,
    provider: credential.provider as AtlasProvider,
    apiKey: decryptSecret(credential.apiKey),
    baseUrl: credential.baseUrl ?? undefined,
  }));
}

export async function deleteCredential(id: string): Promise<void> {
  await prisma.credential.delete({ where: { id } });
}

export async function deleteModel(id: string): Promise<void> {
  await prisma.routingRule.deleteMany({ where: { modelId: id } });
  await prisma.modelConfig.deleteMany({ where: { id } });
}

export async function setDefaultModel(id: string): Promise<void> {
  await prisma.modelConfig.updateMany({ data: { isDefault: false } });
  await prisma.modelConfig.updateMany({ where: { id }, data: { isDefault: true } });
}

export async function setFallbackModels(modelId: string, fallbackIds: string[]): Promise<void> {
  const clean = Array.from(new Set(fallbackIds.filter((id) => id !== modelId)));
  await prisma.modelConfig.update({
    where: { id: modelId },
    data: { fallbackModelIds: JSON.stringify(clean) },
  });
}

export interface ModelResolutionResult {
  primary: AtlasModelConfig | null;
  fallbacks: AtlasModelConfig[];
}

/**
 * Resolve a model for a domain, including its fallback chain.
 * The primary model is the one configured for the domain (or default).
 * The fallbacks are the primary's configured fallback models, filtered to
 * enabled models that exist in the registry.
 */
export async function resolveModelWithFallbacks(
  domain: AtlasActionDomain
): Promise<ModelResolutionResult> {
  const registry = await readRegistry();
  const rule = registry.routing.find((entry) => entry.domain === domain);
  const modelId = rule?.modelId || registry.defaultModelId;
  const primary = registry.models.find((entry) => entry.id === modelId);

  if (!primary || !primary.enabled) {
    return { primary: null, fallbacks: [] };
  }

  const allModelsById = new Map(registry.models.map((m) => [m.id, m]));
  const fallbacks: AtlasModelConfig[] = [];
  const seen = new Set<string>([primary.id]);

  for (const fallbackId of primary.fallbackModelIds ?? []) {
    if (seen.has(fallbackId)) continue;
    const fallback = allModelsById.get(fallbackId);
    if (fallback && fallback.enabled) {
      fallbacks.push(fallback);
      seen.add(fallbackId);
    }
  }

  return { primary, fallbacks };
}

/**
 * Resolve a model by id, including its fallback chain.
 * Used for non-domain-specific model resolution.
 */
export async function resolveModelByIdWithFallbacks(
  modelId: string
): Promise<ModelResolutionResult> {
  const registry = await readRegistry();
  const primary = registry.models.find((entry) => entry.id === modelId);

  if (!primary || !primary.enabled) {
    return { primary: null, fallbacks: [] };
  }

  const allModelsById = new Map(registry.models.map((m) => [m.id, m]));
  const fallbacks: AtlasModelConfig[] = [];
  const seen = new Set<string>([primary.id]);

  for (const fallbackId of primary.fallbackModelIds ?? []) {
    if (seen.has(fallbackId)) continue;
    const fallback = allModelsById.get(fallbackId);
    if (fallback && fallback.enabled) {
      fallbacks.push(fallback);
      seen.add(fallbackId);
    }
  }

  return { primary, fallbacks };
}

export async function upsertRouting(domain: string, modelId: string): Promise<void> {
  const existing = await prisma.routingRule.findFirst({ where: { domain } });

  if (existing) {
    await prisma.routingRule.update({ where: { id: existing.id }, data: { modelId } });
  } else {
    await prisma.routingRule.create({ data: { domain, modelId } });
  }
}

export interface AtlasMcpServer {
  id: string;
  name: string;
  url: string | null;
  token: string | null;
  command: string;
  args: string[];
  env: Record<string, string>;
  domain: string;
  /** Inferred roles, e.g. ["agent", "knowledge"]. */
  roles: string[];
  /** Tool name -> tool categories. */
  toolRoles: Record<string, string[]>;
  global: boolean;
  enabled: boolean;
  toolCount: number;
  lastError: string | null;
}

export interface AtlasMcpServerInput {
  id?: string;
  name: string;
  url?: string;
  token?: string;
  command?: string;
  args: string[];
  env: Record<string, string>;
  domain: string;
  roles?: string[];
  toolRoles?: Record<string, string[]>;
  global?: boolean;
}

function parseList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseEnv(value: string | null): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of parseList(value)) {
    const separator = line.indexOf("=");

    if (separator > 0) {
      result[line.slice(0, separator)] = line.slice(separator + 1);
    }
  }

  return result;
}

function parseRoles(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function parseToolRoles(value: string | null): Record<string, string[]> {
  if (!value) return {};

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return {};

    const result: Record<string, string[]> = {};

    for (const [key, val] of Object.entries(parsed)) {
      if (Array.isArray(val)) {
        result[key] = val.filter((entry): entry is string => typeof entry === "string");
      }
    }

    return result;
  } catch {
    return {};
  }
}

export async function listMcpServers(): Promise<AtlasMcpServer[]> {
  const servers = await prisma.mcpServer.findMany({ orderBy: { createdAt: "asc" } });

  return servers.map((server) => ({
    id: server.id,
    name: server.name,
    url: server.url,
    token: decryptSecret(server.token),
    command: server.command,
    args: parseList(server.args),
    env: parseEnv(server.env),
    domain: server.domain,
    roles: parseRoles(server.roles),
    toolRoles: parseToolRoles(server.toolRoles),
    global: server.global,
    enabled: server.enabled,
    toolCount: server.toolCount,
    lastError: server.lastError,
  }));
}

export async function getMcpServer(id: string): Promise<AtlasMcpServer | null> {
  const server = await prisma.mcpServer.findUnique({ where: { id } });

  if (!server) {
    return null;
  }

  return {
    id: server.id,
    name: server.name,
    url: server.url,
    token: decryptSecret(server.token),
    command: server.command,
    args: parseList(server.args),
    env: parseEnv(server.env),
    domain: server.domain,
    roles: parseRoles(server.roles),
    toolRoles: parseToolRoles(server.toolRoles),
    global: server.global,
    enabled: server.enabled,
    toolCount: server.toolCount,
    lastError: server.lastError,
  };
}

export async function upsertMcpServer(input: AtlasMcpServerInput): Promise<AtlasMcpServer> {
  const data = {
    name: input.name,
    url: input.url && input.url.trim().length > 0 ? input.url.trim() : null,
    token:
      input.token && input.token.trim().length > 0 ? encryptSecret(input.token.trim(), "MCP token") : null,
    command: input.command ?? "",
    args: input.args.join("\n"),
    env: Object.entries(input.env)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
    domain: input.domain,
    roles: JSON.stringify(input.roles ?? []),
    toolRoles: JSON.stringify(input.toolRoles ?? {}),
    global: Boolean(input.global),
  };

  if (input.id) {
    const updated = await prisma.mcpServer.update({ where: { id: input.id }, data });

    return {
      id: updated.id,
      name: updated.name,
      url: updated.url,
      token: decryptSecret(updated.token),
      command: updated.command,
      args: parseList(updated.args),
      env: parseEnv(updated.env),
      domain: updated.domain,
      roles: parseRoles(updated.roles),
      toolRoles: parseToolRoles(updated.toolRoles),
      global: updated.global,
      enabled: updated.enabled,
      toolCount: updated.toolCount,
      lastError: updated.lastError,
    };
  }

  const created = await prisma.mcpServer.create({ data });

  return {
    id: created.id,
    name: created.name,
    url: created.url,
    token: decryptSecret(created.token),
    command: created.command,
    args: parseList(created.args),
    env: parseEnv(created.env),
    domain: created.domain,
    roles: parseRoles(created.roles),
    toolRoles: parseToolRoles(created.toolRoles),
    global: created.global,
    enabled: created.enabled,
    toolCount: created.toolCount,
    lastError: created.lastError,
  };
}

export async function deleteMcpServer(id: string): Promise<void> {
  await prisma.mcpServer.delete({ where: { id } });
}

export async function updateMcpServerHealth(id: string, toolCount: number, lastError: string | null): Promise<void> {
  await prisma.mcpServer.update({
    where: { id },
    data: { toolCount, lastError },
  });
}

/** Persist inferred roles + tool classifications for a server. */
export async function updateMcpClassification(
  id: string,
  roles: string[],
  toolRoles: Record<string, string[]>
): Promise<void> {
  await prisma.mcpServer.update({
    where: { id },
    data: {
      roles: JSON.stringify(roles),
      toolRoles: JSON.stringify(toolRoles),
    },
  });
}

export async function getStoredMcpClientId(): Promise<string | null> {
  const record = await prisma.mcpOAuthClient.findUnique({ where: { id: 1 } });

  return record?.clientId ?? null;
}

export async function storeMcpClientId(clientId: string): Promise<void> {
  await prisma.mcpOAuthClient.upsert({
    where: { id: 1 },
    create: { id: 1, clientId },
    update: { clientId },
  });
}
