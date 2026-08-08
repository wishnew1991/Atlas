/**
 * Behavioral Validation Framework Types
 * Defines conversation datasets, traces, and behavioral assertions
 */

// Conversation turn types
export type ConversationTurn = 
  | UserTurn
  | ExpectationTurn
  | SystemTurn;

export interface UserTurn {
  type: "user";
  message: string;
}

export interface ExpectationTurn {
  type: "expect";
  capability?: string;
  tool?: string;
  approval?: boolean;
  status?: string;
  latency?: number;
  noApproval?: boolean;
  contains?: string;
  notContains?: string;
  referenceResolution?: boolean;
  memoryRetrieval?: boolean;
  memoryStorage?: boolean;
}

export interface SystemTurn {
  type: "system";
  action: "new_conversation" | "reset_context" | "simulate_delay";
  delay?: number; // milliseconds
}

// Conversation dataset
export interface ConversationDataset {
  id: string;
  name: string;
  description: string;
  category: ConversationCategory;
  tags: string[];
  turns: ConversationTurn[];
  metadata: ConversationMetadata;
}

export type ConversationCategory = 
  | "food"
  | "shopping"
  | "travel"
  | "appointments"
  | "rides"
  | "multi_capability"
  | "edge_cases"
  | "regressions";

export interface ConversationMetadata {
  author?: string;
  createdAt: string;
  version: string;
  difficulty: "basic" | "intermediate" | "advanced";
  estimatedDuration: number; // seconds
  requiresCapabilities: string[];
  requiresMcpServers: string[];
}

// Execution trace
export interface ExecutionTrace {
  conversationId: string;
  datasetId: string;
  turnNumber: number;
  timestamp: Date;
  userMessage: string;
  assistantResponse: string;
  plannerDecision: PlannerDecision;
  capabilitySelected: string;
  toolCalls: ToolCall[];
  mcpRequests: McpRequest[];
  mcpResponses: McpResponse[];
  memoryRetrieved: MemoryOperation[];
  memoryStored: MemoryOperation[];
  routineCreated?: RoutineOperation;
  approvalRequest?: ApprovalOperation;
  errors: ErrorTrace[];
  latency: LatencyMetrics;
  tokenUsage: TokenUsage;
}

export interface PlannerDecision {
  intent: string;
  capability: string;
  domain: string;
  confidence: number;
  reasoning: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  duration: number;
  success: boolean;
}

export interface McpRequest {
  tool: string;
  arguments: Record<string, unknown>;
  server: string;
  timestamp: Date;
}

export interface McpResponse {
  success: boolean;
  data: unknown;
  duration: number;
  server: string;
}

export interface MemoryOperation {
  type: "retrieve" | "store" | "update";
  query?: string;
  keys: string[];
  results: number;
  duration: number;
}

export interface RoutineOperation {
  id: string;
  type: string;
  steps: string[];
  status: string;
}

export interface ApprovalOperation {
  id: string;
  type: string;
  title: string;
  fields: Record<string, unknown>;
  status: "pending" | "granted" | "denied";
}

export interface ErrorTrace {
  turn: number;
  message: string;
  stack?: string;
  recoverable: boolean;
}

export interface LatencyMetrics {
  total: number;
  planner: number;
  llm: number;
  mcp: number;
  memory: number;
  totalTurns: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  model: string;
}

// Behavioral assertion result
export interface AssertionResult {
  turn: number;
  passed: boolean;
  assertion: string;
  expected: unknown;
  actual: unknown;
  message: string;
  severity: "error" | "warning" | "info";
}

// Behavioral report
export interface BehavioralReport {
  datasetId: string;
  datasetName: string;
  overallSuccess: boolean;
  totalTurns: number;
  successfulTurns: number;
  failedTurns: number;
  assertions: AssertionResult[];
  traces: ExecutionTrace[];
  summary: BehavioralSummary;
  regressionComparison?: RegressionComparison;
  generatedAt: Date;
}

export interface BehavioralSummary {
  plannerAccuracy: number;
  toolCorrectness: number;
  memoryCorrectness: number;
  routineCorrectness: number;
  conversationFlowCorrectness: number;
  averageLatency: number;
  averageTokenUsage: number;
  errorRate: number;
}

export interface RegressionComparison {
  baselineTraceId: string;
  currentTraceId: string;
  plannerChanges: string[];
  toolOrderingChanges: string[];
  memoryUsageChanges: string[];
  conversationFlowChanges: string[];
  latencyRegression: boolean;
  tokenUsageRegression: boolean;
  behaviorRegression: boolean;
}

// Golden trace management types
export interface GoldenTraceVersion {
  version: string;
  createdAt: string;
  datasetId: string;
  datasetName: string;
  traces: ExecutionTrace[];
  metadata: {
    author: string;
    commit: string;
    branch: string;
    reason?: string;
  };
}

// Production conversation import types
export interface ProductionConversation {
  id: string;
  userId: string;
  timestamp: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  metadata?: {
    sessionId?: string;
    capabilities?: string[];
    toolCalls?: string[];
    errors?: string[];
  };
}

export interface SanitizationConfig {
  removePII: boolean;
  removeEmails: boolean;
  removePhoneNumbers: boolean;
  removeAddresses: boolean;
  removeCreditCards: boolean;
  customPatterns?: Array<{
    name: string;
    pattern: RegExp;
    replacement: string;
  }>;
}

export interface ImportOptions {
  datasetId: string;
  datasetName: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: 'basic' | 'intermediate' | 'advanced';
  author: string;
  reason: string;
}

// Behavioral metrics types
export interface BehavioralMetrics {
  overall: {
    totalDatasets: number;
    totalGoldenTraces: number;
    successRate: number;
    healthScore: number;
  };
  planner: {
    accuracy: number;
    averageConfidence: number;
    topCapabilities: Array<{ capability: string; count: number }>;
  };
  tools: {
    correctness: number;
    averageCallsPerTurn: number;
    topTools: Array<{ tool: string; count: number }>;
  };
  memory: {
    correctness: number;
    averageOperationsPerTurn: number;
    retrievalRate: number;
    storageRate: number;
  };
  performance: {
    averageLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    averageTokenUsage: number;
  };
  regression: {
    lastRun: string;
    regressionCount: number;
    regressionRate: number;
    topRegressions: Array<{ datasetId: string; issues: string[] }>;
  };
  coverage: {
    capabilities: Array<{ capability: string; datasetCount: number }>;
    difficulties: Array<{ difficulty: string; datasetCount: number }>;
    categories: Array<{ category: string; datasetCount: number }>;
  };
}
