# Atlas Execution Engine Architecture

## Executive Summary

Atlas is redesigned as an **intelligent execution engine** where chat is merely the interface, not the core. Every user request becomes an execution with full lifecycle management: goal → plan → execute → observe → reflect → learn. This architecture positions Atlas to compete with future autonomous assistants rather than today's chatbots.

## Core Architectural Principle

**Current Paradigm:** Chatbot with tools attached
**New Paradigm:** Execution engine with chat interface

```
┌─────────────────────────────────────────────────────────────────┐
│                        EXECUTION ENGINE                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Planner    │→ │  Executor    │→ │  Observer    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         ↓                 ↓                 ↓                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Memory     │  │ Capability   │  │   Skills     │          │
│  │   System     │  │    Graph     │  │  Orchestration│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         ↓                 ↓                 ↓                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Wake-up      │  │ Background   │  │  Approval    │          │
│  │ Engine       │  │ Execution    │  │   Queue      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌──────────────────┐
                    │  Chat Interface  │
                    │  (One of Many)   │
                    └──────────────────┘
```

## Component Architecture

### 1. Execution Engine Core

#### 1.1 Execution Model
```typescript
interface Execution {
  id: string;
  userId: string;
  goal: string;
  type: ExecutionType;
  status: ExecutionStatus;
  plan: ExecutionPlan;
  state: ExecutionState;
  results: ExecutionResult[];
  metadata: ExecutionMetadata;
  createdAt: DateTime;
  updatedAt: DateTime;
  completedAt?: DateTime;
}

type ExecutionType = 
  | "immediate"        // Single-step, user-initiated
  | "workflow"        // Multi-step, defined sequence
  | "autonomous"      // Long-running, self-directed
  | "background"      // Offline, scheduled
  | "reactive"        // Event-driven, trigger-based

type ExecutionStatus = 
  | "planning" 
  | "pending_approval" 
  | "executing" 
  | "observing" 
  | "reflecting" 
  | "completed" 
  | "failed" 
  | "cancelled"
  | "blocked"

interface ExecutionPlan {
  steps: ExecutionStep[];
  dependencies: DependencyGraph;
  resources: ResourceRequirement[];
  estimatedDuration?: Duration;
  costEstimate?: CostEstimate;
}

interface ExecutionStep {
  id: string;
  description: string;
  capability: CapabilityReference;
  skill?: SkillReference;
  parameters: Record<string, unknown>;
  dependencies: string[]; // step IDs
  retryPolicy: RetryPolicy;
  timeout: Duration;
  status: StepStatus;
  result?: StepResult;
  startedAt?: DateTime;
  completedAt?: DateTime;
}

interface ExecutionState {
  variables: StateVariables;
  context: ExecutionContext;
  approvals: ApprovalReference[];
  progress: ProgressIndicator;
}

interface ExecutionResult {
  stepId: string;
  outcome: StepOutcome;
  data: unknown;
  artifacts: Artifact[];
  metrics: ExecutionMetrics;
}
```

#### 1.2 Execution Lifecycle
```
USER REQUEST → CREATE EXECUTION → PLANNING → APPROVAL → EXECUTION → OBSERVATION → REFLECTION → COMPLETION
                   ↓                   ↓           ↓           ↓            ↓             ↓              ↓
              Intent Analysis    Plan Gen   User OK    Step Exec   Result Capt   Learning     Archive
              Goal Formation     Dep Res    Queue Mgmt  Retry Log  Success Det   Pref Update  Notify
              Context Gather    Cost Est   Cross-Dev  Progress   Fail Detect   Pattern Rec  Cleanup
```

### 2. Layered Memory Architecture

#### 2.1 Memory Layers
```typescript
interface MemorySystem {
  // Working Memory - Current execution context
  working: WorkingMemory;
  
  // Conversation Memory - Current chat context
  conversation: ConversationMemory;
  
  // Long-Term Memory - Persistent user knowledge
  longTerm: LongTermMemory;
  
  // Knowledge - External information and tool knowledge
  knowledge: KnowledgeBase;
}

interface WorkingMemory {
  executionId: string;
  currentStep: string;
  activeVariables: Map<string, unknown>;
  pendingApprovals: Approval[];
  temporaryContext: Map<string, unknown>;
  ttl: Duration; // Short-lived, execution-scoped
}

interface ConversationMemory {
  conversationId: string;
  messages: Message[];
  contextSummary: string;
  extractedEntities: Entity[];
  currentCapabilities: Capability[];
  intentHistory: Intent[];
  ttl: Duration; // Medium-lived, conversation-scoped
}

interface LongTermMemory {
  userId: string;
  preferences: Preference[];
  habits: Pattern[];
  relationships: Relationship[];
  identity: UserIdentity;
  semanticMemories: SemanticMemory[];
  confidenceScores: Map<string, number>;
  temporalDecay: Map<string, number>;
}

interface KnowledgeBase {
  capabilityKnowledge: CapabilityKnowledge[];
  worldKnowledge: WorldKnowledge[];
  proceduralKnowledge: ProceduralKnowledge[];
  temporalKnowledge: TemporalKnowledge[];
}
```

