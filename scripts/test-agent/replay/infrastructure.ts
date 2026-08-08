// @ts-nocheck — test infra uses Node child_process which has type conflicts with tsconfig es5 target
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, existsSync } from "node:fs";

import { MockOpenAiServer } from "../servers/mock-openai";
import { MockMcpGateway } from "../helpers/mock-mcp-gateway";
import { resolveLlmEndpoint } from "./endpoint";

export interface ManagedProcess {
  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): Promise<boolean>;
  getUrl(): string;
  getPort(): number;
}

export class DetachedDevServer implements ManagedProcess {
  private port = 0;
  private ready = false;

  constructor(port: number) {
    this.port = port;
  }

  async start(): Promise<void> {
    this.ready = true;
  }

  async stop(): Promise<void> {
    this.ready = false;
  }

  async isReady(): Promise<boolean> {
    return this.ready;
  }

  getUrl(): string { return `http://127.0.0.1:${this.port}`; }
  getPort(): number { return this.port; }
}

export class NextDevServer implements ManagedProcess {
  private child: ChildProcess | null = null;
  private port = 0;
  private resolved = false;
  private buffer = "";

  constructor(private env: Record<string, string>) {}

  async start(): Promise<void> {
    const self = this;
    return new Promise((resolve, reject) => {
      const p = spawn("npx", ["next", "dev", "--port", "0"], {
        cwd: process.cwd(),
        env: { ...this.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      }) as unknown as { stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream; on: (event: string, fn: (...args: unknown[]) => void) => void; kill: (signal: string) => void; exitCode: number | null };

      const timeout = setTimeout(() => {
        if (!self.resolved) {
          self.resolved = true;
          reject(new Error("Next.js dev server timed out"));
        }
      }, 45000);

      p.stdout?.on("data", (data: Buffer) => {
        self.buffer += data.toString();
        const lines = self.buffer.split("\n");
        self.buffer = lines.pop() ?? "";

        for (const line of lines) {
          // Next.js outputs: "  - Local:        http://localhost:XXXX"
          const match = line.match(/localhost:(\d+)/);
          if (match) {
            self.port = parseInt(match[1], 10);
          }
        }

        if (self.port > 0 && !self.resolved) {
          self.resolved = true;
          clearTimeout(timeout);
          self.child = p;
          resolve();
        }
      });

      p.stderr?.on("data", (data: Buffer) => {
        self.buffer += data.toString();
      });

      p.on("error", (err) => {
        if (!self.resolved) { self.resolved = true; clearTimeout(timeout); reject(err); }
      });

      p.on("exit", (code) => {
        if (!self.resolved && code !== null) {
          self.resolved = true;
          clearTimeout(timeout);
          reject(new Error(`Next.js exited with code ${code}`));
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (this.child) {
      this.child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 2000));
      if (this.child.exitCode === null) {
        this.child.kill("SIGKILL");
      }
      this.child = null;
    }
  }

  async isReady(): Promise<boolean> {
    if (!this.port) return false;
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/api/domains`);
      return res.ok;
    } catch {
      return false;
    }
  }

  getUrl(): string { return `http://127.0.0.1:${this.port}`; }
  getPort(): number { return this.port; }
}

export class InfrastructureController {
  private mcpGateway: MockMcpGateway | null = null;
  private llmServer: MockOpenAiServer | null = null;
  private nextServer: ManagedProcess | null = null;
  private setupDone = false;
  private detached = false;

  constructor(private options?: { detachedDevUrl?: string; detachedMcpPort?: number; detachedLlmPort?: number }) {
    if (options?.detachedDevUrl) {
      this.detached = true;
    }
  }

  getMcpPort(): number { return this.mcpGateway?.getPort() ?? 0; }
  getLlmPort(): number { return this.llmServer?.getPort() ?? 0; }
  getAppUrl(): string { return this.nextServer?.getUrl() ?? ""; }
  getLlServer(): MockOpenAiServer | null { return this.llmServer; }
  getMcpGateway(): MockMcpGateway | null { return this.mcpGateway; }

  async start(): Promise<void> {
    if (this.setupDone) return;

    if (this.detached) {
      // Connect to pre-running servers
      const llmPort = this.options!.detachedLlmPort!;
      const appUrl = this.options!.detachedDevUrl!;
      this.llmServer = null;
      this.nextServer = new DetachedDevServer(parseInt(appUrl.split(":").pop() ?? "3000"));
      await this.nextServer.start();
      this.setupDone = true;
      return;
    }

    // Self-contained mode: start all servers
    this.mcpGateway = new MockMcpGateway();
    this.llmServer = new MockOpenAiServer();

    await this.mcpGateway.start();
    await this.llmServer.start();

    const llmConfig = resolveLlmEndpoint(this.llmServer.getPort());

    const tempDir = mkdtempSync(join(tmpdir(), "atlas-test-"));
    const testDb = join(tempDir, "test.db");

    if (!existsSync(join(process.cwd(), "prisma", "dev.db"))) {
      // Copy dev.db if needed (fallback: create empty)
    }

    this.nextServer = new NextDevServer({
      PATH: process.env.PATH ?? "/usr/bin",
      HOME: process.env.HOME ?? "/tmp",
      NODE_ENV: "development",
      OPENAI_BASE_URL: `${llmConfig.baseUrl}/v1`.replace(`http://127.0.0.1:${llmConfig.baseUrl.match(/\d+$/)?.[0] ?? "0"}`, `http://127.0.0.1:${this.llmServer.getPort()}`),
      OPENAI_API_KEY: llmConfig.apiKey,
      ATLAS_MODEL: llmConfig.model,
      DATABASE_URL: `file:${testDb}`,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: "",
    });

    await this.nextServer.start();
    await waitForReady(this.nextServer, "Next.js", 40000);
    this.setupDone = true;
  }

  async stop(): Promise<void> {
    if (this.detached) {
      await this.nextServer?.stop();
      return;
    }

    if (this.nextServer) await this.nextServer.stop();
    if (this.llmServer) await this.llmServer.stop();
    if (this.mcpGateway) await this.mcpGateway.stop();
    this.setupDone = false;
  }
}

export async function waitForReady(
  process: ManagedProcess,
  label: string,
  timeoutMs = 30000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await process.isReady()) return;
    } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} failed to start within ${timeoutMs}ms`);
}
