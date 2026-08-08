import type {
  LlmAdapter,
  LlmChatOptions,
  LlmChunk,
  LlmEmbedOptions,
  LlmEmbedResult,
  LlmResult,
} from "@/lib/atlas/llm/types";

export interface MockToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface MockScenarioMatch {
  systemPrompt?: string | RegExp;
  userMessage?: string | RegExp;
  toolNames?: string[];
  messageCount?: number;
}

export interface MockScenarioToolCallRound {
  calls: MockToolCall[];
  delayMs?: number;
}

export interface MockScenarioError {
  kind: "timeout" | "rate_limit" | "server_error" | "network_error" | "invalid_response";
  message?: string;
}

export interface MockScenarioOutput {
  content?: string;
  toolCallRounds?: MockScenarioToolCallRound[];
  streamChunks?: Array<
    | { type: "token"; text: string; delayMs?: number }
    | { type: "tool_call"; call: MockToolCall; delayMs?: number }
    | { type: "done"; delayMs?: number }
  >;
  embedding?: number[];
  finishReason?: string;
  error?: MockScenarioError;
}

export interface MockScenario {
  name: string;
  when: MockScenarioMatch;
  then: MockScenarioOutput;
}

function matchStringOrRegExp(value: string, pattern: string | RegExp): boolean {
  if (typeof pattern === "string") {
    return value.toLowerCase().includes(pattern.toLowerCase());
  }
  return pattern.test(value);
}

function scenarioMatchScore(options: LlmChatOptions, scenario: MockScenario): number {
  const w = scenario.when;
  let score = 0;

  if (w.systemPrompt !== undefined) {
    const systemMsg = options.messages.find((m) => m.role === "system");
    if (!systemMsg?.content || !matchStringOrRegExp(systemMsg.content, w.systemPrompt)) {
      return -1;
    }
    score += 1;
  }

  if (w.userMessage !== undefined) {
    const lastUser = [...options.messages].reverse().find((m) => m.role === "user");
    if (!lastUser?.content || !matchStringOrRegExp(lastUser.content, w.userMessage)) {
      return -1;
    }
    score += 1;
  }

  if (w.toolNames !== undefined) {
    const haveNames = new Set((options.tools ?? []).map((t) => t.name));
    for (const name of w.toolNames) {
      if (!haveNames.has(name)) return -1;
    }
    score += 1;
  }

  if (w.messageCount !== undefined) {
    if (options.messages.length !== w.messageCount) return -1;
    score += 1;
  }

  return score;
}

export class MockLlmAdapter implements LlmAdapter {
  private scenarios: MockScenario[] = [];
  private defaultContent = "";
  private defaultError: MockScenarioError | null = null;
  private latencyMs = 0;
  private roundIndex = 0;

  addScenario(scenario: MockScenario): this {
    this.scenarios.push(scenario);
    return this;
  }

  addScenarios(scenarios: MockScenario[]): this {
    this.scenarios.push(...scenarios);
    return this;
  }

  whenUserSays(message: string, replyOrToolCalls: string | MockToolCall[]): this {
    const scenario: MockScenario = {
      name: `when user says: ${message}`,
      when: { userMessage: message },
      then: {},
    };

    if (typeof replyOrToolCalls === "string") {
      scenario.then.content = replyOrToolCalls;
    } else {
      scenario.then.toolCallRounds = [{ calls: replyOrToolCalls }];
    }

    this.scenarios.push(scenario);
    return this;
  }

  whenUserSaysMulti(message: string, rounds: MockToolCall[][]): this {
    this.scenarios.push({
      name: `when user says (multi): ${message}`,
      when: { userMessage: message },
      then: {
        toolCallRounds: rounds.map((calls) => ({ calls })),
      },
    });
    return this;
  }

  withDefaultContent(content: string): this {
    this.defaultContent = content;
    return this;
  }

  withDefaultError(error: MockScenarioError): this {
    this.defaultError = error;
    return this;
  }

  withLatency(ms: number): this {
    this.latencyMs = ms;
    return this;
  }

  clearScenarios(): this {
    this.scenarios = [];
    return this;
  }

