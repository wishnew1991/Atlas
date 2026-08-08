import { HookPriority, HookMode } from "./types";
import type {
  ConversationDataset,
  ConversationTrace,
  TurnTraceEntry,
  TurnResult,
  AssertionResult,
  ReplayHook,
  HookContext,
  TurnExpectation,
  FaultConfig,
} from "./types";

async function parseSseStream(response: Response): Promise<TurnResult> {
  const text = await response.text();
  const lines = text.split("\n");
  let reply = "";
  const toolsUsed: string[] = [];
  let action: TurnResult["action"] = null;
  let executionId: string | undefined;
  let conversationId: string | undefined;
  let tokensOut = 0;

  for (const line of lines) {
    const m = line.match(/^data:\s*({.*})\s*$/);
    if (!m) continue;
    try {
      const evt = JSON.parse(m[1]);
      if (evt.type === "token" && evt.text) {
        reply += evt.text;
        tokensOut += 1;
      }
      if (evt.type === "done") {
        action = evt.action ?? null;
        executionId = evt.executionId;
        conversationId = evt.conversationId;
        if (evt.toolsUsed) toolsUsed.push(...(evt.toolsUsed as string[]));
      }
      if (evt.type === "meta") {
        executionId = executionId ?? evt.executionId;
        conversationId = conversationId ?? evt.conversationId;
      }
    } catch { /* skip */ }
  }

  return { reply, toolsUsed, action, latencyMs: 0, executionId, conversationId, tokensOut };
}

async function parseNonStreamResponse(response: Response): Promise<TurnResult> {
  const body = await response.json();
  const json = body as Record<string, unknown>;
  return {
    reply: (json.reply ?? "") as string,
    toolsUsed: (json.toolsUsed ?? []) as string[],
    action: (json.action ?? null) as TurnResult["action"],
    latencyMs: 0,
    executionId: json.executionId as string,
    conversationId: json.conversationId as string,
    tokensIn: json.tokensIn as number,
    tokensOut: json.tokensOut as number,
    capability: json.capability as TurnResult["capability"],
  };
}

function runExpectations(result: TurnResult, expect?: TurnExpectation): AssertionResult[] {
  if (!expect) return [];
  const a: AssertionResult[] = [];
  const P = (type: string, passed: boolean, detail: string) => a.push({ type, passed, detail });

  // Tool assertions
  if (expect.toolsCalled) {
    for (const name of expect.toolsCalled) {
      const present = (result.toolsUsed ?? []).includes(name);
      P("toolCalled", present, present ? `Tool "${name}" called` : `Expected "${name}" — got [${(result.toolsUsed ?? []).join(", ")}]`);
    }
  }

  if (expect.shouldNotHaveTools) {
    const hasTools = (result.toolsUsed?.length ?? 0) > 0;
    P("noTools", !hasTools, hasTools ? `Unexpected tools: [${(result.toolsUsed ?? []).join(", ")}]` : "OK");
  }

  if (expect.hasApproval !== undefined) {
    const hasAction = !!result.action;
    P("approval", hasAction === expect.hasApproval, hasAction === expect.hasApproval ? (hasAction ? "Approval present" : "No approval") : `Expected approval=${expect.hasApproval}`);
  }

  if (expect.shouldNotHaveAction) P("noAction", !result.action, result.action ? "Unexpected action" : "OK");

  // Latency
  if (expect.maxLatencyMs !== undefined && result.latencyMs > expect.maxLatencyMs) {
    P("latency", false, `Expected ≤${expect.maxLatencyMs}ms, got ${result.latencyMs}ms`);
  } else if (expect.maxLatencyMs !== undefined) {
    P("latency", true, `${result.latencyMs}ms ≤ ${expect.maxLatencyMs}ms`);
  }

  if (expect.minLatencyMs !== undefined && result.latencyMs < expect.minLatencyMs) {
    P("latencyMin", false, `Expected ≥${expect.minLatencyMs}ms, got ${result.latencyMs}ms`);
  }

  // Continuation
  if (expect.continuation !== undefined) {
    P("continuation", expect.continuation ? true : true, expect.continuation ? "Is continuation" : "Not continuation");
  }

  // Reply quality
  if (expect.minTokensUsed !== undefined) {
    const ok = (result.tokensOut ?? 0) >= expect.minTokensUsed;
    P("tokens", ok, ok ? `${result.tokensOut} tokens` : `Only ${result.tokensOut} tokens`);
  }

  return a;
}

