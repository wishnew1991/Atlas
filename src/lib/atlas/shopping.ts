export type ShoppingFlowStage =
  | "idle"
  | "searching"
  | "review"
  | "approval"
  | "executing"
  | "complete";

export interface ShoppingRecommendation {
  id: string;
  title: string;
  brand: string;
  price: number;
  rating: number;
  delivery: string;
  badge: string;
  reason: string;
  provider: string;
  policy: string;
}

export interface ShoppingTaskEvent {
  time: string;
  title: string;
  body: string;
}

export const shoppingIntent = "Buy me a gaming laptop under $1800.";

export const shoppingProgressSteps = [
  "Searching Agora MCP",
  "Checking Commerce MCP",
  "Ranking options",
  "Preparing recommendation",
  "Waiting for approval",
];

export const shoppingRecommendations: ShoppingRecommendation[] = [
  {
    id: "zephyrus-g14",
    title: "ROG Zephyrus G14",
    brand: "ASUS",
    price: 1599,
    rating: 4.8,
    delivery: "Arrives in 2 days",
    badge: "Best overall",
    reason: "Balanced performance, portability, and battery life.",
    provider: "Agora MCP",
    policy: "Free returns within 30 days",
  },
  {
    id: "blade-16",
    title: "Razer Blade 16",
    brand: "Razer",
    price: 1799,
    rating: 4.7,
    delivery: "Arrives in 3 days",
    badge: "Best performance",
    reason: "Highest-end GPU option inside the budget.",
    provider: "Commerce MCP",
    policy: "Return window depends on merchant",
  },
  {
    id: "legion-pro-5",
    title: "Legion Pro 5",
    brand: "Lenovo",
    price: 1399,
    rating: 4.6,
    delivery: "Arrives in 4 days",
    badge: "Best value",
    reason: "Strong performance with a lower total spend.",
    provider: "Agora MCP",
    policy: "Standard return policy",
  },
];

export const shoppingTaskEvents: ShoppingTaskEvent[] = [
  {
    time: "Now",
    title: "Atlas is comparing providers",
    body: "Search results from Agora MCP and Commerce MCP are being ranked.",
  },
  {
    time: "Next",
    title: "Atlas asks for approval",
    body: "The selected laptop, taxes, shipping, and payment method are shown clearly.",
  },
  {
    time: "After approval",
    title: "Fewsats settles payment",
    body: "The purchase is executed only after the user confirms the final amount.",
  },
  {
    time: "Completed",
    title: "Task is stored in Activity",
    body: "Receipt, shipping status, and follow-up tracking stay visible.",
  },
];

export const shoppingProviderFlow = [
  {
    id: "agora-mcp",
    title: "Agora MCP",
    body: "Product search, comparison, cart and buy flow.",
  },
  {
    id: "commerce-mcp",
    title: "Commerce MCP",
    body: "RAG product search and deal discovery.",
  },
  {
    id: "vibe-shopping",
    title: "Vibe Shopping",
    body: "Visual shopping and try-on layer.",
  },
  {
    id: "fewsats-mcp",
    title: "Fewsats MCP",
    body: "Wallet, payment methods, and secure settlement.",
  },
];

