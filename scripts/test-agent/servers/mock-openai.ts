import http from "node:http";

import { MockLlmAdapter, type MockScenario } from "../adapters/mock-llm";

interface AdminConfig {
  errorRate: number;
  latencyMs: number;
}

export class MockOpenAiServer {
  private server: http.Server | null = null;
  private mock: MockLlmAdapter;
  private port = 0;
  private admin: AdminConfig = { errorRate: 0, latencyMs: 0 };

  constructor() {
    this.mock = new MockLlmAdapter().withDefaultContent("I'm a mock assistant.");
  }

  getPort(): number { return this.port; }
  getUrl(): string { return `http://127.0.0.1:${this.port}/v1`; }

  getMock(): MockLlmAdapter { return this.mock; }

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

  async isReady(): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/__admin/health`);
      return res.ok;
    } catch { return false; }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.setHeader("Content-Type", "application/json");

    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    // Admin endpoints
    if (url.startsWith("/__admin")) {
      return this.handleAdmin(req, res, url, method);
    }

    if (this.admin.errorRate > 0 && Math.random() < this.admin.errorRate) {
      res.writeHead(500).end(JSON.stringify({ error: { message: "simulated server error" } }));
      return;
    }

    if (this.admin.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.admin.latencyMs));
    }

    const body = await this.readBody(req);

    if (url === "/v1/chat/completions" && method === "POST") {
      return this.handleChatCompletion(req, res, body);
    }

    if (url === "/v1/embeddings" && method === "POST") {
      return this.handleEmbedding(req, res, body);
    }

    res.writeHead(404).end(JSON.stringify({ error: "not found" }));
  }

  private async handleAdmin(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: string,
    method: string
  ): Promise<void> {
    if (url === "/__admin/health" && method === "GET") {
      res.writeHead(200).end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (url === "/__admin/scenarios" && method === "POST") {
      const body = await this.readBody(req);
      const scenarios = JSON.parse(body);
      this.mock.clearScenarios();
      if (Array.isArray(scenarios)) this.mock.addScenarios(scenarios);
      res.writeHead(200).end(JSON.stringify({ loaded: scenarios.length }));
      return;
    }

    if (url === "/__admin/scenarios" && method === "DELETE") {
      this.mock.clearScenarios();
      res.writeHead(200).end(JSON.stringify({ cleared: true }));
      return;
    }

    if (url === "/__admin/faults" && method === "POST") {
      const body = await this.readBody(req);
      const cfg = JSON.parse(body);
      this.admin.errorRate = cfg.errorRate ?? 0;
      this.admin.latencyMs = cfg.latencyMs ?? 0;
      this.mock.withLatency(this.admin.latencyMs);
      if (this.admin.errorRate > 0) this.mock.withDefaultError({ kind: "server_error" });
      res.writeHead(200).end(JSON.stringify({ configured: true }));
      return;
    }

    if (url === "/__admin/faults" && method === "DELETE") {
      this.admin.errorRate = 0;
      this.admin.latencyMs = 0;
      this.mock.withLatency(0);
      res.writeHead(200).end(JSON.stringify({ cleared: true }));
      return;
    }

    res.writeHead(404).end(JSON.stringify({ error: "admin endpoint not found" }));
  }

  private async handleChatCompletion(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string
  ): Promise<void> {
    const parsed = JSON.parse(body);
    const stream = parsed.stream === true;

    if (stream) {
      return this.handleStreamChat(res, parsed);
    }

    const result = await this.mock.chat({
      model: (parsed.model as string) ?? "test",
      messages: (parsed.messages ?? []) as Parameters<typeof this.mock.chat>[0]["messages"],
      tools: convertTools(parsed.tools) as Parameters<typeof this.mock.chat>[0]["tools"],
      toolChoice: (parsed.tool_choice as Parameters<typeof this.mock.chat>[0]["toolChoice"]) ?? "auto",
      temperature: (parsed.temperature as number) ?? 0.4,
      maxTokens: parsed.max_tokens as number,
      provider: "openai",
      apiKey: "test-key",
    });

    const message: Record<string, unknown> = {};
    if (result.content) message.content = result.content;
    if (result.toolCalls.length > 0) {
      message.tool_calls = result.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }

    res.writeHead(200).end(JSON.stringify({
      id: "chatcmpl-mock",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: parsed.model ?? "test-model",
      choices: [{ index: 0, message, finish_reason: result.finishReason ?? "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));
  }

  private async handleStreamChat(
    res: http.ServerResponse,
    parsed: Record<string, unknown>
  ): Promise<void> {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    const result = await this.mock.chat({
      model: (parsed.model as string) ?? "test",
      messages: (parsed.messages ?? []) as Parameters<typeof this.mock.chat>[0]["messages"],
      tools: convertTools(parsed.tools) as Parameters<typeof this.mock.chat>[0]["tools"],
      toolChoice: (parsed.tool_choice as string) as Parameters<typeof this.mock.chat>[0]["toolChoice"] ?? "auto",
      temperature: (parsed.temperature as number) ?? 0.4,
      provider: "openai",
      apiKey: "test-key",
    });

    const id = "chatcmpl-mock-stream";
    const created = Math.floor(Date.now() / 1000);
    const model = (parsed.model as string) ?? "test-model";

    if (result.toolCalls.length > 0) {
      for (let i = 0; i < result.toolCalls.length; i++) {
        const tc = result.toolCalls[i];
        const chunk = {
          id, object: "chat.completion.chunk", created, model,
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: i,
                id: tc.id,
                type: "function",
                function: { name: tc.name, arguments: tc.arguments },
              }],
            },
            finish_reason: i === result.toolCalls.length - 1 ? "tool_calls" : null,
          }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } else if (result.content) {
      const words = result.content.split(/(\s+)/);
      for (let i = 0; i < words.length; i++) {
        const chunk = {
          id, object: "chat.completion.chunk", created, model,
          choices: [{
            index: 0,
            delta: { content: words[i] },
            finish_reason: i === words.length - 1 ? "stop" : null,
          }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  }

  private async handleEmbedding(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string
  ): Promise<void> {
    const parsed = JSON.parse(body);
    const inputs: string[] = Array.isArray(parsed.input) ? parsed.input : [parsed.input];

    const result = await this.mock.embed!({
      model: parsed.model ?? "test",
      input: inputs,
      provider: "openai",
      apiKey: "test-key",
    });

    res.writeHead(200).end(JSON.stringify({
      object: "list",
      data: result.embeddings.map((vec, i) => ({ object: "embedding", index: i, embedding: vec })),
      model: parsed.model ?? "test-model",
      usage: { prompt_tokens: inputs.join(" ").length, total_tokens: inputs.join(" ").length },
    }));
  }

  private async readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => { data += c; });
      req.on("end", () => resolve(data));
    });
  }
}

function convertTools(tools: unknown): Array<{ name: string; description: string; parameters: Record<string, unknown> }> | undefined {
  if (!Array.isArray(tools)) return undefined;
  return tools
    .filter((t) => t && typeof t === "object" && t.type === "function" && t.function)
    .map((t) => ({
      name: t.function.name as string,
      description: t.function.description as string,
      parameters: t.function.parameters as Record<string, unknown>,
    }));
}
