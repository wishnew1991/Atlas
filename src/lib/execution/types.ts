/**
 * Execution Engine Core Types
 * Defines the data model for the execution-centric architecture
 */

// Execution types
export type ExecutionType = 
  | "immediate"        // Single-step, user-initiated
  | "workflow"        // Multi-step, defined sequence
  | "autonomous"      // Long-running, self-directed
  | "background"      // Offline, scheduled
  | "reactive";       // Event-driven, trigger-based

// Execution status
export type ExecutionStatus = 
  | "planning" 
  | "pending_approval" 
  | "executing" 
  | "observing" 
  | "reflecting" 
  | "completed" 
  | "failed" 
  | "cancelled"
  | "blocked";

// Step status
export type StepStatus = 
  | "pending" 
  | "in_progress" 
  | "completed" 
  | "failed" 
  | "skipped"
  | "blocked";

// Step outcome
export type StepOutcome = 
  | "success" 
  | "failure" 
  | "partial" 
  | "timeout" 
  | "cancelled";

// Main Execution interface
export interface Execution {
  id: string;
  userId: string;
  goal: string;
  type: ExecutionType;
  status: ExecutionStatus;
  plan: ExecutionPlan;
  state: ExecutionState;
  results: ExecutionResult[];
  metadata: ExecutionMetadata;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Execution plan
export interface ExecutionPlan {
  steps: ExecutionStep[];
  dependencies: DependencyGraph;
  resources: ResourceRequirement[];
  estimatedDuration?: number; // in milliseconds
  costEstimate?: CostEstimate;
}

// Execution step
export interface ExecutionStep {
  id: string;
  description: string;
  capability: CapabilityReference;
  skill?: SkillReference;
  parameters: Record<string, unknown>;
  dependencies: string[]; // step IDs
  retryPolicy: RetryPolicy;
  timeout: number; // in milliseconds
  status: StepStatus;
  result?: StepResult;
  startedAt?: Date;
  completedAt?: Date;
}

// Capability reference
export interface CapabilityReference {
  id: string;
  name: string;
  type: string;
  version?: string;
}

// Skill reference
export interface SkillReference {
  id: string;
  name: string;
  category: string;
}

// Dependency graph
export interface DependencyGraph {
  nodes: Map<string, ExecutionStep>;
  edges: Array<{
    from: string; // step ID
    to: string;   // step ID
    type: 'requires' | 'enhances' | 'conflicts';
  }>;
}

// Resource requirement
export interface ResourceRequirement {
  type: 'mcp_server' | 'api' | 'database' | 'compute';
  id: string;
  amount?: number;
  constraints?: Record<string, unknown>;
}

// Cost estimate
export interface CostEstimate {
  estimatedCost: number;
  currency: string;
  breakdown: Record<string, number>;
}

// Retry policy
export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'exponential' | 'linear' | 'fixed';
  initialDelay: number; // in milliseconds
  maxDelay: number; // in milliseconds
}

// Execution state
export interface ExecutionState {
  variables: StateVariables;
  context: ExecutionContext;
  approvals: ApprovalReference[];
  progress: ProgressIndicator;
}

// State variables
export interface StateVariables {
  [key: string]: unknown;
}

// Execution context
export interface ExecutionContext {
  conversationId?: string;
  messageId?: string;
  previousExecutions?: string[]; // execution IDs
  userPreferences?: Record<string, unknown>;
  environment: Record<string, unknown>;
}

// Approval reference
export interface ApprovalReference {
  id: string;
  type: string;
  status: 'pending' | 'granted' | 'denied';
  requiredFor: string; // step ID
}

// Progress indicator
export interface ProgressIndicator {
  currentStep: number;
  totalSteps: number;
  percentage: number;
  estimatedRemaining?: number; // in milliseconds
}

// Execution result
export interface ExecutionResult {
  stepId: string;
  outcome: StepOutcome;
  data: unknown;
  artifacts: Artifact[];
  metrics: ExecutionMetrics;
  timestamp: Date;
}

// Step result
export interface StepResult {
  outcome: StepOutcome;
  data: unknown;
  error?: Error;
  duration: number; // in milliseconds
  retryCount: number;
}

// Artifact
export interface Artifact {
  id: string;
  type: 'data' | 'file' | 'reference' | 'log';
  content: unknown;
  metadata?: Record<string, unknown>;
}

// Execution metrics
export interface ExecutionMetrics {
  duration: number; // in milliseconds
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  cost?: number;
  success: boolean;
}

// Execution metadata
export interface ExecutionMetadata {
  source: 'chat' | 'trigger' | 'api' | 'scheduled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  tags: string[];
  correlationId?: string;
  parentExecutionId?: string;
  childExecutionIds?: string[];
}

// Execution request
export interface ExecutionRequest {
  goal: string;
  type?: ExecutionType;
  context?: ExecutionContext;
  constraints?: ExecutionConstraints;
  preferences?: UserPreferences;
}

// Execution constraints
export interface ExecutionConstraints {
  maxDuration?: number; // in milliseconds
  maxCost?: number;
  allowedCapabilities?: string[];
  forbiddenCapabilities?: string[];
  requiresApproval?: boolean;
  deadline?: Date;
}

// User preferences
export interface UserPreferences {
  preferredCapabilities?: string[];
  costSensitivity?: 'low' | 'medium' | 'high';
  speedPreference?: 'fast' | 'balanced' | 'thorough';
  approvalMode?: 'always' | 'high_risk' | 'never';
}

// Execution response
export interface ExecutionResponse {
  executionId: string;
  status: ExecutionStatus;
  plan?: ExecutionPlan;
  result?: ExecutionResult;
  approvalRequired?: boolean;
  approvalId?: string;
  message?: string;
  error?: string;
}

// Lightweight execution for existing chat compatibility
export interface ChatExecution {
  id: string;
  userId: string;
  goal: string;
  status: ExecutionStatus;
  currentStep?: string;
  result?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Transform existing chat history to execution context
export interface ChatToExecutionContext {
  conversationId?: string;
  message: string;
  history: Array<{ role: string; text: string }>;
  userId: string;
  capabilities: Record<string, unknown>;
}