#### 2.2 Memory Operations
```typescript
interface MemoryOperations {
  // Semantic Retrieval
  semanticSearch(query: string, context: ExecutionContext): Promise<MemoryResult[]>;
  contextualInjection(executionId: string): Promise<MemoryContext>;
  
  // Preference Learning
  learnPreference(execution: Execution, outcome: ExecutionResult): Promise<void>;
  updatePreference(preferenceId: string, delta: number): Promise<void>;
  detectConflicts(userId: string): Promise<Conflict[]>;
  resolveConflict(conflictId: string, resolution: Resolution): Promise<void>;
  
  // Pattern Recognition
  detectPatterns(userId: string, timeWindow: Duration): Promise<Pattern[]>;
  extractHabit(executionHistory: Execution[]): Promise<Habit>;
  
  // Temporal Management
  decayMemories(userId: string): Promise<void>;
  boostImportance(memoryId: string, factor: number): Promise<void>;
  expireMemories(userId: string): Promise<void>;
  
  // Privacy Controls
  redactPII(text: string): string;
  applyRetentionPolicy(userId: string): Promise<void>;
  exportUserData(userId: string): Promise<UserDataExport>;
  deleteUserData(userId: string): Promise<void>;
}
```

### 3. Intelligent Planner

#### 3.1 Planner Architecture
```typescript
interface IntelligentPlanner {
  // Planning Pipeline
  plan(request: ExecutionRequest): Promise<ExecutionPlan>;
  
  // Planning Stages
  understandIntent(request: ExecutionRequest): Promise<Intent>;
  formulateGoal(intent: Intent, context: ExecutionContext): Promise<Goal>;
  generatePlan(goal: Goal, constraints: Constraints): Promise<ExecutionPlan>;
  verifyPlan(plan: ExecutionPlan): Promise<VerificationResult>;
  estimateResources(plan: ExecutionPlan): Promise<ResourceEstimate>;
  
  // Learning Pipeline
  observeExecution(execution: Execution): Promise<Observation>;
  reflectOnOutcome(execution: Execution, outcome: ExecutionResult): Promise<Reflection>;
  learnFromReflection(reflection: Reflection): Promise<LearningUpdate>;
  
  // Continuous Improvement
  updatePlanningStrategies(feedback: Feedback): Promise<void>;
  optimizePlan(plan: ExecutionPlan, preferences: UserPreferences): Promise<OptimizedPlan>;
}
```

### 4. Capability Graph

#### 4.1 Graph Structure
```typescript
interface CapabilityGraph {
  nodes: Map<string, CapabilityNode>;
  edges: Map<string, CapabilityEdge>;
  index: CapabilityIndex;
}

interface CapabilityNode {
  id: string;
  name: string;
  type: CapabilityType;
  version: string;
  
  // Health & Performance
  health: HealthStatus;
  latency: LatencyMetrics;
  reliability: ReliabilityMetrics;
  cost: CostMetrics;
  
  // Access & Security
  permissions: Permission[];
  authentication: AuthRequirement;
  rateLimits: RateLimit[];
  
  // Functionality
  inputs: SchemaDefinition;
  outputs: SchemaDefinition;
  sideEffects: SideEffect[];
  
  // Relationships
  dependencies: string[]; // capability IDs
  compositions: string[]; // capability IDs
  alternatives: string[]; // capability IDs
  
  // Knowledge
  documentation: string;
  examples: Example[];
  bestPractices: BestPractice[];
}
```

### 5. Skills Orchestration

#### 5.1 Skill Architecture
```typescript
interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  
  // Skill Composition
  capabilities: string[]; // capability IDs
  subSkills: string[]; // skill IDs
  
  // Skill Logic
  orchestration: OrchestrationLogic;
  fallbackStrategies: FallbackStrategy[];
  
  // Skill Knowledge
  bestPractices: BestPractice[];
  commonPatterns: Pattern[];
  edgeCases: EdgeCase[];
  
  // Performance
  averageDuration: Duration;
  successRate: number;
  costPerExecution: Cost;
}
```

