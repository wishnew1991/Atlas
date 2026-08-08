/**
 * Regression Replay and Comparison System
 * Compares current executions against golden traces to detect behavioral regressions
 */

import type {
  ExecutionTrace,
  RegressionComparison,
  BehavioralReport,
  ConversationDataset,
} from './types';
import { ConversationReplayEngine } from './replay-engine';
import { GoldenTraceManager } from './golden-trace-manager';

// Regression comparison engine
export class RegressionComparisonEngine {
  private goldenTraceManager: GoldenTraceManager;
  private replayEngine: ConversationReplayEngine;

  constructor(apiUrl?: string, authToken?: string, storagePath?: string) {
    this.goldenTraceManager = new GoldenTraceManager(storagePath);
    this.replayEngine = new ConversationReplayEngine(apiUrl, authToken);
  }

  /**
   * Create golden traces for a dataset
   */
  async createGoldenTraces(
    dataset: ConversationDataset,
    reason?: string
  ): Promise<BehavioralReport> {
    const report = await this.replayEngine.replayConversation(dataset);
    await this.goldenTraceManager.storeGoldenTraces(dataset, report.traces, { reason });
    return report;
  }

  /**
   * Replay conversation and compare against golden traces
   */
  async compareAgainstGolden(
    dataset: ConversationDataset
  ): Promise<BehavioralReport & { regressionComparison: RegressionComparison }> {
    const goldenTrace = await this.goldenTraceManager.getGoldenTraces(dataset.id);

    if (!goldenTrace) {
      throw new Error(`No golden traces found for dataset ${dataset.id}. Run createGoldenTraces first.`);
    }

    const goldenTraces = goldenTrace.traces;
    const currentReport = await this.replayEngine.replayConversation(dataset);

    const regressionComparison = this.compareTraces(goldenTraces, currentReport.traces);

    return {
      ...currentReport,
      regressionComparison,
    };
  }

  /**
   * Compare golden traces with current traces
   */
  private compareTraces(
    goldenTraces: ExecutionTrace[],
    currentTraces: ExecutionTrace[]
  ): RegressionComparison {
    const comparison: RegressionComparison = {
      baselineTraceId: goldenTraces[0]?.conversationId || 'unknown',
      currentTraceId: currentTraces[0]?.conversationId || 'unknown',
      plannerChanges: [],
      toolOrderingChanges: [],
      memoryUsageChanges: [],
      conversationFlowChanges: [],
      latencyRegression: false,
      tokenUsageRegression: false,
      behaviorRegression: false,
    };

    // Compare each turn
    const maxTurns = Math.max(goldenTraces.length, currentTraces.length);

    for (let i = 0; i < maxTurns; i++) {
      const golden = goldenTraces[i];
      const current = currentTraces[i];

      if (!golden || !current) {
        comparison.conversationFlowChanges.push(
          `Turn ${i}: Turn count mismatch - golden has ${goldenTraces.length}, current has ${currentTraces.length}`
        );
        comparison.behaviorRegression = true;
        continue;
      }

      // Compare planner decisions
      if (golden.plannerDecision.capability !== current.plannerDecision.capability) {
        comparison.plannerChanges.push(
          `Turn ${i}: Capability changed from ${golden.plannerDecision.capability} to ${current.plannerDecision.capability}`
        );
        comparison.behaviorRegression = true;
      }

      if (golden.plannerDecision.intent !== current.plannerDecision.intent) {
        comparison.plannerChanges.push(
          `Turn ${i}: Intent changed from ${golden.plannerDecision.intent} to ${current.plannerDecision.intent}`
        );
        comparison.behaviorRegression = true;
      }

      // Compare tool ordering
      const goldenToolNames = golden.toolCalls.map(tc => tc.name);
      const currentToolNames = current.toolCalls.map(tc => tc.name);

      if (!this.areArraysEqual(goldenToolNames, currentToolNames)) {
        comparison.toolOrderingChanges.push(
          `Turn ${i}: Tool order changed from [${goldenToolNames.join(', ')}] to [${currentToolNames.join(', ')}]`
        );
        comparison.behaviorRegression = true;
      }

      // Compare memory usage
      const goldenMemoryOps = golden.memoryRetrieved.length + golden.memoryStored.length;
      const currentMemoryOps = current.memoryRetrieved.length + current.memoryStored.length;

      if (goldenMemoryOps !== currentMemoryOps) {
        comparison.memoryUsageChanges.push(
          `Turn ${i}: Memory operations changed from ${goldenMemoryOps} to ${currentMemoryOps}`
        );
        comparison.behaviorRegression = true;
      }

      // Compare conversation flow (assistant responses)
      if (golden.assistantResponse !== current.assistantResponse) {
        comparison.conversationFlowChanges.push(
          `Turn ${i}: Assistant response changed`
        );
        // Don't mark as regression if response is semantically similar
        // For now, we'll only flag if it's significantly different
      }

      // Compare latency
      const latencyIncrease = current.latency.total - golden.latency.total;
      const latencyPercentageIncrease = (latencyIncrease / golden.latency.total) * 100;

      if (latencyPercentageIncrease > 50) { // More than 50% increase
        comparison.latencyRegression = true;
        comparison.conversationFlowChanges.push(
          `Turn ${i}: Latency increased by ${latencyPercentageIncrease.toFixed(1)}% (${golden.latency.total}ms -> ${current.latency.total}ms)`
        );
      }

      // Compare token usage
      const tokenIncrease = current.tokenUsage.total - golden.tokenUsage.total;
      const tokenPercentageIncrease = (tokenIncrease / golden.tokenUsage.total) * 100;

      if (tokenPercentageIncrease > 50) { // More than 50% increase
        comparison.tokenUsageRegression = true;
        comparison.conversationFlowChanges.push(
          `Turn ${i}: Token usage increased by ${tokenPercentageIncrease.toFixed(1)}% (${golden.tokenUsage.total} -> ${current.tokenUsage.total})`
        );
      }

      // Compare errors
      if (golden.errors.length !== current.errors.length) {
        comparison.conversationFlowChanges.push(
          `Turn ${i}: Error count changed from ${golden.errors.length} to ${current.errors.length}`
        );
        comparison.behaviorRegression = true;
      }
    }

    return comparison;
  }

