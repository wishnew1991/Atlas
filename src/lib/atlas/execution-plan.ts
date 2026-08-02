import type { AtlasDomain } from "./mcp-registry";

export type AtlasExecutionStageId =
  | "intent"
  | "clarify"
  | "discover"
  | "compare"
  | "approve"
  | "execute"
  | "track";

export interface AtlasExecutionStage {
  id: AtlasExecutionStageId;
  title: string;
  summary: string;
}

export interface AtlasExecutionPlan {
  domain: AtlasDomain;
  stages: AtlasExecutionStage[];
  primaryProviderIds: string[];
  fallbackProviderIds: string[];
  approvalGate: "mandatory" | "conditional";
  readiness: "ready" | "partial" | "planned";
  coverageNote: string;
}

export const atlasExecutionStages: AtlasExecutionStage[] = [
  {
    id: "intent",
    title: "Intent",
    summary: "User describes the outcome in one sentence.",
  },
  {
    id: "clarify",
    title: "Clarify",
    summary: "Atlas asks only for missing details that change the outcome.",
  },
  {
    id: "discover",
    title: "Discover",
    summary: "Atlas finds candidate providers, products, or slots.",
  },
  {
    id: "compare",
    title: "Compare",
    summary: "Atlas ranks tradeoffs and prepares recommendations.",
  },
  {
    id: "approve",
    title: "Approve",
    summary: "Atlas waits for permission before any commitment.",
  },
  {
    id: "execute",
    title: "Execute",
    summary: "Atlas finalizes the order, booking, or payment.",
  },
  {
    id: "track",
    title: "Track",
    summary: "Atlas stores the record and maintains follow-up status.",
  },
];

export const atlasExecutionPlans: AtlasExecutionPlan[] = [
  {
    domain: "shopping",
    stages: atlasExecutionStages,
    primaryProviderIds: ["agora-mcp", "commerce-mcp"],
    fallbackProviderIds: ["vibe-shopping", "fewsats-mcp"],
    approvalGate: "mandatory",
    readiness: "ready",
    coverageNote: "Search, compare, approval, and purchase are covered with MCP-backed providers.",
  },
  {
    domain: "travel",
    stages: atlasExecutionStages,
    primaryProviderIds: ["travel-concierge"],
    fallbackProviderIds: ["fewsats-mcp"],
    approvalGate: "mandatory",
    readiness: "partial",
    coverageNote: "Discovery and some booking paths are covered; some flows still hand off to booking links.",
  },
  {
    domain: "food",
    stages: atlasExecutionStages,
    primaryProviderIds: ["travel-concierge"],
    fallbackProviderIds: ["fewsats-mcp"],
    approvalGate: "mandatory",
    readiness: "partial",
    coverageNote: "Restaurant discovery is covered; direct delivery checkout still needs a dedicated provider.",
  },
  {
    domain: "rides",
    stages: atlasExecutionStages,
    primaryProviderIds: ["travel-concierge"],
    fallbackProviderIds: ["fewsats-mcp"],
    approvalGate: "mandatory",
    readiness: "partial",
    coverageNote: "Transfer booking is covered; ride-hailing integrations may be added later.",
  },
  {
    domain: "appointments",
    stages: atlasExecutionStages,
    primaryProviderIds: ["travel-concierge"],
    fallbackProviderIds: [],
    approvalGate: "mandatory",
    readiness: "planned",
    coverageNote: "Appointment scheduling is architected but still needs a dedicated scheduling MCP.",
  },
  {
    domain: "payments",
    stages: atlasExecutionStages,
    primaryProviderIds: ["fewsats-mcp"],
    fallbackProviderIds: [],
    approvalGate: "mandatory",
    readiness: "ready",
    coverageNote: "Wallet, approval, and payment settlement are directly supported by Fewsats.",
  },
];
