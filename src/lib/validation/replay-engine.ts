/**
 * Conversation Replay Engine
 * Replays conversations with Atlas through its public API (black box testing)
 */

import type {
  ConversationDataset,
  ConversationTurn,
  ExpectationTurn,
  ExecutionTrace,
  AssertionResult,
  BehavioralReport,
  PlannerDecision,
  ToolCall,
  McpRequest,
  McpResponse,
  MemoryOperation,
  LatencyMetrics,
  TokenUsage,
} from './types';

// Atlas API client (black box interface)
class AtlasApiClient {
  private baseUrl: string;
  private conversationId?: string;
  private headers: Record<string, string>;
  private timeoutMs: number;

  constructor(baseUrl: string = 'http://localhost:3001', authToken?: string, timeoutMs = 30000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
    };
    this.timeoutMs = timeoutMs;
  }

  /**
   * Best-effort connectivity check against the server. Useful to fail fast
   * before replaying a dataset against an unreachable host.
   */
  async checkConnection(timeoutMs = 5000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/domains`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async sendChatMessage(message: string, history: Array<{ role: string; text: string }> = []): Promise<{
    text: string;
    action?: {
      domain: string;
      title: string;
      summary: string;
      fields: string;
      reference: string;
    };
    executionId?: string;
    runId?: string;
  }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: this.headers,
        signal: controller.signal,
        body: JSON.stringify({
          message,
          history,
          conversationId: this.conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError') {
        throw new Error(`Chat API timed out after ${this.timeoutMs}ms (${this.baseUrl}/api/chat)`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async streamChatMessage(
    message: string,
    history: Array<{ role: string; text: string }> = []
  ): Promise<AsyncGenerator<{
    type: 'execution_start' | 'token' | 'stage' | 'done' | 'error' | 'meta';
    text?: string;
    stage?: string;
    label?: string;
    status?: string;
    detail?: string;
    durationMs?: number;
    runId?: string;
    conversationId?: string;
    executionId?: string;
    action?: any;
    done?: boolean;
    error?: string;
  }>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Accept': 'text/event-stream',
        },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          history,
          conversationId: this.conversationId,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      return this.parseSSEStream(reader, decoder);
    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError') {
        throw new Error(`Chat API streaming timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      // Timeout no longer matters once the (possibly long-lived) stream is open;
      // clear it so a slow-but-progressing stream is not cut short.
      clearTimeout(timer);
    }
  }

  private async *parseSSEStream(
    reader: ReadableStreamDefaultReader,
    decoder: TextDecoder
  ): AsyncGenerator<any> {
    const buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            yield parsed;
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  setConversationId(conversationId: string): void {
    this.conversationId = conversationId;
  }

  resetConversation(): void {
    this.conversationId = undefined;
  }

  getConversationId(): string | undefined {
    return this.conversationId;
  }
}

// Conversation replay engine
export class ConversationReplayEngine {
  private apiClient: AtlasApiClient;
  private traces: ExecutionTrace[] = [];
  private currentTrace: Partial<ExecutionTrace> = {};
  private turnNumber = 0;

  constructor(apiUrl?: string, authToken?: string, timeoutMs = 30000) {
    this.apiClient = new AtlasApiClient(apiUrl, authToken, timeoutMs);
  }

  /**
   * Fail-fast: verify the Atlas server is reachable before replaying.
   * Throws with a clear message instead of hanging each dataset turn.
   */
  async assertServerReachable(apiUrl: string = 'http://localhost:3001'): Promise<void> {
    const ready = await this.apiClient.checkConnection();
    if (!ready) {
      throw new Error(
        `Atlas server is not reachable at ${apiUrl.replace(/\/$/, '')}. ` +
        `Start the app (npm run dev on port 3001) before running behavioral validation, ` +
        `or pass --api-url <url> to point at a running instance.`
      );
    }
  }

  /**
   * Replay a conversation dataset against Atlas
   */
  async replayConversation(
    dataset: ConversationDataset
  ): Promise<BehavioralReport> {
    this.traces = [];
    this.turnNumber = 0;
    this.apiClient.resetConversation();

    const conversationId = `replay_${dataset.id}_${Date.now()}`;
    this.apiClient.setConversationId(conversationId);

    const history: Array<{ role: string; text: string }> = [];
    const assertions: AssertionResult[] = [];

    for (const turn of dataset.turns) {
      const turnResult = await this.processTurn(turn, history, dataset);
      
      if (turnResult) {
        this.traces.push(turnResult.trace);
        assertions.push(...turnResult.assertions);
      }

      if (turnResult && turnResult.userMessage) {
        history.push({ role: 'user', text: turnResult.userMessage });
      }
      if (turnResult && turnResult.assistantResponse) {
        history.push({ role: 'assistant', text: turnResult.assistantResponse });
      }

      this.turnNumber++;
    }

    return this.generateReport(dataset, assertions);
  }

