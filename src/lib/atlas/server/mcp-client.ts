import "server-only";

import { spawn, type ChildProcessByStdio } from "child_process";
import type { Writable, Readable } from "stream";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServerConfig {
  url?: string;
  token?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonRpcLines(raw: string): JsonRpcMessage[] {
  const messages: JsonRpcMessage[] = [];
  const blocks = raw.split("\n\n");

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.startsWith("data:"));

    for (const line of lines) {
      const payload = line.slice(line.indexOf(":") + 1).trim();

      if (!payload) {
        continue;
      }

      try {
        const parsed = JSON.parse(payload);

        if (isRecord(parsed)) {
          messages.push(parsed as unknown as JsonRpcMessage);
        }
      } catch {
        /* skip non-JSON */
      }
    }
  }

  return messages;
}

export interface McpTransport {
  initialize(): Promise<void>;
  listTools(): Promise<McpToolDefinition[]>;
  callTool(name: string, argumentsValue: Record<string, unknown>): Promise<{ message: string; data: unknown }>;
  close(): void;
}

class StdioTransport implements McpTransport {
  private child: ChildProcessByStdio<Writable, Readable, null>;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: JsonRpcResponse) => void; reject: (reason: Error) => void }>();

  constructor(config: McpServerConfig) {
    const command = config.command ?? "";
    const args = config.args ?? [];

    this.child = spawn(command, args, {
      env: { ...process.env, ...(config.env ?? {}) },
      stdio: ["pipe", "pipe", "inherit"],
    });

    this.child.stdout.on("data", (chunk: Buffer) => this.onData(chunk.toString()));
    this.child.on("exit", (code) => {
      const entries = Array.from(this.pending.values());
      for (const { reject } of entries) {
        reject(new Error(`MCP server exited unexpectedly (code ${code}).`));
      }
      this.pending.clear();
    });
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");

    while (index !== -1) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);

      if (line.length > 0) {
        try {
          const message = JSON.parse(line) as JsonRpcResponse;

          if (isRecord(message) && message.jsonrpc === "2.0" && typeof message.id === "number") {
            const entry = this.pending.get(message.id);
            if (entry) {
              this.pending.delete(message.id);
              entry.resolve(message);
            }
          }
        } catch {
          /* ignore non-JSON lines such as server logs */
        }
      }

      index = this.buffer.indexOf("\n");
    }
  }

  private send(method: string, params?: unknown): Promise<JsonRpcResponse> {
    const isNotification = method.startsWith("notifications/");

    if (isNotification) {
      // MCP notifications must not carry an id — some servers reject any request
      // with an id whose method is not a valid request method (e.g. heventure).
      const payload: { jsonrpc: "2.0"; method: string; params?: unknown } = {
        jsonrpc: "2.0",
        method,
        params,
      };
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
      return Promise.resolve({ jsonrpc: "2.0", id: 0 });
    }

    const id = this.nextId++;
    const payload: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request "${method}" timed out.`));
        }
      }, 20000);
    });
  }

  async initialize(): Promise<void> {
    const response = await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "atlas", version: "0.1.0" },
    });

    if (response.error) {
      throw new Error(`MCP initialize failed: ${response.error.message}`);
    }

    await this.send("notifications/initialized");
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const response = await this.send("tools/list", {});

    if (response.error) {
      throw new Error(`MCP tools/list failed: ${response.error.message}`);
    }

    return normalizeTools(response.result);
  }

  async callTool(name: string, argumentsValue: Record<string, unknown>): Promise<{ message: string; data: unknown }> {
    const response = await this.send("tools/call", { name, arguments: argumentsValue });

    if (response.error) {
      throw new Error(`MCP tool "${name}" failed: ${response.error.message}`);
    }

    return normalizeToolResult(response.result);
  }

  close(): void {
    try {
      this.child.stdin.end();
      this.child.kill("SIGTERM");
    } catch {
      /* already closed */
    }
  }
}

class HttpTransport implements McpTransport {
  private url: string;
  private token?: string;
  private nextId = 1;
  private sessionId?: string;

  constructor(config: McpServerConfig) {
    if (!config.url) {
      throw new Error("MCP URL transport requires a URL.");
    }

    this.url = config.url;
    this.token = config.token;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      ...extra,
    };
  }

  private async post(method: string, params?: unknown): Promise<JsonRpcResponse> {
    const isNotification = method.startsWith("notifications/");
    const requestId = isNotification ? undefined : this.nextId++;
    const payload: JsonRpcRequest | { jsonrpc: "2.0"; method: string; params?: unknown } = isNotification
      ? { jsonrpc: "2.0", method, params }
      : { jsonrpc: "2.0", id: requestId, method, params };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      });

      const sessionHeader = response.headers.get("mcp-session-id");
      if (sessionHeader) {
        this.sessionId = sessionHeader;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");

        if (response.status === 401) {
          throw new Error(
            "MCP server rejected the request: the token is missing, invalid, or expired. Re-run the provider auth and update the Bearer token."
          );
        }

        throw new Error(`MCP server returned ${response.status}${text ? `: ${text}` : ""}`);
      }

      const raw = await response.text();
      let messages: JsonRpcMessage[] = [];

      if (raw.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(raw);

          if (isRecord(parsed)) {
            messages = [parsed as unknown as JsonRpcMessage];
          }
        } catch {
          messages = [];
        }
      } else {
        messages = parseJsonRpcLines(raw);
      }

      const match = messages.find(
        (message) =>
          typeof message.id === "number" &&
          typeof requestId === "number" &&
          message.id === requestId
      );

      const message = match as JsonRpcResponse | undefined;

      if (!message) {
        if (method.startsWith("notifications/")) {
          return { jsonrpc: "2.0", id: 0 };
        }
        throw new Error("MCP server did not return a response.");
      }

      return message;
    } finally {
      clearTimeout(timeout);
    }
  }

  async initialize(): Promise<void> {
    const response = await this.post("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "atlas", version: "0.1.0" },
    });

    if (response.error) {
      throw new Error(`MCP initialize failed: ${response.error.message}`);
    }

    await this.post("notifications/initialized");
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const response = await this.post("tools/list", {});

    if (response.error) {
      throw new Error(`MCP tools/list failed: ${response.error.message}`);
    }

    return normalizeTools(response.result);
  }

  async callTool(name: string, argumentsValue: Record<string, unknown>): Promise<{ message: string; data: unknown }> {
    const response = await this.post("tools/call", { name, arguments: argumentsValue });

    if (response.error) {
      throw new Error(`MCP tool "${name}" failed: ${response.error.message}`);
    }

    return normalizeToolResult(response.result);
  }

  close(): void {
    /* HTTP transport has no persistent connection to close */
  }
}

function normalizeTools(result: unknown): McpToolDefinition[] {
  const record = isRecord(result) ? result : {};
  const tools = Array.isArray(record.tools) ? record.tools : [];

  return tools
    .filter(isRecord)
    .map((tool) => ({
      name: typeof tool.name === "string" ? tool.name : "",
      description: typeof tool.description === "string" ? tool.description : "",
      inputSchema: isRecord(tool.inputSchema) ? (tool.inputSchema as Record<string, unknown>) : {},
    }))
    .filter((tool) => tool.name.length > 0);
}

function normalizeToolResult(result: unknown): { message: string; data: unknown } {
  const record = isRecord(result) ? result : {};
  const content = Array.isArray(record.content) ? record.content : [];

  const textParts = content
    .filter(isRecord)
    .filter((entry) => entry.type === "text" && typeof entry.text === "string")
    .map((entry) => entry.text as string);

  const message = textParts.join("\n").trim();
  const data = record.structuredContent ?? record;

  return { message: message || "The MCP tool completed.", data };
}

export function createMcpTransport(config: McpServerConfig): McpTransport {
  if (config.url) {
    return new HttpTransport(config);
  }

  if (config.command) {
    return new StdioTransport(config);
  }

  throw new Error("An MCP server requires either a URL or a command.");
}

export async function withMcpServer<T>(
  config: McpServerConfig,
  handler: (client: McpTransport) => Promise<T>
): Promise<T> {
  const transport = createMcpTransport(config);

  try {
    await transport.initialize();

    return await handler(transport);
  } finally {
    transport.close();
  }
}