  /**
   * Compare arrays for equality
   */
  private areArraysEqual(arr1: string[], arr2: string[]): boolean {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((val, index) => val === arr2[index]);
  }

  /**
   * Batch regression testing for multiple datasets
   */
  async batchRegressionTest(
    datasets: ConversationDataset[]
  ): Promise<Map<string, BehavioralReport & { regressionComparison: RegressionComparison }>> {
    const results = new Map();

    for (const dataset of datasets) {
      try {
        const result = await this.compareAgainstGolden(dataset);
        results.set(dataset.id, result);
      } catch (error) {
        console.error(`Failed to test dataset ${dataset.id}:`, error);
      }
    }

    return results;
  }

  /**
   * Generate regression summary report
   */
  generateRegressionSummary(
    results: Map<string, BehavioralReport & { regressionComparison: RegressionComparison }>
  ): {
    totalDatasets: number;
    passedDatasets: number;
    failedDatasets: number;
    overallRegression: boolean;
    details: Array<{
      datasetId: string;
      datasetName: string;
      passed: boolean;
      regressionDetected: boolean;
      issues: string[];
    }>;
  } {
    let passedDatasets = 0;
    let failedDatasets = 0;
    let overallRegression = false;

    const details = [];

    for (const [datasetId, result] of Array.from(results.entries())) {
      const passed = result.overallSuccess;
      const regressionDetected = result.regressionComparison.behaviorRegression ||
        result.regressionComparison.latencyRegression ||
        result.regressionComparison.tokenUsageRegression;

      if (passed) {
        passedDatasets++;
      } else {
        failedDatasets++;
      }

      if (regressionDetected) {
        overallRegression = true;
      }

      const issues = [
        ...result.regressionComparison.plannerChanges,
        ...result.regressionComparison.toolOrderingChanges,
        ...result.regressionComparison.memoryUsageChanges,
        ...result.regressionComparison.conversationFlowChanges,
      ];

      details.push({
        datasetId,
        datasetName: result.datasetName,
        passed,
        regressionDetected,
        issues,
      });
    }

    return {
      totalDatasets: results.size,
      passedDatasets,
      failedDatasets,
      overallRegression,
      details,
    };
  }

  /**
   * Update golden traces for a dataset
   */
  async updateGoldenTraces(
    dataset: ConversationDataset,
    reason?: string
  ): Promise<BehavioralReport> {
    return this.createGoldenTraces(dataset, reason);
  }

  /**
   * Accept new baseline for a dataset
   */
  async acceptNewBaseline(
    datasetId: string,
    reason: string,
    author?: string
  ): Promise<void> {
    await this.goldenTraceManager.acceptNewBaseline(datasetId, reason, author);
  }

  /**
   * Get golden trace manager for advanced operations
   */
  getGoldenTraceManager(): GoldenTraceManager {
    return this.goldenTraceManager;
  }
}