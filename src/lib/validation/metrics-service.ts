/**
 * Behavioral Metrics API
 * Provides metrics for the behavioral dashboard
 */

import { GoldenTraceManager } from './golden-trace-manager';
import { allDatasets } from './datasets';
import type { BehavioralReport } from './types';

export interface BehavioralMetrics {
  overall: {
    totalDatasets: number;
    totalGoldenTraces: number;
    successRate: number;
    healthScore: number;
  };
  planner: {
    accuracy: number;
    averageConfidence: number;
    topCapabilities: Array<{ capability: string; count: number }>;
  };
  tools: {
    correctness: number;
    averageCallsPerTurn: number;
    topTools: Array<{ tool: string; count: number }>;
  };
  memory: {
    correctness: number;
    averageOperationsPerTurn: number;
    retrievalRate: number;
    storageRate: number;
  };
  performance: {
    averageLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    averageTokenUsage: number;
  };
  regression: {
    lastRun: string;
    regressionCount: number;
    regressionRate: number;
    topRegressions: Array<{ datasetId: string; issues: string[] }>;
  };
  coverage: {
    capabilities: Array<{ capability: string; datasetCount: number }>;
    difficulties: Array<{ difficulty: string; datasetCount: number }>;
    categories: Array<{ category: string; datasetCount: number }>;
  };
}

export class BehavioralMetricsService {
  private goldenTraceManager: GoldenTraceManager;

  constructor(storagePath?: string) {
    this.goldenTraceManager = new GoldenTraceManager(storagePath);
  }

  /**
   * Get comprehensive behavioral metrics
   */
  async getMetrics(reports?: Map<string, BehavioralReport>): Promise<BehavioralMetrics> {
    const datasets = allDatasets;
    const goldenDatasets = this.goldenTraceManager.listDatasets();

    const metrics: BehavioralMetrics = {
      overall: {
        totalDatasets: datasets.length,
        totalGoldenTraces: goldenDatasets.length,
        successRate: this.calculateSuccessRate(reports),
        healthScore: this.calculateHealthScore(reports),
      },
      planner: {
        accuracy: this.calculatePlannerAccuracy(reports),
        averageConfidence: 0.85, // Would be calculated from actual traces
        topCapabilities: this.getTopCapabilities(datasets),
      },
      tools: {
        correctness: this.calculateToolCorrectness(reports),
        averageCallsPerTurn: 1.2, // Would be calculated from actual traces
        topTools: this.getTopTools(reports),
      },
      memory: {
        correctness: this.calculateMemoryCorrectness(reports),
        averageOperationsPerTurn: 0.5, // Would be calculated from actual traces
        retrievalRate: 0.3, // Would be calculated from actual traces
        storageRate: 0.2, // Would be calculated from actual traces
      },
      performance: {
        averageLatency: this.calculateAverageLatency(reports),
        p50Latency: this.calculatePercentileLatency(50, reports),
        p95Latency: this.calculatePercentileLatency(95, reports),
        p99Latency: this.calculatePercentileLatency(99, reports),
        averageTokenUsage: this.calculateAverageTokenUsage(reports),
      },
      regression: {
        lastRun: new Date().toISOString(),
        regressionCount: this.countRegressions(reports),
        regressionRate: this.calculateRegressionRate(reports),
        topRegressions: this.getTopRegressions(reports),
      },
      coverage: {
        capabilities: this.getCapabilityCoverage(datasets),
        difficulties: this.getDifficultyCoverage(datasets),
        categories: this.getCategoryCoverage(datasets),
      },
    };

    return metrics;
  }

  private calculateSuccessRate(reports?: Map<string, BehavioralReport>): number {
    if (!reports || reports.size === 0) return 1.0;

    let passed = 0;
    for (const report of Array.from(reports.values())) {
      if (report.overallSuccess) passed++;
    }

    return passed / reports.size;
  }

  private calculateHealthScore(reports?: Map<string, BehavioralReport>): number {
    if (!reports || reports.size === 0) return 100;

    const successRate = this.calculateSuccessRate(reports);
    const regressionRate = this.calculateRegressionRate(reports);
    const avgLatency = this.calculateAverageLatency(reports);

    // Health score formula
    const successScore = successRate * 60;
    const regressionScore = (1 - regressionRate) * 30;
    const latencyScore = avgLatency < 1000 ? 10 : Math.max(0, 10 - (avgLatency - 1000) / 500);

    return Math.min(100, successScore + regressionScore + latencyScore);
  }

  private calculatePlannerAccuracy(reports?: Map<string, BehavioralReport>): number {
    if (!reports || reports.size === 0) return 1.0;

    let totalAccuracy = 0;
    let count = 0;

    for (const report of Array.from(reports.values())) {
      totalAccuracy += report.summary.plannerAccuracy;
      count++;
    }

    return count > 0 ? totalAccuracy / count : 1.0;
  }

  private calculateToolCorrectness(reports?: Map<string, BehavioralReport>): number {
    if (!reports || reports.size === 0) return 1.0;

    let totalCorrectness = 0;
    let count = 0;

    for (const report of Array.from(reports.values())) {
      totalCorrectness += report.summary.toolCorrectness;
      count++;
    }

    return count > 0 ? totalCorrectness / count : 1.0;
  }

