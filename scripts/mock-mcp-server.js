#!/usr/bin/env node
// Minimal mock MCP stdio server for local testing of Atlas MCP integration.
// Implements initialize, tools/list, tools/call over newline-delimited JSON-RPC.

const tools = [
  {
    name: "search_products",
    description: "Search connected stores for products matching a request.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, domain: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "create_order",
    description: "Prepare and confirm an order or booking for the user.",
    inputSchema: {
      type: "object",
      properties: { request: { type: "string" }, domain: { type: "string" } },
      required: ["request"],
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const buffer = [];
let id = 0;

process.stdin.on("data", (chunk) => {
  const lines = chunk.toString().split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      continue;
    }
    if (request.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "mock-mcp", version: "1.0.0" },
        },
      });
    } else if (request.method === "notifications/initialized") {
      // no response
    } else if (request.method === "tools/list") {
      send({ jsonrpc: "2.0", id: request.id, result: { tools } });
    } else if (request.method === "tools/call") {
      const { name, arguments: args } = request.params || {};
      const text =
        name === "search_products"
          ? `Found 3 options for "${args?.query || ""}" in ${args?.domain || "shopping"}.`
          : `Order placed for "${args?.request || ""}". Confirmation MK-12345.`;
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{ type: "text", text }],
          structuredContent: { ok: true, tool: name },
        },
      });
    }
  }
});
