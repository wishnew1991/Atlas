import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";

// ── Registry domain types ──

export type ProviderKind = "mcp" | "api" | "sdk" | "browser";
export type ProviderAuthType = "api_key" | "oauth2" | "none";
export type ProviderSource = "catalog" | "discovered" | "manual";
export type ProviderStatus = "draft" | "active" | "deprecated";
export type SkillStatus = "draft" | "active" | "deprecated";

export interface ProviderDefinition {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string | null;
  authType: ProviderAuthType;
  credentialId?: string | null;
  endpoints: unknown[];
  endpointsDiscoveredAt?: Date | null;
  source: ProviderSource;
  status: ProviderStatus;
  enabled: boolean;
  lastTestedAt?: Date | null;
  lastTestOk?: boolean | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillDefinition {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  capabilityId: string;
  connectorId?: string | null;
  providerId?: string | null;
  connectorName?: string | null;
  providerName?: string | null;
  requiresApproval: boolean;
  enabled: boolean;
  version: string;
  status: SkillStatus;
  recipe: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderInput {
  id?: string;
  name: string;
  kind?: ProviderKind;
  baseUrl?: string;
  authType?: ProviderAuthType;
  credentialId?: string;
  endpoints?: unknown[];
  source?: ProviderSource;
  status?: ProviderStatus;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SkillInput {
  id?: string;
  name: string;
  category?: string;
  description?: string;
  capabilityId: string;
  connectorId?: string;
  providerId?: string;
  requiresApproval?: boolean;
  enabled?: boolean;
  version?: string;
  status?: SkillStatus;
  recipe?: Record<string, unknown>;
}

function mapProvider(row: {
  id: string;
  name: string;
  kind: string;
  baseUrl: string | null;
  authType: string;
  credentialId: string | null;
  endpointCatalogJson: string;
  endpointsDiscoveredAt: Date | null;
  source: string;
  status: string;
  enabled: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  metadataJson: string;
  createdAt: Date;
  updatedAt: Date;
}): ProviderDefinition {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as ProviderKind,
    baseUrl: row.baseUrl,
    authType: row.authType as ProviderAuthType,
    credentialId: row.credentialId,
    endpoints: asArray(safeParse(row.endpointCatalogJson)),
    endpointsDiscoveredAt: row.endpointsDiscoveredAt,
    source: row.source as ProviderSource,
    status: row.status as ProviderStatus,
    enabled: row.enabled,
    lastTestedAt: row.lastTestedAt,
    lastTestOk: row.lastTestOk,
    metadata: asRecord(safeParse(row.metadataJson)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSkill(row: {
  id: string;
  name: string;
  category: string;
  description: string | null;
  capabilityId: string;
  connectorId: string | null;
  providerId: string | null;
  connector: { name: string } | null;
  provider: { name: string } | null;
  requiresApproval: boolean;
  enabled: boolean;
  version: string;
  status: string;
  recipeJson: string;
  createdAt: Date;
  updatedAt: Date;
}): SkillDefinition {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    capabilityId: row.capabilityId,
    connectorId: row.connectorId,
    providerId: row.providerId,
    connectorName: row.connector?.name ?? null,
    providerName: row.provider?.name ?? null,
    requiresApproval: row.requiresApproval,
    enabled: row.enabled,
    version: row.version,
    status: row.status as SkillStatus,
    recipe: asRecord(safeParse(row.recipeJson)),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// ── Providers ──

export async function listProviders(): Promise<ProviderDefinition[]> {
  const rows = await prisma.provider.findMany({ orderBy: { name: "asc" } });
  return rows.map(mapProvider);
}

export async function getProvider(id: string): Promise<ProviderDefinition | null> {
  const row = await prisma.provider.findUnique({ where: { id } });
  return row ? mapProvider(row) : null;
}

export async function createProvider(input: ProviderInput): Promise<ProviderDefinition> {
  const row = await prisma.provider.create({
    data: {
      id: input.id ?? crypto.randomUUID(),
      name: input.name,
      kind: input.kind ?? "mcp",
      baseUrl: input.baseUrl,
      authType: input.authType ?? "api_key",
      credentialId: input.credentialId,
      endpointCatalogJson: JSON.stringify(input.endpoints ?? []),
      source: input.source ?? "manual",
      status: input.status ?? "active",
      enabled: input.enabled ?? true,
      metadataJson: JSON.stringify(input.metadata ?? {}),
    },
  });
  return mapProvider(row);
}

export async function updateProvider(
  id: string,
  input: Partial<ProviderInput> & { testResult?: { ok: boolean; testedAt: Date } }
): Promise<ProviderDefinition | null> {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl;
  if (input.authType !== undefined) data.authType = input.authType;
  if (input.credentialId !== undefined) data.credentialId = input.credentialId;
  if (input.endpoints !== undefined) data.endpointCatalogJson = JSON.stringify(input.endpoints);
  if (input.source !== undefined) data.source = input.source;
  if (input.status !== undefined) data.status = input.status;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.metadata !== undefined) data.metadataJson = JSON.stringify(input.metadata);
  if (input.testResult) {
    data.lastTestedAt = input.testResult.testedAt;
    data.lastTestOk = input.testResult.ok;
  }

  const row = await prisma.provider.update({ where: { id }, data });
  return mapProvider(row);
}

export async function deleteProvider(id: string): Promise<boolean> {
  const row = await prisma.provider.delete({ where: { id } });
  return Boolean(row);
}

export async function recordProviderTest(id: string, ok: boolean): Promise<void> {
  await prisma.provider.update({
    where: { id },
    data: { lastTestedAt: new Date(), lastTestOk: ok },
  });
}

// ── Skills ──

export async function listSkills(): Promise<SkillDefinition[]> {
  const rows = await prisma.skill.findMany({
    include: { connector: true, provider: true },
    orderBy: { name: "asc" },
  });
  return rows.map(mapSkill);
}

export async function getSkill(id: string): Promise<SkillDefinition | null> {
  const row = await prisma.skill.findUnique({
    where: { id },
    include: { connector: true, provider: true },
  });
  return row ? mapSkill(row) : null;
}

export async function createSkill(input: SkillInput): Promise<SkillDefinition> {
  const row = await prisma.skill.create({
    data: {
      id: input.id ?? crypto.randomUUID(),
      name: input.name,
      category: input.category ?? "action",
      description: input.description,
      capabilityId: input.capabilityId,
      connectorId: input.connectorId,
      providerId: input.providerId,
      requiresApproval: input.requiresApproval ?? true,
      enabled: input.enabled ?? true,
      version: input.version ?? "1.0.0",
      status: input.status ?? "active",
      recipeJson: JSON.stringify(input.recipe ?? {}),
    },
    include: { connector: true, provider: true },
  });
  return mapSkill(row);
}

export async function updateSkill(
  id: string,
  input: Partial<SkillInput>
): Promise<SkillDefinition | null> {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.category !== undefined) data.category = input.category;
  if (input.description !== undefined) data.description = input.description;
  if (input.capabilityId !== undefined) data.capabilityId = input.capabilityId;
  if (input.connectorId !== undefined) data.connectorId = input.connectorId;
  if (input.providerId !== undefined) data.providerId = input.providerId;
  if (input.requiresApproval !== undefined) data.requiresApproval = input.requiresApproval;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.version !== undefined) data.version = input.version;
  if (input.status !== undefined) data.status = input.status;
  if (input.recipe !== undefined) data.recipeJson = JSON.stringify(input.recipe);

  const row = await prisma.skill.update({
    where: { id },
    data,
    include: { connector: true, provider: true },
  });
  return mapSkill(row);
}

export async function deleteSkill(id: string): Promise<boolean> {
  const row = await prisma.skill.delete({ where: { id } });
  return Boolean(row);
}

// ── Enabled skills for the consumer app ──

export async function listEnabledSkills(): Promise<SkillDefinition[]> {
  const rows = await prisma.skill.findMany({
    where: { enabled: true, status: "active" },
    include: { connector: true, provider: true },
    orderBy: { name: "asc" },
  });
  return rows.map(mapSkill);
}