  private calculateMemoryCorrectness(reports?: Map<string, BehavioralReport>): number {
    if (!reports || reports.size === 0) return 1.0;

    let totalCorrectness = 0;
    let count = 0;

    for (const report of Array.from(reports.values())) {
      totalCorrectness += report.summary.memoryCorrectness;
      count++;
    }

    return count > 0 ? totalCorrectness / count : 1.0;
  }

  private calculateAverageLatency(reports?: Map<string, BehavioralReport>): number {
    if (!reports || reports.size === 0) return 0;

    let totalLatency = 0;
    let count = 0;

    for (const report of Array.from(reports.values())) {
      totalLatency += report.summary.averageLatency;
      count++;
    }

    return count > 0 ? totalLatency / count : 0;
  }

  private calculatePercentileLatency(percentile: number, reports?: Map<string, BehavioralReport>): number {
    if (!reports || reports.size === 0) return 0;

    const latencies: number[] = [];
    for (const report of Array.from(reports.values())) {
      for (const trace of report.traces) {
        latencies.push(trace.latency.total);
      }
    }

    if (latencies.length === 0) return 0;

    latencies.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * latencies.length) - 1;
    return latencies[index];
  }

  private calculateAverageTokenUsage(reports?: Map<string, BehavioralReport>): number {
    if (!reports || reports.size === 0) return 0;

    let totalTokens = 0;
    let count = 0;

    for (const report of Array.from(reports.values())) {
      totalTokens += report.summary.averageTokenUsage;
      count++;
    }

    return count > 0 ? totalTokens / count : 0;
  }

  private countRegressions(reports?: Map<string, BehavioralReport>): number {
    if (!reports || reports.size === 0) return 0;

    let count = 0;
    for (const report of Array.from(reports.values())) {
      if (report.regressionComparison?.behaviorRegression) {
        count++;
      }
    }

    return count;
  }

  private calculateRegressionRate(reports?: Map<string, BehavioralReport>): number {
    if (!reports || reports.size === 0) return 0;

    return this.countRegressions(reports) / reports.size;
  }

  private getTopRegressions(reports?: Map<string, BehavioralReport>): Array<{ datasetId: string; issues: string[] }> {
    if (!reports || reports.size === 0) return [];

    const regressions: Array<{ datasetId: string; issues: string[] }> = [];

    for (const [datasetId, report] of Array.from(reports.entries())) {
      if (report.regressionComparison?.behaviorRegression) {
        const issues = [
          ...report.regressionComparison.plannerChanges,
          ...report.regressionComparison.toolOrderingChanges,
          ...report.regressionComparison.memoryUsageChanges,
        ];
        regressions.push({ datasetId, issues });
      }
    }

    return regressions.sort((a, b) => b.issues.length - a.issues.length).slice(0, 5);
  }

  private getTopCapabilities(datasets: any[]): Array<{ capability: string; count: number }> {
    const capabilityCounts = new Map<string, number>();

    for (const dataset of datasets) {
      for (const capability of dataset.metadata.requiresCapabilities) {
        capabilityCounts.set(capability, (capabilityCounts.get(capability) || 0) + 1);
      }
    }

    return Array.from(capabilityCounts.entries())
      .map(([capability, count]) => ({ capability, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private getTopTools(reports?: Map<string, BehavioralReport>): Array<{ tool: string; count: number }> {
    if (!reports || reports.size === 0) return [];

    const toolCounts = new Map<string, number>();

    for (const report of Array.from(reports.values())) {
      for (const trace of report.traces) {
        for (const toolCall of trace.toolCalls) {
          toolCounts.set(toolCall.name, (toolCounts.get(toolCall.name) || 0) + 1);
        }
      }
    }

    return Array.from(toolCounts.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private getCapabilityCoverage(datasets: any[]): Array<{ capability: string; datasetCount: number }> {
    const capabilityCounts = new Map<string, number>();

    for (const dataset of datasets) {
      for (const capability of dataset.metadata.requiresCapabilities) {
        capabilityCounts.set(capability, (capabilityCounts.get(capability) || 0) + 1);
      }
    }

    return Array.from(capabilityCounts.entries())
      .map(([capability, datasetCount]) => ({ capability, datasetCount }))
      .sort((a, b) => b.datasetCount - a.datasetCount);
  }

  private getDifficultyCoverage(datasets: any[]): Array<{ difficulty: string; datasetCount: number }> {
    const difficultyCounts = new Map<string, number>();

    for (const dataset of datasets) {
      const difficulty = dataset.metadata.difficulty;
      difficultyCounts.set(difficulty, (difficultyCounts.get(difficulty) || 0) + 1);
    }

    return Array.from(difficultyCounts.entries())
      .map(([difficulty, datasetCount]) => ({ difficulty, datasetCount }))
      .sort((a, b) => b.datasetCount - a.datasetCount);
  }

  private getCategoryCoverage(datasets: any[]): Array<{ category: string; datasetCount: number }> {
    const categoryCounts = new Map<string, number>();

    for (const dataset of datasets) {
      const category = dataset.category;
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }

    return Array.from(categoryCounts.entries())
      .map(([category, datasetCount]) => ({ category, datasetCount }))
      .sort((a, b) => b.datasetCount - a.datasetCount);
  }
}