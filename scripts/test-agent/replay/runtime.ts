import { InfrastructureController } from "./infrastructure";
import { ReplayEngine } from "./engine";
import { HookPriority, HookMode } from "./types";
import type {
  ConversationDataset,
  ConversationTrace,
  FaultConfig,
  ReplayHook,
  HookContext,
  TurnResult,
} from "./types";
import type { MockScenario } from "../adapters/mock-llm";

export class ReplayRuntime {
  private infra: InfrastructureController;
  private engine: ReplayEngine;

  constructor(infra: InfrastructureController, engine: ReplayEngine) {
    this.infra = infra;
    this.engine = engine;
  }

  async start(): Promise<void> { await this.infra.start(); }
  async stop(): Promise<void> { await this.infra.stop(); }

  get baseUrl(): string { return this.infra.getAppUrl(); }
  get llmPort(): number { return this.infra.getLlmPort(); }
  get mcpPort(): number { return this.infra.getMcpPort(); }

  registerHook(hook: ReplayHook): this { this.engine.registerHook(hook); return this; }

  async replay(dataset: ConversationDataset): Promise<ConversationTrace> {
    return this.engine.replay(dataset, this.baseUrl);
  }

  async loadScenarios(scenarios: MockScenario[]): Promise<void> {
    if (!this.infra.getLlServer()) return;
    const url = `http://127.0.0.1:${this.llmPort}/__admin/scenarios`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenarios),
    });
  }

  async injectFault(config: FaultConfig): Promise<void> {
    if (!this.infra.getLlServer()) return;
    const llmUrl = `http://127.0.0.1:${this.llmPort}/__admin/faults`;
    await fetch(llmUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
  }

  async clearFaults(): Promise<void> {
    if (!this.infra.getLlServer()) return;
    const llmUrl = `http://127.0.0.1:${this.llmPort}/__admin/faults`;
    await fetch(llmUrl, { method: "DELETE" });
  }
}

export function createReplayRuntime(options?: {
  detachedDevUrl?: string;
  detachedMcpPort?: number;
  detachedLlmPort?: number;
}): ReplayRuntime {
  const infra = new InfrastructureController(options);
  const engine = new ReplayEngine();

  // Default hooks: assertion logging
  engine.registerHook({
    name: "AssertionLogger",
    priority: HookPriority.Assertion,
    mode: HookMode.Observational,
    onTurnEnd(_ctx: HookContext, result: Readonly<TurnResult>) {
      const err = (result as unknown as Record<string, unknown>).error;
      if (err) console.log(`[replay] turn error: ${String(err)}`);
    },
  });

  return new ReplayRuntime(infra, engine);
}

export { InfrastructureController, ReplayEngine };
export * from "./types";