  /**
   * Process a single conversation turn
   */
  private async processTurn(
    turn: ConversationTurn,
    history: Array<{ role: string; text: string }>,
    dataset: ConversationDataset
  ): Promise<{
    trace: ExecutionTrace;
    assertions: AssertionResult[];
    userMessage?: string;
    assistantResponse?: string;
  } | null> {
    const startTime = Date.now();

    if (turn.type === 'user') {
      const userMessage = turn.message;
      this.currentTrace = {
        conversationId: this.apiClient.getConversationId() || '',
        datasetId: dataset.id,
        turnNumber: this.turnNumber,
        timestamp: new Date(),
        userMessage,
        assistantResponse: '',
        plannerDecision: this.createMockPlannerDecision(),
        capabilitySelected: '',
        toolCalls: [],
        mcpRequests: [],
        mcpResponses: [],
        memoryRetrieved: [],
        memoryStored: [],
        errors: [],
        latency: this.createMockLatencyMetrics(),
        tokenUsage: this.createMockTokenUsage(),
      };

      try {
        const response = await this.apiClient.sendChatMessage(userMessage, history);
        const trace = this.currentTrace as ExecutionTrace;

        trace.assistantResponse = response.text;
        trace.latency.total = Date.now() - startTime;

        // Check for approval in response
        if (response.action) {
          trace.approvalRequest = {
            id: response.action.reference || `approval_${Date.now()}`,
            type: response.action.domain,
            title: response.action.title,
            fields: JSON.parse(response.action.fields),
            status: 'pending',
          };
        }

        return {
          trace,
          assertions: [],
          userMessage,
          assistantResponse: response.text,
        };
      } catch (error) {
        const trace = this.currentTrace as ExecutionTrace;
        trace.errors.push({
          turn: this.turnNumber,
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          recoverable: true,
        });

        return {
          trace,
          assertions: [{
            turn: this.turnNumber,
            passed: false,
            assertion: 'API request succeeded',
            expected: 'successful response',
            actual: error instanceof Error ? error.message : 'Unknown error',
            message: `Failed to send message to Atlas: ${error instanceof Error ? error.message : 'Unknown error'}`,
            severity: 'error',
          }],
          userMessage,
          assistantResponse: '',
        };
      }
    }

    if (turn.type === 'expect') {
      const assertions = this.validateExpectations(turn, this.currentTrace);
      return null;
    }

    if (turn.type === 'system') {
      if (turn.action === 'simulate_delay' && turn.delay) {
        await new Promise(resolve => setTimeout(resolve, turn.delay));
      }
      return null;
    }

    return null;
  }

  /**
   * Validate expectations against current trace
   */
  private validateExpectations(
    turn: ExpectationTurn,
    trace: Partial<ExecutionTrace>
  ): AssertionResult[] {
    const assertions: AssertionResult[] = [];

    if (turn.capability) {
      assertions.push({
        turn: this.turnNumber,
        passed: trace.capabilitySelected === turn.capability,
        assertion: `Capability should be ${turn.capability}`,
        expected: turn.capability,
        actual: trace.capabilitySelected,
        message: trace.capabilitySelected === turn.capability
          ? `Correct capability selected: ${turn.capability}`
          : `Expected capability ${turn.capability}, got ${trace.capabilitySelected}`,
        severity: 'error',
      });
    }

    if (turn.tool) {
      const toolUsed = trace.toolCalls?.some(tc => tc.name === turn.tool) ?? false;
      assertions.push({
        turn: this.turnNumber,
        passed: toolUsed,
        assertion: `Tool ${turn.tool} should be called`,
        expected: turn.tool,
        actual: toolUsed ? turn.tool : 'not called',
        message: toolUsed
          ? `Tool ${turn.tool} was called as expected`
          : `Expected tool ${turn.tool} was not called`,
        severity: 'error',
      });
    }

    if (turn.approval !== undefined) {
      const hasApproval = !!trace.approvalRequest;
      assertions.push({
        turn: this.turnNumber,
        passed: hasApproval === turn.approval,
        assertion: turn.approval ? 'Approval should be requested' : 'Approval should not be requested',
        expected: turn.approval ? 'approval requested' : 'no approval',
        actual: hasApproval ? 'approval requested' : 'no approval',
        message: hasApproval === turn.approval
          ? 'Approval flow correct'
          : 'Approval flow incorrect',
        severity: 'error',
      });
    }

    if (turn.status) {
      // This would require checking execution status via API
      // For now, we'll skip this as it requires additional API endpoints
    }

    if (turn.contains) {
      const contains = (trace.assistantResponse?.toLowerCase().includes(turn.contains.toLowerCase()) ?? false);
      assertions.push({
        turn: this.turnNumber,
        passed: contains,
        assertion: `Response should contain "${turn.contains}"`,
        expected: turn.contains,
        actual: trace.assistantResponse || '',
        message: contains
          ? `Response contains expected text`
          : `Response does not contain expected text`,
        severity: 'warning',
      });
    }

    if (turn.notContains) {
      const notContains = !trace.assistantResponse?.toLowerCase().includes(turn.notContains.toLowerCase());
      assertions.push({
        turn: this.turnNumber,
        passed: notContains,
        assertion: `Response should not contain "${turn.notContains}"`,
        expected: turn.notContains,
        actual: trace.assistantResponse || '',
        message: notContains
          ? `Response correctly excludes text`
          : `Response incorrectly contains text`,
        severity: 'warning',
      });
    }

    if (turn.referenceResolution !== undefined) {
      // This would require analyzing the conversation context
      // For now, we'll note this as informational
      assertions.push({
        turn: this.turnNumber,
        passed: true,
        assertion: 'Reference resolution',
        expected: 'reference resolved correctly',
        actual: 'reference resolution not yet implemented',
        message: 'Reference resolution validation not yet implemented',
        severity: 'info',
      });
    }

    if (turn.memoryRetrieval !== undefined) {
      const hasMemoryOps = (trace.memoryRetrieved?.length ?? 0) > 0;
      assertions.push({
        turn: this.turnNumber,
        passed: hasMemoryOps === turn.memoryRetrieval,
        assertion: 'Memory retrieval',
        expected: turn.memoryRetrieval ? 'memory retrieved' : 'no memory retrieval',
        actual: hasMemoryOps ? 'memory retrieved' : 'no memory retrieval',
        message: hasMemoryOps === turn.memoryRetrieval
          ? 'Memory operations correct'
          : 'Memory operations incorrect',
        severity: 'info',
      });
    }

    if (turn.memoryStorage !== undefined) {
      const hasMemoryStore = (trace.memoryStored?.length ?? 0) > 0;
      assertions.push({
        turn: this.turnNumber,
        passed: hasMemoryStore === turn.memoryStorage,
        assertion: 'Memory storage',
        expected: turn.memoryStorage ? 'memory stored' : 'no memory storage',
        actual: hasMemoryStore ? 'memory stored' : 'no memory storage',
        message: hasMemoryStore === turn.memoryStorage
          ? 'Memory storage correct'
          : 'Memory storage incorrect',
        severity: 'info',
      });
    }

    return assertions;
  }

