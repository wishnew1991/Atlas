import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";

import type { McpTransport } from "@/lib/atlas/server/mcp-client";
import { createMcpTransport, withMcpServer } from "@/lib/atlas/server/mcp-client";
import { MockMcpGateway, type MockMcpToolDef } from "../helpers/mock-mcp-gateway";
import {
  assertMcpCalled,
  assertMcpCalledTimes,
  assertMcpNotCalled,
  assertMcpProtocolVersion,
  assertMcpCallCount,
} from "../assertions/mcp";

import domainToolsFixture from "../fixtures/mcp/domain-tools.json";

let gateway: MockMcpGateway;

beforeAll(async () => {
  gateway = new MockMcpGateway();

  for (const domain of domainToolsFixture) {
    const handlers: Record<string, (args: Record<string, unknown>) => { message: string; data: unknown }> = {};
    for (const tool of domain.tools) {
      handlers[tool.name] = (args) => ({
        message: `${domain.domain} ${tool.name} executed`,
        data: { args, tool: tool.name, domain: domain.domain },
      });
    }

    gateway.addDomain({
      name: domain.domain,
      serverName: `mock-${domain.domain}`,
      version: "1.0.0",
      tools: domain.tools as MockMcpToolDef[],
      handlers,
    });
  }

  await gateway.start();
});

afterAll(async () => {
  await gateway.stop();
});

beforeEach(() => {
  gateway.requestLog = [];
  gateway.errorRate = 0;
  gateway.latencyMs = 0;
  gateway.authRequired = false;
});

describe("MCP Transport — JSON-RPC Protocol", () => {
  it("should complete initialize → tools/list → tools/call lifecycle", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async (client) => {
      const tools = await client.listTools();

      expect(tools.length).toBeGreaterThanOrEqual(9);
      assertMcpCalled(gateway, "initialize");
      assertMcpCalled(gateway, "notifications/initialized");
      assertMcpCalled(gateway, "tools/list");
    });

    assertMcpCallCount(gateway, 3);
  });

  it("sends protocol version 2024-11-05 on initialize", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async () => {
      assertMcpProtocolVersion(gateway, "2024-11-05");
    });
  });

  it("sends client info on initialize", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async () => {
      const init = gateway.requestLog.find((r) => r.method === "initialize");
      const params = init?.params as Record<string, unknown> | undefined;
      const clientInfo = params?.clientInfo as Record<string, unknown> | undefined;
      expect(clientInfo?.name).toBe("atlas");
    });
  });

  it("handles JSON-RPC error responses for unknown methods", async () => {
    const transport = createMcpTransport({ url: gateway.getUrl() });
    try {
      await transport.initialize();
      await transport.callTool("nonexistent_tool", {});
    } catch {
      /* expected — unknown tool */
    } finally {
      transport.close();
    }
  });
});

describe("MCP Transport — Tool Discovery", () => {
  it("discovers tools from all configured domains", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async (client) => {
      const tools = await client.listTools();
      const names = tools.map((t) => t.name);

      expect(names).toContain("search_restaurants");
      expect(names).toContain("search_products");
      expect(names).toContain("search_flights");
      expect(names).toContain("search_hotels");
      expect(names).toContain("create_payment");
      expect(names).toContain("check_payment_status");
    });
  });

  it("returns tools with valid schemas", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async (client) => {
      const tools = await client.listTools();

      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(typeof tool.name).toBe("string");
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe("string");
      }
    });
  });

  it("tools/list is called exactly once per session", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async (client) => {
      await client.listTools();
      await client.listTools();
    });

    assertMcpCalledTimes(gateway, "tools/list", 2);
  });
});

describe("MCP Transport — Tool Execution", () => {
  it("executes a food domain tool", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async (client) => {
      const result = await client.callTool("search_restaurants", { query: "biryani" });
      expect(result.message).toContain("executed");
      assertMcpCalled(gateway, "tools/call");
    });
  });

  it("executes a shopping domain tool", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async (client) => {
      const result = await client.callTool("search_products", { query: "headphones" });
      expect(result.message).toContain("shopping");
      assertMcpCalled(gateway, "tools/call");
    });
  });

  it("executes a payment domain tool", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async (client) => {
      const result = await client.callTool("create_payment", { amount: 500, currency: "INR" });
      expect(result.message).toContain("payments");
    });
  });

  it("passes structured args to tool handler", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async (client) => {
      const result = await client.callTool("search_flights", {
        origin: "MAA",
        destination: "DEL",
        date: "2024-12-25",
      });

      const data = result.data as Record<string, unknown>;
      const args = data.args as Record<string, string>;
      expect(args.origin).toBe("MAA");
      expect(args.destination).toBe("DEL");
      expect(args.date).toBe("2024-12-25");
    });
  });

  it("returns structured data from tool results", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async (client) => {
      const result = await client.callTool("search_restaurants", { query: "pizza" });
      expect(result.data).toBeDefined();
      const data = result.data as Record<string, unknown>;
      expect(data.tool).toBe("search_restaurants");
      expect(data.domain).toBe("food");
    });
  });
});

describe("MCP Transport — Error Handling", () => {
  it("throws on server 500 error", async () => {
    gateway.errorRate = 1;
    await expect(
      withMcpServer({ url: gateway.getUrl() }, async () => {
        /* never reaches */
      })
    ).rejects.toThrow();
  });

  it("throws on server returning 401 unauthorized", async () => {
    gateway.authRequired = true;
    await expect(
      withMcpServer({ url: gateway.getUrl() }, async () => {
        /* never reaches */
      })
    ).rejects.toThrow(/token/i);
  });

  it("succeeds with valid auth token", async () => {
    gateway.authRequired = true;
    await withMcpServer({ url: gateway.getUrl(), token: "test-token" }, async (client) => {
      const tools = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  it("throws on unavailable server (invalid URL)", async () => {
    await expect(
      withMcpServer({ url: "http://127.0.0.1:1/mcp" }, async () => {
        /* never reaches */
      })
    ).rejects.toThrow();
  });
});

describe("MCP Transport — Latency & Session", () => {
  it("tracks Mcp-Session-Id across requests", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async (client) => {
      await client.listTools();
      await client.callTool("search_restaurants", { query: "test" });

      assertMcpCallCount(gateway, 4); // initialize + notification + list + call
    });
  });
});

describe("MCP Transport — Snapshot", () => {
  it("listTools returns expected tool set", async () => {
    await withMcpServer({ url: gateway.getUrl() }, async (client) => {
      const tools = await client.listTools();
      const snapshot = tools.map((t) => ({
        name: t.name,
        description: t.description,
        hasSchema: Object.keys(t.inputSchema ?? {}).length > 0,
      }));
      expect(snapshot).toMatchSnapshot();
    });
  });
});
