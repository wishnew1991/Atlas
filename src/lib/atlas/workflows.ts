export type AtlasTaskStateId =
  | "request"
  | "clarify"
  | "search"
  | "compare"
  | "approve"
  | "execute"
  | "track";

export type AtlasTaskState = {
  id: AtlasTaskStateId;
  title: string;
  summary: string;
};

export const atlasTaskStates: AtlasTaskState[] = [
  {
    id: "request",
    title: "Request",
    summary: "The user expresses intent in natural language.",
  },
  {
    id: "clarify",
    title: "Clarify",
    summary: "Atlas asks only for the missing details that matter.",
  },
  {
    id: "search",
    title: "Search",
    summary: "Atlas checks multiple providers and availability.",
  },
  {
    id: "compare",
    title: "Compare",
    summary: "Atlas ranks the best options and explains the tradeoffs.",
  },
  {
    id: "approve",
    title: "Approve",
    summary: "Atlas waits for explicit permission before committing.",
  },
  {
    id: "execute",
    title: "Execute",
    summary: "Atlas completes the booking, purchase, or reservation.",
  },
  {
    id: "track",
    title: "Track",
    summary: "Atlas maintains status, receipts, and follow-up updates.",
  },
];

