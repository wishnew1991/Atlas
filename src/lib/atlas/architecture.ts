export type AtlasArchitectureLayer = {
  title: string;
  summary: string;
  items: string[];
};

export const atlasArchitectureLayers: AtlasArchitectureLayer[] = [
  {
    title: "Experience layer",
    summary: "What the user sees and touches.",
    items: [
      "Conversation",
      "Quick actions",
      "Recommendation cards",
      "Approval screens",
      "Task center",
      "Activity timeline",
      "Profile and memory",
    ],
  },
  {
    title: "Orchestration layer",
    summary: "How Atlas turns intent into coordinated work.",
    items: [
      "Intent understanding",
      "Clarification flow",
      "Provider search",
      "Comparison engine",
      "Approval gate",
      "Task tracking",
      "Notification routing",
    ],
  },
  {
    title: "Service layer",
    summary: "The real-world categories Atlas can coordinate.",
    items: [
      "Flights",
      "Hotels",
      "Food",
      "Rides",
      "Shopping",
      "Appointments",
      "Payments",
    ],
  },
  {
    title: "Trust layer",
    summary: "The controls that keep Atlas safe and transparent.",
    items: [
      "Explicit approvals",
      "Wallet controls",
      "Permission management",
      "Editable memory",
      "Revocable access",
      "Receipts and audit history",
    ],
  },
];

export const atlasControlLoop = [
  "User expresses intent",
  "Atlas clarifies when needed",
  "Atlas coordinates services",
  "Atlas requests approval",
  "Atlas completes the task",
  "Atlas tracks the outcome",
];