### 6. Wake-up Engine

#### 6.1 Wake-up Architecture
```typescript
interface WakeUpEngine {
  // Trigger Management
  registerTrigger(trigger: Trigger): Promise<void>;
  unregisterTrigger(triggerId: string): Promise<void>;
  evaluateTriggers(): Promise<TriggerEvaluation[]>;
  
  // Rule Engine (LLM-free)
  evaluateRules(context: TriggerContext): Promise<RuleResult[]>;
  
  // Capability/API Check (LLM-free)
  checkCapabilityStatus(capabilityId: string): Promise<CapabilityStatus>;
  checkAPICondition(condition: APICondition): Promise<boolean>;
  
  // LLM Invocation (Last Resort)
  invokePlannerWhenNecessary(context: TriggerContext): Promise<void>;
}
```

### 7. Background Execution System

#### 7.1 Background Architecture
```typescript
interface BackgroundExecutionSystem {
  // Job Management
  scheduleJob(job: BackgroundJob): Promise<void>;
  cancelJob(jobId: string): Promise<void>;
  pauseJob(jobId: string): Promise<void>;
  resumeJob(jobId: string): Promise<void>;
  
  // Execution Management
  executeJob(job: BackgroundJob): Promise<JobResult>;
  retryJob(jobId: string): Promise<void>;
  handleJobFailure(jobId: string, error: Error): Promise<void>;
  
  // Queue Management
  enqueueJob(job: BackgroundJob): Promise<void>;
  dequeueJob(): Promise<BackgroundJob>;
  getQueueStatus(): Promise<QueueStatus>;
  
  // Dead Letter Queue
  moveToDeadLetter(jobId: string, reason: string): Promise<void>;
  inspectDeadLetter(): Promise<BackgroundJob[]>;
  retryDeadLetter(jobId: string): Promise<void>;
  
  // Resumable Execution
  checkpointExecution(jobId: string, state: ExecutionState): Promise<void>;
  restoreExecution(jobId: string): Promise<ExecutionState>;
}
```

### 8. Persistent Approval Queue

#### 8.1 Approval Architecture
```typescript
interface ApprovalQueue {
  // Approval Management
  createApproval(execution: Execution): Promise<Approval>;
  requestApproval(approvalId: string): Promise<void>;
  grantApproval(approvalId: string, userId: string): Promise<void>;
  denyApproval(approvalId: string, userId: string, reason: string): Promise<void>;
  modifyApproval(approvalId: string, modifications: Modification): Promise<void>;
  
  // Cross-Device Sync
  syncApprovals(userId: string): Promise<Approval[]>;
  getApprovalStatus(approvalId: string): Promise<ApprovalStatus>;
  
  // Queue Management
  getPendingApprovals(userId: string): Promise<Approval[]>;
  getApprovalHistory(userId: string): Promise<Approval[]>;
  expireApproval(approvalId: string): Promise<void>;
  
  // Recovery
  restoreApprovals(userId: string): Promise<Approval[]>;
  handleRestartRecovery(): Promise<void>;
}
```

## Implementation Roadmap

### Phase 0: Foundation (Weeks 1-2)
**Goal:** Production-ready infrastructure

1. **Database Migration**
   - Migrate from SQLite to PostgreSQL
   - Add pgvector extension
   - Implement connection pooling
   - Data migration scripts

2. **Background Job System**
   - Implement BullMQ for job processing
   - Create job queues and workers
   - Implement retry logic
   - Add dead letter queue

3. **Security Foundation**
   - Rate limiting implementation
   - PII detection system
   - Input validation framework
   - Audit logging

### Phase 1: Execution Engine Core (Weeks 3-6)
**Goal:** Replace chat loop with execution engine

1. **Week 3-4: Execution Model**
   - Implement Execution data structures
   - Create Execution lifecycle management
   - Build Execution state machine
   - Implement execution persistence

2. **Week 5-6: Planner Enhancement**
   - Enhance intent understanding
   - Implement goal formation
   - Build plan generation
   - Add plan verification
   - Implement reflection pipeline

### Phase 2: Memory System (Weeks 7-10)
**Goal:** Layered memory with semantic capabilities

1. **Week 7-8: Memory Architecture**
   - Implement working memory
   - Build conversation memory
   - Create long-term memory structure
   - Integrate pgvector for semantic search

2. **Week 9-10: Memory Operations**
   - Semantic search implementation
   - Preference learning system
   - Pattern recognition
   - Conflict detection/resolution
   - Temporal decay and importance scoring

