/**
 * Integration Registry types.
 *
 * Integration  = definition (platform-level, created once)
 * IntegrationConfig = admin-scoped configuration (API key, base URL)
 * UserConnection    = user-scoped connection (OAuth token, personal API key)
 */

import type { CanonicalCapability } from "@/lib/atlas/capabilities/types";

// ── Transport ──

export type TransportKind = "mcp" | "rest" | "sdk" | "graphql" | "browser";

export const TRANSPORT_KINDS: TransportKind[] = ["mcp", "rest", "sdk", "graphql", "browser"];

// ── Auth Methods ──

export interface AuthMethod {
  kind: "oauth2" | "api_key" | "none";
  label?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  configSchema?: Record<string, unknown>;
}

// ── Integration Definition ──

export interface IntegrationDefinition {
  id: string;                     // "swiggy", "zomato", "amazon"
  name: string;                   // "Swiggy", "Zomato", "Amazon"
  transport: TransportKind;       // "mcp" | "rest" | "sdk" | "graphql" | "browser"
  transportOrderJson?: string;    // optional transport fallback order from the DB row
  authMethods: AuthMethod[];
  icon?: string;
  description?: string;
  enabled: boolean;
  capabilities: IntegrationCapabilityLink[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationCapabilityLink {
  capabilityId: CanonicalCapability;
  priority: number;               // lower = preferred among integrations
}

// ── Admin Configuration ──

export interface IntegrationConfigInput {
  integrationId: string;
  label?: string;
  baseUrl?: string;
  apiKey?: string;                // encrypted at rest
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IntegrationConfig extends IntegrationConfigInput {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── User Connection ──

export type ConnectionStatus = "active" | "expired" | "revoked";

export interface UserConnectionInput {
  userId: string;
  integrationId: string;
  displayName?: string;
  oauthToken?: string;            // encrypted
  oauthRefresh?: string;
  tokenExpiresAt?: Date;
  apiKey?: string;
}

export interface UserConnection extends UserConnectionInput {
  id: string;
  status: ConnectionStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