  /**
   * Generate behavioral report
   */
  private generateReport(
    dataset: ConversationDataset,
    assertions: AssertionResult[]
  ): BehavioralReport {
    const successfulTurns = assertions.filter(a => a.passed).length;
    const failedTurns = assertions.filter(a => !a.passed).length;

    const summary = {
      plannerAccuracy: this.calculateAccuracy(assertions, 'capability'),
      toolCorrectness: this.calculateAccuracy(assertions, 'tool'),
      memoryCorrectness: this.calculateAccuracy(assertions, 'memory'),
      routineCorrectness: 1.0, // Will be calculated when routines are implemented
      conversationFlowCorrectness: failedTurns === 0 ? 1.0 : successfulTurns / assertions.length,
      averageLatency: this.calculateAverageLatency(),
      averageTokenUsage: this.calculateAverageTokenUsage(),
      errorRate: this.calculateErrorRate(),
    };

    return {
      datasetId: dataset.id,
      datasetName: dataset.name,
      overallSuccess: failedTurns === 0,
      totalTurns: this.turnNumber,
      successfulTurns,
      failedTurns,
      assertions,
      traces: this.traces,
      summary,
      generatedAt: new Date(),
    };
  }

  private calculateAccuracy(assertions: AssertionResult[], type: string): number {
    const relevantAssertions = assertions.filter(a => 
      a.assertion.toLowerCase().includes(type)
    );
    if (relevantAssertions.length === 0) return 1.0;
    return relevantAssertions.filter(a => a.passed).length / relevantAssertions.length;
  }

  private calculateAverageLatency(): number {
    const latencies = this.traces.map(t => t.latency.total);
    return latencies.length > 0 
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
      : 0;
  }

  private calculateAverageTokenUsage(): number {
    const tokenUsages = this.traces.map(t => t.tokenUsage.total);
    return tokenUsages.length > 0 
      ? tokenUsages.reduce((a, b) => a + b, 0) / tokenUsages.length 
      : 0;
  }

  private calculateErrorRate(): number {
    const errors = this.traces.filter(t => t.errors.length > 0).length;
    return this.traces.length > 0 ? errors / this.traces.length : 0;
  }

  // Mock methods (these would be enhanced with actual API data)
  private createMockPlannerDecision(): PlannerDecision {
    return {
      intent: 'mock',
      capability: 'mock',
      domain: 'mock',
      confidence: 0.5,
      reasoning: 'Mock decision - will be replaced with actual planner data',
    };
  }

  private createMockLatencyMetrics(): LatencyMetrics {
    return {
      total: 0,
      planner: 0,
      llm: 0,
      mcp: 0,
      memory: 0,
      totalTurns: 0,
    };
  }

  private createMockTokenUsage(): TokenUsage {
    return {
      input: 0,
      output: 0,
      total: 0,
      model: 'unknown',
    };
  }
}