### Phase 3: Capability Graph (Weeks 11-13)
**Goal:** Dynamic capability discovery and composition

1. **Week 11-12: Graph Structure**
   - Implement capability node structure
   - Build capability edges
   - Create graph indexing
   - Implement graph traversal

2. **Week 13: Capability Operations**
   - Health monitoring
   - Cost optimization
   - Composition validation
   - Alternative discovery

### Phase 4: Skills Orchestration (Weeks 14-16)
**Goal:** High-level skill composition

1. **Week 14-15: Skill System**
   - Implement skill structure
   - Build orchestration logic
   - Create skill templates
   - Add fallback strategies

2. **Week 16: Skill Library**
   - Travel planning skill
   - Expense management skill
   - Meeting coordination skill
   - Shopping skill
   - Research skill

### Phase 5: Wake-up Engine (Weeks 17-19)
**Goal:** Proactive assistance with minimal LLM usage

1. **Week 17-18: Trigger System**
   - Implement trigger types
   - Build rule engine
   - Create API check system
   - Add webhook support

2. **Week 19: Wake-up Optimization**
   - Implement LLM-free evaluation
   - Add capability status checks
   - Optimize for <5% LLM invocation
   - Performance monitoring

### Phase 6: Background Execution (Weeks 20-22)
**Goal:** Offline execution capabilities

1. **Week 20-21: Job System**
   - Implement job scheduling
   - Build checkpoint system
   - Add resumable execution
   - Create notification system

2. **Week 22: Job Orchestration**
   - Polling jobs
   - Scheduled jobs
   - Event handlers
   - Long-running jobs

### Phase 7: Approval Queue (Weeks 23-24)
**Goal:** Cross-device approval management

1. **Week 23: Approval System**
   - Implement approval queue
   - Build approval lifecycle
   - Add modification support
   - Create expiry system

2. **Week 24: Cross-Device Sync**
   - Implement device sync
   - Add multi-device support
   - Build recovery system
   - Create notification system

### Phase 8: Production Hardening (Weeks 25-28)
**Goal:** Production-ready reliability

1. **Week 25-26: Observability**
   - Enhanced structured logging
   - Execution metrics
   - Memory system analytics
   - Capability health monitoring

2. **Week 27-28: Reliability**
   - Circuit breakers
   - Graceful degradation
   - Cost monitoring
   - Performance optimization

### Phase 9: UI Integration (Weeks 29-32)
**Goal:** Execution-focused UI

1. **Week 29-30: Execution UI**
   - Execution timeline
   - Plan visualization
   - Progress tracking
   - Result display

2. **Week 31-32: Memory UI**
   - Memory visualization
   - Preference management
   - Pattern display
   - Conflict resolution UI

## Scalability Strategy

### Horizontal Scaling
```
┌─────────────────────────────────────────────────────────────────┐
│                    LOAD BALANCER                                 │
└─────────────────────────────────────────────────────────────────┘
        ↓                    ↓                    ↓
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Atlas Node 1 │    │  Atlas Node 2 │    │  Atlas Node N │
│  - Planner    │    │  - Planner    │    │  - Planner    │
│  - Executor   │    │  - Executor   │    │  - Executor   │
│  - Observer   │    │  - Observer   │    │  - Observer   │
└──────────────┘    └──────────────┘    └──────────────┘
        ↓                    ↓                    ↓
┌─────────────────────────────────────────────────────────────────┐
│                    SHARED POSTGRESQL                              │
│  - Execution Store                                              │
│  - Memory Store                                                 │
│  - Capability Graph                                             │
│  - Approval Queue                                                │
└─────────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────────┐
│                    REDIS (Optional)                              │
│  - Job Queues                                                   │
│  - Temporary Cache                                              │
│  - Session Store                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Conclusion

This architecture transforms Atlas from a chatbot with tools into an intelligent execution engine. The key differentiators are:

1. **Execution-First Design** - Every request becomes an execution with full lifecycle
2. **Layered Memory** - Working, conversation, long-term, and knowledge layers
3. **Intelligent Planning** - Intent understanding, planning, execution, observation, reflection
4. **Capability Graph** - Dynamic capability discovery and composition
5. **Skills Orchestration** - High-level skill composition over raw tools
6. **Wake-up Engine** - Proactive assistance with minimal LLM usage
7. **Background Execution** - Offline, resumable, reliable execution
8. **Persistent Approvals** - Cross-device approval management

This architecture positions Atlas to compete with future autonomous assistants rather than today's chatbots, with a focus on long-term scalability, autonomy, and production readiness.
