/**
 * Serialize / deserialize Execution domain objects for Prisma JSON string columns.
 */

import type {
  DependencyGraph,
  Execution,
  ExecutionMetadata,
  ExecutionPlan,
  ExecutionResult,
  ExecutionState,
  ExecutionStatus,
  ExecutionType,
} from "./types";

type StoredDependencyGraph = {
  nodes: Record<string, ExecutionPlan["steps"][number]>;
  edges: DependencyGraph["edges"];
};

export function serializePlan(plan: ExecutionPlan): string {
  const nodes: Record<string, ExecutionPlan["steps"][number]> = {};
  if (plan.dependencies?.nodes instanceof Map) {
    plan.dependencies.nodes.forEach((value, key) => {
      nodes[key] = value;
    });
  } else if (plan.dependencies?.nodes && typeof plan.dependencies.nodes === "object") {
    Object.assign(nodes, plan.dependencies.nodes as Record<string, ExecutionPlan["steps"][number]>);
  }

  return JSON.stringify({
    ...plan,
    dependencies: {
      nodes,
      edges: plan.dependencies?.edges ?? [],
    },
  });
}

export function deserializePlan(raw: string): ExecutionPlan {
  const parsed = safeParse(raw, {}) as Partial<ExecutionPlan> & {
    dependencies?: StoredDependencyGraph;
  };
  const nodes = new Map<string, ExecutionPlan["steps"][number]>();
  const storedNodes = parsed.dependencies?.nodes ?? {};
  for (const [key, value] of Object.entries(storedNodes)) {
    nodes.set(key, value as ExecutionPlan["steps"][number]);
  }

  return {
    steps: Array.isArray(parsed.steps) ? parsed.steps : [],
    dependencies: {
      nodes,
      edges: Array.isArray(parsed.dependencies?.edges) ? parsed.dependencies!.edges : [],
    },
    resources: Array.isArray(parsed.resources) ? parsed.resources : [],
    estimatedDuration: parsed.estimatedDuration,
    costEstimate: parsed.costEstimate,
  };
}

export function serializeState(state: ExecutionState): string {
  return JSON.stringify(state);
}

export function deserializeState(raw: string): ExecutionState {
  const parsed = safeParse(raw, {}) as Partial<ExecutionState>;
  return {
    variables: (parsed.variables as ExecutionState["variables"]) ?? {},
    context: (parsed.context as ExecutionState["context"]) ?? { environment: {} },
    approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
    progress: parsed.progress ?? { currentStep: 0, totalSteps: 0, percentage: 0 },
  };
}

export function serializeResults(results: ExecutionResult[]): string {
  return JSON.stringify(
    results.map((result) => ({
      ...result,
      timestamp: result.timestamp instanceof Date ? result.timestamp.toISOString() : result.timestamp,
    }))
  );
}

export function deserializeResults(raw: string): ExecutionResult[] {
  const parsed = safeParse(raw, []) as Array<Omit<ExecutionResult, "timestamp"> & { timestamp: string }>;
  if (!Array.isArray(parsed)) return [];
  return parsed.map((result) => ({
    ...result,
    timestamp: new Date(result.timestamp),
  }));
}

export function serializeMetadata(metadata: ExecutionMetadata): string {
  return JSON.stringify(metadata);
}

export function deserializeMetadata(raw: string): ExecutionMetadata {
  const parsed = safeParse(raw, {}) as Partial<ExecutionMetadata>;
  return {
    source: parsed.source ?? "chat",
    priority: parsed.priority ?? "normal",
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    correlationId: parsed.correlationId,
    parentExecutionId: parsed.parentExecutionId,
    childExecutionIds: parsed.childExecutionIds,
  };
}

export type ExecutionRow = {
  id: string;
  userId: string | null;
  goal: string;
  type: string;
  status: string;
  planJson: string;
  stateJson: string;
  resultsJson: string;
  metadataJson: string;
  conversationId: string | null;
  runId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export function rowToExecution(row: ExecutionRow): Execution {
  return {
    id: row.id,
    userId: row.userId ?? "atlas-demo-user",
    goal: row.goal,
    type: row.type as ExecutionType,
    status: row.status as ExecutionStatus,
    plan: deserializePlan(row.planJson),
    state: deserializeState(row.stateJson),
    results: deserializeResults(row.resultsJson),
    metadata: deserializeMetadata(row.metadataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
  };
}

function safeParse(raw: string, fallback: unknown): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
