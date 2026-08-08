import http from "node:http";

export interface MockMcpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MockMcpToolResult {
  message: string;
  data: unknown;
}

export type MockMcpToolHandler = (args: Record<string, unknown>) => MockMcpToolResult | Promise<MockMcpToolResult>;

export interface MockMcpDomainConfig {
  name: string;
  serverName: string;
  version: string;
  tools: MockMcpToolDef[];
  handlers: Record<string, MockMcpToolHandler>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

let serverCounter = 0;

export class MockMcpGateway {
  private server: http.Server | null = null;
  private port = 0;
  private domains = new Map<string, MockMcpDomainConfig>();
  requestLog: Array<{ method: string; params: unknown; time: number }> = [];
  errorRate = 0;
  latencyMs = 0;
  authRequired = false;
  validToken = "test-token";

  addDomain(config: MockMcpDomainConfig): this {
    this.domains.set(config.name, config);
    return this;
  }

  getPort(): number { return this.port; }
  getUrl(): string { return `http://localhost:${this.port}`; }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = http.createServer((req, res) => this.handleRequest(req, res));
      s.on("error", reject);
      s.listen(0, "127.0.0.1", () => {
        const addr = s.address();
        if (addr && typeof addr === "object") this.port = addr.port;
        this.server = s;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) { this.server.close(() => resolve()); this.server = null; }
      else resolve();
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.latencyMs));
    }

    if (this.errorRate > 0 && Math.random() < this.errorRate) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "simulated error" }));
      return;
    }

    if (this.authRequired) {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${this.validToken}`) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
    }

    let body = "";
    req.on("data", (c: string) => { body += c; });
    req.on("end", async () => {
      let request: JsonRpcRequest;
      try { request = JSON.parse(body); }
      catch { res.writeHead(400); res.end(JSON.stringify({ error: "invalid json" })); return; }

      if (request.jsonrpc !== "2.0") {
        res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32600, message: "Invalid Request" } }));
        return;
      }

      const isNotification = request.method.startsWith("notifications/");

      this.requestLog.push({ method: request.method, params: request.params, time: Date.now() });

      if (!isNotification) {
        const sid = `mcp-session-${++serverCounter}`;
        res.setHeader("mcp-session-id", sid);
      }

      res.setHeader("Content-Type", "application/json");

      try {
        const result = await this.dispatchMethod(request);
        if (isNotification) { res.writeHead(202); res.end(); }
        else { res.end(JSON.stringify(result)); }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "handler error";
        if (!isNotification) {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message: msg } }));
        }
      }
    });
  }

  private async dispatchMethod(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    switch (request.method) {
      case "initialize": {
        const p = request.params as Record<string, unknown> | undefined;
        return {
          jsonrpc: "2.0", id: request.id,
          result: {
            protocolVersion: p?.protocolVersion ?? "2024-11-05",
            serverInfo: { name: "mock-mcp-gateway", version: "1.0.0" },
            capabilities: { tools: {} },
          },
        };
      }

      case "tools/list": {
        const all: MockMcpToolDef[] = [];
        this.domains.forEach((d) => all.push(...d.tools));
        return { jsonrpc: "2.0", id: request.id, result: { tools: all } };
      }

      case "tools/call": {
        const p = request.params as { name?: string; arguments?: Record<string, unknown> };
        const toolName = p?.name ?? "";
        const toolArgs = p?.arguments ?? {};

        const domains = Array.from(this.domains.values());
        for (let i = 0; i < domains.length; i++) {
          const d = domains[i];
          const handler = d.handlers[toolName];
          if (handler) {
            const r = await Promise.resolve(handler(toolArgs));
            return {
              jsonrpc: "2.0", id: request.id,
              result: {
                content: [{ type: "text", text: r.message }],
                structuredContent: r.data,
              },
            };
          }
        }
        return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Tool "${toolName}" not found` } };
      }

      default:
        return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Method "${request.method}" not found` } };
    }
  }
}
