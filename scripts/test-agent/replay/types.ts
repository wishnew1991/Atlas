import type { Capability } from "@/lib/atlas/planner/planner";
import type { AtlasActionDomain } from "@/lib/atlas/agent-contract";

// ── Dataset ──

export interface ConversationTurn {
  user: string;
  expect?: TurnExpectation;
  injectFault?: TurnFault;
  clearFaults?: boolean;
}

export interface TurnExpectation {
  capability?: Capability | Capability[];
  toolsCalled?: string[];
  shouldNotHaveTools?: boolean;
  hasApproval?: boolean;
  shouldNotHaveAction?: boolean;
  continuation?: boolean;
  domain?: AtlasActionDomain;
  intent?: "chat" | "tool" | "task" | "clarify";
  memoryUsed?: boolean;
  maxLatencyMs?: number;
  minLatencyMs?: number;
  minTokensUsed?: number;
}

export interface TurnFault {
  llmErrorRate?: number;
  llmLatencyMs?: number;
  mcpErrorRate?: number;
  mcpLatencyMs?: number;
  errorKind?: "timeout" | "rate_limit" | "server_error" | "network_error";
}

export interface ConversationDataset {
  name: string;
  description?: string;
  domain?: string;
  turns: ConversationTurn[];
}

// ── Trace ──

export interface TurnTraceEntry {
  user: string;
  reply: string;
  capability?: Capability[];
  toolsUsed: string[];
  action?: { domain: string; title: string } | null;
  latencyMs: number;
  executionId?: string;
  conversationId?: string;
  tokensIn?: number;
  tokensOut?: number;
  error?: string;
  assertions: AssertionResult[];
}

export interface AssertionResult {
  type: string;
  passed: boolean;
  detail: string;
}

export interface ConversationTrace {
  dataset: string;
  turns: TurnTraceEntry[];
  startedAt: string;
  completedAt: string;
  totalLatencyMs: number;
  turnCount: number;
  assertionCount: number;
  assertionPassed: number;
}

// ── Hooks ──

export enum HookPriority {
  Critical = 0,
  Assertion = 10,
  Persistence = 20,
  Metrics = 30,
  Telemetry = 40,
  Observer = 50,
}

export enum HookMode {
  Critical = "critical",
  Observational = "observational",
}

export interface HookContext {
  dataset: ConversationDataset;
  turn: ConversationTurn | null;
  turnIndex: number;
  startedAt: number;
  trace: Readonly<Partial<ConversationTrace>>;
}

export interface TurnResult {
  reply: string;
  toolsUsed: string[];
  action?: { domain: string; title: string } | null;
  latencyMs: number;
  executionId?: string;
  conversationId?: string;
  tokensIn?: number;
  tokensOut?: number;
  capability?: Capability[];
  error?: string;
}

export interface ReplayHook {
  readonly name: string;
  readonly priority: HookPriority;
  readonly mode: HookMode;

  onReplayStart?(ctx: HookContext): void | Promise<void>;
  onTurnStart?(ctx: HookContext): void | Promise<void>;
  onTurnEnd?(ctx: HookContext, result: Readonly<TurnResult>): void | Promise<void>;
  onTurnError?(ctx: HookContext, error: Error): void | Promise<void>;
  onReplayEnd?(ctx: HookContext): void | Promise<void>;
}

// ── Fault Injection ──

export interface FaultConfig {
  llmErrorRate?: number;
  llmLatencyMs?: number;
  mcpErrorRate?: number;
  mcpLatencyMs?: number;
}