  private findMatchingScenario(options: LlmChatOptions): MockScenario | null {
    let best: MockScenario | null = null;
    let bestScore = -1;

    for (const scenario of this.scenarios) {
      const score = scenarioMatchScore(options, scenario);
      if (score > bestScore) {
        bestScore = score;
        best = scenario;
      }
    }

    return best;
  }

  private applyError(error: MockScenarioError): void {
    const msg = error.message || `Mock LLM error: ${error.kind}`;
    switch (error.kind) {
      case "timeout":
        throw new Error(`LLM timeout: ${msg}`);
      case "rate_limit":
        throw new Error(`LLM rate limited: ${msg}`);
      case "server_error":
        throw new Error(`LLM server error: ${msg}`);
      case "network_error":
        throw new Error(`LLM network error: ${msg}`);
      case "invalid_response":
        throw new Error(`LLM invalid response: ${msg}`);
    }
  }

  private async delay(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }

  async chat(options: LlmChatOptions): Promise<LlmResult> {
    await this.delay();

    const scenario = this.findMatchingScenario(options);

    if (scenario?.then.error) {
      this.applyError(scenario.then.error);
    }

    if (this.defaultError && !scenario) {
      this.applyError(this.defaultError);
    }

    if (scenario?.then.toolCallRounds && scenario.then.toolCallRounds.length > 0) {
      const round = scenario.then.toolCallRounds[this.roundIndex] ?? scenario.then.toolCallRounds[0];
      this.roundIndex = Math.min(this.roundIndex + 1, scenario.then.toolCallRounds.length - 1);
      return {
        content: scenario.then.content ?? "",
        toolCalls: round.calls.map((c) => ({
          id: c.id,
          name: c.name,
          arguments: JSON.stringify(c.arguments),
        })),
        finishReason: scenario.then.finishReason ?? "tool_calls",
      };
    }

    const content = scenario?.then.content ?? this.defaultContent;
    return {
      content,
      toolCalls: [],
      finishReason: scenario?.then.finishReason ?? "stop",
    };
  }

  resetRoundIndex(): void {
    this.roundIndex = 0;
  }

  async *streamChat(options: LlmChatOptions): AsyncIterable<LlmChunk> {
    await this.delay();

    const scenario = this.findMatchingScenario(options);

    if (scenario?.then.error) {
      this.applyError(scenario.then.error);
    }

    if (this.defaultError && !scenario) {
      this.applyError(this.defaultError);
    }

    if (scenario?.then.streamChunks && scenario.then.streamChunks.length > 0) {
      for (const chunk of scenario.then.streamChunks) {
        if (chunk.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, chunk.delayMs));
        }
        if (chunk.type === "done") {
          return;
        }
        if (chunk.type === "token") {
          yield { type: "token", text: chunk.text };
        } else if (chunk.type === "tool_call") {
          yield {
            type: "tool_call",
            call: {
              id: chunk.call.id,
              name: chunk.call.name,
              arguments: JSON.stringify(chunk.call.arguments),
            },
          };
        }
      }
      yield { type: "done" };
      return;
    }

    const result = await this.chat(options);

    if (result.content) {
      const words = result.content.split(/(\s+)/);
      for (const word of words) {
        if (word.length > 0) {
          yield { type: "token", text: word };
        }
      }
    }

    for (const call of result.toolCalls) {
      yield { type: "tool_call", call };
    }

    yield { type: "done" };
  }

  async embed(options: LlmEmbedOptions): Promise<LlmEmbedResult> {
    const inputs = Array.isArray(options.input) ? options.input : [options.input];

    const scenario = this.findMatchingScenario({ model: options.model, messages: [], provider: options.provider, apiKey: options.apiKey });

    if (scenario?.then.embedding) {
      return { embeddings: inputs.map(() => [...scenario.then.embedding!]) };
    }

    const embeddings = inputs.map((text: string, idx: number) => {
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
      }
      const dim = 128;
      const vector: number[] = [];
      for (let d = 0; d < dim; d++) {
        const val = Math.sin((hash + d * 7 + idx * 13) * 0.01);
        vector.push(val);
      }
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      return vector.map((v) => v / (norm || 1));
    });

    return { embeddings };
  }
}
