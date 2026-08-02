export type AtlasDomain =
  | "shopping"
  | "travel"
  | "food"
  | "rides"
  | "appointments"
  | "payments";

export type AtlasExecutionReadiness = "ready" | "partial" | "planned";

export type AtlasApprovalTrigger =
  | "never"
  | "before_spend"
  | "before_booking"
  | "before_external_handoff";

export interface AtlasMcpProvider {
  id: string;
  name: string;
  source: string;
  domain: AtlasDomain;
  readiness: AtlasExecutionReadiness;
  role: string;
  approvalTrigger: AtlasApprovalTrigger;
  capabilities: string[];
  notes: string[];
}

export const atlasMcpProviders: AtlasMcpProvider[] = [
  {
    id: "agora-mcp",
    name: "Agora MCP",
    source: "PyPI / MCP server",
    domain: "shopping",
    readiness: "ready",
    role: "Product search and purchase execution",
    approvalTrigger: "before_spend",
    capabilities: [
      "Search across stores",
      "Compare products",
      "Manage cart and checkout",
      "Support buy flows",
    ],
    notes: [
      "Best fit for Atlas shopping discovery.",
      "Pairs with Fewsats for payment execution.",
    ],
  },
  {
    id: "fewsats-mcp",
    name: "Fewsats MCP",
    source: "PyPI / payment MCP",
    domain: "payments",
    readiness: "ready",
    role: "Wallet and secure purchase settlement",
    approvalTrigger: "before_spend",
    capabilities: ["Balance", "Payment methods", "Pay offer", "Payment info"],
    notes: [
      "Use this as the final payment gate.",
      "Atlas should never pay without explicit confirmation.",
    ],
  },
  {
    id: "commerce-mcp",
    name: "Commerce MCP",
    source: "Hugging Face Space",
    domain: "shopping",
    readiness: "partial",
    role: "RAG product search and deal finding",
    approvalTrigger: "before_spend",
    capabilities: [
      "Search products",
      "Surface deals",
      "Rank options",
      "Support comparison",
    ],
    notes: [
      "Useful for shopping discovery before checkout.",
      "Pairs naturally with Agora and Fewsats.",
    ],
  },
  {
    id: "travel-concierge",
    name: "AI Travel Concierge",
    source: "Hugging Face Space",
    domain: "travel",
    readiness: "partial",
    role: "Flights, hotels, dining, activities, transport, weather",
    approvalTrigger: "before_booking",
    capabilities: [
      "Weather forecasting",
      "Flight search",
      "Hotel search",
      "Dining recommendations",
      "Transport booking",
      "Activity discovery",
    ],
    notes: [
      "Strongest travel orchestration layer discovered so far.",
      "Some flows surface booking links rather than full native checkout.",
    ],
  },
  {
    id: "vibe-shopping",
    name: "Vibe Shopping",
    source: "Hugging Face Space",
    domain: "shopping",
    readiness: "partial",
    role: "Visual shopping and try-on",
    approvalTrigger: "before_spend",
    capabilities: [
      "Product discovery",
      "Virtual try-on",
      "Image-based comparison",
      "Purchase handoff",
    ],
    notes: [
      "Best used as the visual layer for shopping decisions.",
      "Not the payment authority; pair with Fewsats.",
    ],
  },
];

export const atlasDomainPriority: AtlasDomain[] = [
  "shopping",
  "travel",
  "food",
  "rides",
  "appointments",
  "payments",
];

