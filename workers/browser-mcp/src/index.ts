import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  swiggyLoginHandoff,
  swiggySearch,
  swiggyAddToCart,
  swiggyCheckout,
  swiggyStatus,
} from "./swiggy.js";

const server = new Server(
  {
    name: "atlas-browser-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
const SWIGGY_TOOLS: Tool[] = [
  {
    name: "swiggy_login_handoff",
    description: "Initialize Swiggy login flow and return a QR code/link for user handoff.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string" },
      },
      required: ["userId"],
    },
  },
  {
    name: "swiggy_search",
    description: "Search for a restaurant or food item on Swiggy.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "swiggy_add_to_cart",
    description: "Add a specific item to the Swiggy cart.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        quantity: { type: "number" },
      },
      required: ["itemId", "quantity"],
    },
  },
  {
    name: "swiggy_checkout",
    description: "Proceed to checkout and generate payment intent/UPI link.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "swiggy_status",
    description: "Check the status of an ongoing Swiggy order.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string" },
      },
      required: ["orderId"],
    },
  },
];

const ZOMATO_TOOLS: Tool[] = [
  {
    name: "zomato_search",
    description: "Search for a restaurant or food item on Zomato.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
];

const BMS_TOOLS: Tool[] = [
  {
    name: "bms_search",
    description: "Search for movies or events on BookMyShow.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
];

const MMT_TOOLS: Tool[] = [
  {
    name: "mmt_search",
    description: "Search for flights or hotels on MakeMyTrip.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [...SWIGGY_TOOLS, ...ZOMATO_TOOLS, ...BMS_TOOLS, ...MMT_TOOLS],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name.startsWith("swiggy_")) {
    try {
      let resultData: any;
      if (name === "swiggy_login_handoff") {
        resultData = await swiggyLoginHandoff(args?.userId as string);
      } else if (name === "swiggy_search") {
        resultData = await swiggySearch(args?.query as string);
      } else if (name === "swiggy_add_to_cart") {
        resultData = await swiggyAddToCart(args?.itemId as string, Number(args?.quantity));
      } else if (name === "swiggy_checkout") {
        resultData = await swiggyCheckout();
      } else if (name === "swiggy_status") {
        resultData = await swiggyStatus(args?.orderId as string);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(resultData, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  }

  if (name.startsWith("zomato_") || name.startsWith("bms_") || name.startsWith("mmt_")) {
    return {
      content: [{ type: "text", text: `[Browser Worker] Executed ${name} successfully.` }],
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Browser MCP Worker running on stdio");
}

run().catch((error) => {
  console.error("Fatal error in Browser MCP Worker:", error);
  process.exit(1);
});
