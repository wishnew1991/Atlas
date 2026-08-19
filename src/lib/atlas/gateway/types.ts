import type { AtlasActionDomain } from "@/lib/atlas/agent-contract";

export type TransportKind = "mcp" | "rest" | "sdk" | "graphql" | "browser";
export type ApprovalRisk = "standard" | "payment" | "irreversible";

export interface ConnectorAuthProfile {
  requiredScopes: string[];
  optionalScopes?: string[];
}

export interface ConnectorSessionState {
  userId: string;
  integrationId: string;
  status: "active" | "expired" | "revoked";
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ConnectorExecuteParams {
  domain: AtlasActionDomain;
  request: string;
  session?: ConnectorSessionState;
}

export interface ConnectorExecuteResult {
  message: string;
  actionRequired?: boolean;
  actionId?: string;
  risk?: ApprovalRisk;
  data?: unknown;
}

export interface UniversalConnector {
  id: string;
  domain: AtlasActionDomain;
  supportedTransports: TransportKind[];
  authProfile: ConnectorAuthProfile;

  discover(): Promise<void>;
  prepare(params: ConnectorExecuteParams): Promise<void>;
  execute(params: ConnectorExecuteParams): Promise<ConnectorExecuteResult>;
  status(actionId: string): Promise<string>;
  cancel(actionId: string): Promise<boolean>;
  health(): Promise<"healthy" | "degraded" | "down">;
}
