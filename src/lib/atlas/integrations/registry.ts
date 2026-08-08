import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import type { CanonicalCapability } from "@/lib/atlas/capabilities/types";
import type {
  IntegrationDefinition,
  IntegrationConfigInput,
  UserConnectionInput,
  AuthMethod,
} from "./types";

// ── Integration Definition CRUD ──

export async function listIntegrations(): Promise<IntegrationDefinition[]> {
  const rows = await prisma.integration.findMany({
    include: { capacities: true },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    transport: row.transport as IntegrationDefinition["transport"],
    authMethods: JSON.parse(row.authMethodsJson) as AuthMethod[],
    icon: row.icon ?? undefined,
    description: row.description ?? undefined,
    enabled: row.enabled,
    capabilities: row.capacities.map((c) => ({
      capabilityId: c.capabilityId as CanonicalCapability,
      priority: c.priority,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export interface CreateIntegrationInput {
  id: string;
  name: string;
  transport: IntegrationDefinition["transport"];
  authMethods: AuthMethod[];
  icon?: string;
  description?: string;
  capabilities?: { capabilityId: CanonicalCapability; priority: number }[];
}

export async function createIntegration(
  input: CreateIntegrationInput
): Promise<IntegrationDefinition> {
  const { capabilities, ...data } = input;

  const row = await prisma.integration.create({
    data: {
      id: data.id,
      name: data.name,
      transport: data.transport,
      authMethodsJson: JSON.stringify(data.authMethods),
      icon: data.icon,
      description: data.description,
      capacities: capabilities
        ? { create: capabilities.map((c) => ({ capabilityId: c.capabilityId, priority: c.priority })) }
        : undefined,
    },
    include: { capacities: true },
  });

  return {
    id: row.id,
    name: row.name,
    transport: row.transport as IntegrationDefinition["transport"],
    authMethods: JSON.parse(row.authMethodsJson) as AuthMethod[],
    icon: row.icon ?? undefined,
    description: row.description ?? undefined,
    enabled: row.enabled,
    capabilities: row.capacities.map((c) => ({
      capabilityId: c.capabilityId as CanonicalCapability,
      priority: c.priority,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface UpdateIntegrationInput {
  name?: string;
  transport?: IntegrationDefinition["transport"];
  authMethods?: AuthMethod[];
  icon?: string | null;
  description?: string | null;
  enabled?: boolean;
  capabilities?: { capabilityId: CanonicalCapability; priority: number }[];
}

export async function updateIntegration(
  id: string,
  input: UpdateIntegrationInput
): Promise<IntegrationDefinition | null> {
  const existing = await prisma.integration.findUnique({ where: { id } });
  if (!existing) return null;

  const { capabilities, ...fields } = input;

  const row = await prisma.integration.update({
    where: { id },
    data: {
      ...(fields.name !== undefined ? { name: fields.name } : {}),
      ...(fields.transport !== undefined ? { transport: fields.transport } : {}),
      ...(fields.authMethods !== undefined
        ? { authMethodsJson: JSON.stringify(fields.authMethods) }
        : {}),
      ...(fields.icon !== undefined ? { icon: fields.icon } : {}),
      ...(fields.description !== undefined ? { description: fields.description } : {}),
      ...(fields.enabled !== undefined ? { enabled: fields.enabled } : {}),
    },
    include: { capacities: true },
  });

  if (capabilities !== undefined) {
    await prisma.integrationCapability.deleteMany({ where: { integrationId: id } });
    if (capabilities.length > 0) {
      await prisma.integrationCapability.createMany({
        data: capabilities.map((c) => ({
          integrationId: id,
          capabilityId: c.capabilityId,
          priority: c.priority,
        })),
      });
    }

    const refreshed = await prisma.integration.findUnique({
      where: { id },
      include: { capacities: true },
    });
    if (!refreshed) return null;

    return {
      id: refreshed.id,
      name: refreshed.name,
      transport: refreshed.transport as IntegrationDefinition["transport"],
      authMethods: JSON.parse(refreshed.authMethodsJson) as AuthMethod[],
      icon: refreshed.icon ?? undefined,
      description: refreshed.description ?? undefined,
      enabled: refreshed.enabled,
      capabilities: refreshed.capacities.map((c) => ({
        capabilityId: c.capabilityId as CanonicalCapability,
        priority: c.priority,
      })),
      createdAt: refreshed.createdAt,
      updatedAt: refreshed.updatedAt,
    };
  }

  return {
    id: row.id,
    name: row.name,
    transport: row.transport as IntegrationDefinition["transport"],
    authMethods: JSON.parse(row.authMethodsJson) as AuthMethod[],
    icon: row.icon ?? undefined,
    description: row.description ?? undefined,
    enabled: row.enabled,
    capabilities: row.capacities.map((c) => ({
      capabilityId: c.capabilityId as CanonicalCapability,
      priority: c.priority,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function deleteIntegration(id: string): Promise<boolean> {
  const existing = await prisma.integration.findUnique({ where: { id } });
  if (!existing) return false;

  const activeConnections = await prisma.userConnection.count({
    where: { integrationId: id, status: "active" },
  });
  if (activeConnections > 0) return false;

  await prisma.integration.delete({ where: { id } });
  return true;
}

export async function getIntegration(id: string): Promise<IntegrationDefinition | null> {
  const row = await prisma.integration.findUnique({
    where: { id },
    include: { capacities: true },
  });
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    transport: row.transport as IntegrationDefinition["transport"],
    authMethods: JSON.parse(row.authMethodsJson) as AuthMethod[],
    icon: row.icon ?? undefined,
    description: row.description ?? undefined,
    enabled: row.enabled,
    capabilities: row.capacities.map((c) => ({
      capabilityId: c.capabilityId as CanonicalCapability,
      priority: c.priority,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getIntegrationsForCapability(
  capability: CanonicalCapability
): Promise<IntegrationDefinition[]> {
  const rows = await prisma.integration.findMany({
    where: {
      enabled: true,
      capacities: { some: { capabilityId: capability } },
    },
    include: { capacities: { where: { capabilityId: capability } } },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    transport: row.transport as IntegrationDefinition["transport"],
    authMethods: JSON.parse(row.authMethodsJson) as AuthMethod[],
    icon: row.icon ?? undefined,
    description: row.description ?? undefined,
    enabled: row.enabled,
    capabilities: row.capacities.map((c) => ({
      capabilityId: c.capabilityId as CanonicalCapability,
      priority: c.priority,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

// ── Integration Config CRUD ──

export async function listIntegrationConfigs(integrationId: string) {
  return prisma.integrationConfig.findMany({
    where: { integrationId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getIntegrationConfig(id: string) {
  return prisma.integrationConfig.findUnique({ where: { id } });
}

export async function upsertIntegrationConfig(input: IntegrationConfigInput) {
  return prisma.integrationConfig.upsert({
    where: { id: input.integrationId },
    create: {
      id: input.integrationId,
      integrationId: input.integrationId,
      label: input.label,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey ?? null,
      enabled: input.enabled ?? true,
      metadataJson: JSON.stringify(input.metadata ?? {}),
    },
    update: {
      label: input.label,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey ?? null,
      enabled: input.enabled ?? true,
      metadataJson: JSON.stringify(input.metadata ?? {}),
    },
  });
}

export async function deleteIntegrationConfig(id: string) {
  return prisma.integrationConfig.delete({ where: { id } });
}

// ── User Connection CRUD ──

export async function listUserConnections(userId: string) {
  return prisma.userConnection.findMany({
    where: { userId },
    include: { integration: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function upsertUserConnection(input: UserConnectionInput) {
  return prisma.userConnection.upsert({
    where: { userId_integrationId: { userId: input.userId, integrationId: input.integrationId } },
    create: {
      userId: input.userId,
      integrationId: input.integrationId,
      displayName: input.displayName,
      oauthToken: input.oauthToken ?? null,
      oauthRefresh: input.oauthRefresh ?? null,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      apiKey: input.apiKey ?? null,
      status: "active",
      metadataJson: "{}",
    },
    update: {
      displayName: input.displayName,
      oauthToken: input.oauthToken ?? null,
      oauthRefresh: input.oauthRefresh ?? null,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      apiKey: input.apiKey ?? null,
      status: "active",
    },
  });
}

export async function deleteUserConnection(id: string) {
  return prisma.userConnection.delete({ where: { id } });
}

export async function deleteUserConnectionByIntegration(userId: string, integrationId: string) {
  const connection = await prisma.userConnection.findUnique({
    where: { userId_integrationId: { userId, integrationId } },
  });
  if (!connection) return false;
  await prisma.userConnection.delete({ where: { id: connection.id } });
  return true;
}

// ── Capabilities ──

export async function listCapabilities() {
  return prisma.capability.findMany({ orderBy: { name: "asc" } });
}