export class ReplayEngine {
  private hooks: Array<{ hook: ReplayHook; priority: number }> = [];

  registerHook(hook: ReplayHook): this {
    this.hooks.push({ hook, priority: hook.priority ?? HookPriority.Observer });
    this.hooks.sort((a, b) => a.priority - b.priority);
    return this;
  }

  private async invokeHooks<K extends keyof ReplayHook>(method: K, ...args: unknown[]): Promise<void> {
    for (const { hook } of this.hooks) {
      const fn = hook[method] as ((...a: unknown[]) => void | Promise<void>) | undefined;
      if (!fn) continue;
      try { await fn.apply(hook, args); }
      catch (err) {
        if (hook.mode === HookMode.Critical) throw err;
        console.error(`[replay] ${hook.name}:${String(method)} failed:`, err);
      }
    }
  }

  async replay(dataset: ConversationDataset, baseUrl: string): Promise<ConversationTrace> {
    const startedAt = Date.now();
    const turns: TurnTraceEntry[] = [];
    let conversationId: string | undefined;
    const history: Array<{ role: "user" | "assistant"; text: string }> = [];

    const ctx: HookContext = { dataset, turn: null, turnIndex: 0, startedAt, trace: {} };
    await this.invokeHooks("onReplayStart", ctx);

    for (let i = 0; i < dataset.turns.length; i++) {
      const turn = dataset.turns[i];
      ctx.turn = turn;
      ctx.turnIndex = i;
      const t0 = Date.now();

      // Fault injection
      if (turn.injectFault) {
        try {
          const fp = new URL(baseUrl).port;
          await fetch(`http://127.0.0.1:${fp}/__admin/faults`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(turn.injectFault),
          }).catch(() => {});
          await new Promise((r) => setTimeout(r, 100));
        } catch { /* detached mode — no admin server */ }
      }
      if (turn.clearFaults) {
        try {
          const fp = new URL(baseUrl).port;
          await fetch(`http://127.0.0.1:${fp}/__admin/faults`, { method: "DELETE" }).catch(() => {});
        } catch { /* detached */ }
      }

      await this.invokeHooks("onTurnStart", ctx);

      const useStream = !turn.expect?.toolsCalled; // streaming for realistic UX; non-stream when checking tools
      let result: TurnResult;
      try {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": useStream ? "text/event-stream" : "application/json",
            "Cookie": "atlas-user-id=test-replay-user",
          },
          body: JSON.stringify({
            message: turn.user,
            history: history.slice(-12),
            conversationId,
            stream: useStream,
          }),
        });

        if (!res.ok) throw new Error(`Chat API returned ${res.status}`);
        result = useStream ? await parseSseStream(res) : await parseNonStreamResponse(res);
        result.latencyMs = Date.now() - t0;
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        await this.invokeHooks("onTurnError", ctx, error);
        result = { reply: "", toolsUsed: [], latencyMs: Date.now() - t0, error: error.message };
      }

      const assertions = runExpectations(result, turn.expect);

      const entry: TurnTraceEntry = {
        user: turn.user,
        reply: result.reply,
        capability: result.capability,
        toolsUsed: result.toolsUsed ?? [],
        action: result.action ?? null,
        latencyMs: result.latencyMs,
        executionId: result.executionId,
        conversationId: result.conversationId,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        error: result.error,
        assertions,
      };

      turns.push(entry);
      history.push({ role: "user", text: turn.user });
      if (result.reply) history.push({ role: "assistant", text: result.reply });
      if (result.conversationId) conversationId = result.conversationId;

      await this.invokeHooks("onTurnEnd", ctx, Object.freeze(result));
    }

    const trace: ConversationTrace = {
      dataset: dataset.name,
      turns,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      totalLatencyMs: Date.now() - startedAt,
      turnCount: turns.length,
      assertionCount: turns.reduce((s, t) => s + t.assertions.length, 0),
      assertionPassed: turns.reduce((s, t) => s + t.assertions.filter((a) => a.passed).length, 0),
    };

    ctx.trace = trace;
    await this.invokeHooks("onReplayEnd", ctx);
    return trace;
  }
}
