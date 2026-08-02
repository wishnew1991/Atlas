/**
 * Build a concrete ExecutionPlan from planner capabilities.
 *
 * Fixed scalable pipeline (steps skip at runtime when not applicable):
 * understand → classify_intent → detect_domain → retrieve_safety_memory
 * → retrieve_preference_memory → build_recommendation → select_tools
 * → invoke_tools → compose_reply
 */

import type { Capability, Plan } from "@/lib/atlas/planner/planner";
import type { ExecutionPlan, ExecutionStep, RetryPolicy } from "./types";

const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 2,
  backoffStrategy: "exponential",
  initialDelay: 400,
  maxDelay: 4000,
};

function step(
  id: string,
  description: string,
  capabilityName: string,
  dependencies: string[],
  parameters: Record<string, unknown> = {}
): ExecutionStep {
  return {
    id,
    description,
    capability: { id: capabilityName, name: capabilityName, type: "internal" },
    parameters,
    dependencies,
    retryPolicy: DEFAULT_RETRY,
    timeout: 60_000,
    status: "pending",
  };
}

/**
 * Intent-aware memory pipeline. Classification gates memory; domain detection
 * scopes which preference/safety memories and tools apply.
 */
export function buildExecutionPlan(input: {
  goal: string;
  planned: Plan;
  domain: string;
}): ExecutionPlan {
  const { planned, domain } = input;
  const capabilities = planned.capabilities.filter((cap) => cap !== "none");
  const mayNeedApproval = capabilities.some((cap) =>
    (["food", "travel", "shopping", "rides"] as Capability[]).includes(cap)
  );

  const steps: ExecutionStep[] = [
    step("understand", "Understand request and conversation state", "understand", [], {
      reason: planned.reason,
      isContinuation: planned.isContinuation,
    }),
    step(
      "classify_intent",
      "Classify intent (conversational / recommendation / execution / hybrid / ambiguous)",
      "classify_intent",
      ["understand"],
      {}
    ),
    step(
      "detect_domain",
      "Detect domain for memory, tools, and model routing",
      "detect_domain",
      ["classify_intent"],
      {}
    ),
    step(
      "retrieve_safety_memory",
      "Retrieve safety/constraint memories when needed",
      "retrieve_safety_memory",
      ["detect_domain"],
      { domain }
    ),
    step(
      "retrieve_preference_memory",
      "Retrieve domain-specific preference memories when recommending or hybrid",
      "retrieve_preference_memory",
      ["retrieve_safety_memory"],
      { domain }
    ),
    step(
      "build_recommendation",
      "Build structured recommendation briefing when applicable",
      "build_recommendation",
      ["retrieve_preference_memory"],
      { domain }
    ),
    step("select_tools", "Select tools for capabilities", "select_tools", ["build_recommendation"], {
      capabilities,
      domain,
    }),
    step("invoke_tools", "Invoke web search and tools as needed", "invoke_tools", ["select_tools"], {
      capabilities,
      domain,
    }),
    step("compose_reply", "Compose reply with reasoning", "compose_reply", ["invoke_tools"], {
      domain,
    }),
  ];

  if (mayNeedApproval) {
    steps.push(
      step(
        "request_approval",
        "Pause for user approval when an action is prepared",
        "request_approval",
        ["compose_reply"],
        { domain }
      )
    );
    steps.push(
      step(
        "fulfill_approval",
        "Continue the plan after the user approves",
        "fulfill_approval",
        ["request_approval"],
        { domain }
      )
    );
  }

  const nodes = new Map(steps.map((entry) => [entry.id, entry]));
  const edges = steps.flatMap((entry) =>
    entry.dependencies.map((from) => ({ from, to: entry.id, type: "requires" as const }))
  );

  return {
    steps,
    dependencies: { nodes, edges },
    resources: capabilities.map((cap) => ({ type: "mcp_server" as const, id: cap })),
  };
}

export function buildDemoExecutionPlan(goal: string): ExecutionPlan {
  const steps = [
    step("compose_reply", "Demo reply", "compose_reply", [], { demo: true, goal }),
  ];
  return {
    steps,
    dependencies: { nodes: new Map(steps.map((entry) => [entry.id, entry])), edges: [] },
    resources: [],
  };
}
