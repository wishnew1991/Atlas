/**
 * Behavioral Report Generator
 * Generates comprehensive behavioral validation reports
 */

import type {
  BehavioralReport,
  RegressionComparison,
  ConversationDataset,
} from './types';

export class BehavioralReportGenerator {
  /**
   * Generate a detailed behavioral report
   */
  generateDetailedReport(
    report: BehavioralReport,
    format: 'text' | 'html' | 'json' = 'text'
  ): string {
    switch (format) {
      case 'text':
        return this.generateTextReport(report);
      case 'html':
        return this.generateHtmlReport(report);
      case 'json':
        return JSON.stringify(report, null, 2);
      default:
        return this.generateTextReport(report);
    }
  }

  /**
   * Generate text-based report
   */
  private generateTextReport(report: BehavioralReport): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push('BEHAVIORAL VALIDATION REPORT');
    lines.push('='.repeat(80));
    lines.push('');

    lines.push(`Dataset: ${report.datasetName} (${report.datasetId})`);
    lines.push(`Generated: ${report.generatedAt.toISOString()}`);
    lines.push('');

    lines.push('-'.repeat(80));
    lines.push('OVERALL RESULTS');
    lines.push('-'.repeat(80));
    lines.push(`Overall Success: ${report.overallSuccess ? '✓ PASSED' : '✗ FAILED'}`);
    lines.push(`Total Turns: ${report.totalTurns}`);
    lines.push(`Successful Turns: ${report.successfulTurns}`);
    lines.push(`Failed Turns: ${report.failedTurns}`);
    lines.push('');

    lines.push('-'.repeat(80));
    lines.push('BEHAVIORAL SUMMARY');
    lines.push('-'.repeat(80));
    lines.push(`Planner Accuracy: ${(report.summary.plannerAccuracy * 100).toFixed(1)}%`);
    lines.push(`Tool Correctness: ${(report.summary.toolCorrectness * 100).toFixed(1)}%`);
    lines.push(`Memory Correctness: ${(report.summary.memoryCorrectness * 100).toFixed(1)}%`);
    lines.push(`Routine Correctness: ${(report.summary.routineCorrectness * 100).toFixed(1)}%`);
    lines.push(`Conversation Flow Correctness: ${(report.summary.conversationFlowCorrectness * 100).toFixed(1)}%`);
    lines.push(`Average Latency: ${report.summary.averageLatency.toFixed(0)}ms`);
    lines.push(`Average Token Usage: ${report.summary.averageTokenUsage.toFixed(0)} tokens`);
    lines.push(`Error Rate: ${(report.summary.errorRate * 100).toFixed(1)}%`);
    lines.push('');

    lines.push('-'.repeat(80));
    lines.push('ASSERTIONS');
    lines.push('-'.repeat(80));

    for (const assertion of report.assertions) {
      const status = assertion.passed ? '✓' : '✗';
      const severity = `[${assertion.severity.toUpperCase()}]`;
      lines.push(`${status} ${severity} Turn ${assertion.turn}: ${assertion.assertion}`);
      lines.push(`  Expected: ${JSON.stringify(assertion.expected)}`);
      lines.push(`  Actual: ${JSON.stringify(assertion.actual)}`);
      lines.push(`  Message: ${assertion.message}`);
      lines.push('');
    }

    if (report.regressionComparison) {
      lines.push('-'.repeat(80));
      lines.push('REGRESSION COMPARISON');
      lines.push('-'.repeat(80));
      lines.push(`Baseline Trace ID: ${report.regressionComparison.baselineTraceId}`);
      lines.push(`Current Trace ID: ${report.regressionComparison.currentTraceId}`);
      lines.push('');

      if (report.regressionComparison.plannerChanges.length > 0) {
        lines.push('Planner Changes:');
        for (const change of report.regressionComparison.plannerChanges) {
          lines.push(`  - ${change}`);
        }
        lines.push('');
      }

      if (report.regressionComparison.toolOrderingChanges.length > 0) {
        lines.push('Tool Ordering Changes:');
        for (const change of report.regressionComparison.toolOrderingChanges) {
          lines.push(`  - ${change}`);
        }
        lines.push('');
      }

      if (report.regressionComparison.memoryUsageChanges.length > 0) {
        lines.push('Memory Usage Changes:');
        for (const change of report.regressionComparison.memoryUsageChanges) {
          lines.push(`  - ${change}`);
        }
        lines.push('');
      }

      if (report.regressionComparison.conversationFlowChanges.length > 0) {
        lines.push('Conversation Flow Changes:');
        for (const change of report.regressionComparison.conversationFlowChanges) {
          lines.push(`  - ${change}`);
        }
        lines.push('');
      }

      lines.push(`Latency Regression: ${report.regressionComparison.latencyRegression ? '✗ YES' : '✓ NO'}`);
      lines.push(`Token Usage Regression: ${report.regressionComparison.tokenUsageRegression ? '✗ YES' : '✓ NO'}`);
      lines.push(`Behavior Regression: ${report.regressionComparison.behaviorRegression ? '✗ YES' : '✓ NO'}`);
      lines.push('');
    }

    lines.push('-'.repeat(80));
    lines.push('EXECUTION TRACES');
    lines.push('-'.repeat(80));

    for (const trace of report.traces) {
      lines.push(`Turn ${trace.turnNumber}: ${trace.userMessage}`);
      lines.push(`Response: ${(trace.assistantResponse || '').substring(0, 100)}...`);
      lines.push(`Capability: ${trace.capabilitySelected}`);
      lines.push(`Tools: ${trace.toolCalls.map(tc => tc.name).join(', ') || 'none'}`);
      lines.push(`Latency: ${trace.latency.total}ms`);
      lines.push(`Tokens: ${trace.tokenUsage.total}`);
      if (trace.errors.length > 0) {
        lines.push(`Errors: ${trace.errors.map(e => e.message).join(', ')}`);
      }
      lines.push('');
    }

    lines.push('='.repeat(80));
    lines.push('END OF REPORT');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(report: BehavioralReport): string {
    const passedColor = '#28a745';
    const failedColor = '#dc3545';
    const warningColor = '#ffc107';

    let html = `
<!DOCTYPE html>
<html>
<head>
  <title>Behavioral Validation Report - ${report.datasetName}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .header { background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
    .section { margin-bottom: 30px; }
    .section-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #dee2e6; padding-bottom: 5px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .summary-card { background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #007bff; }
    .summary-card .label { font-size: 12px; color: #6c757d; }
    .summary-card .value { font-size: 24px; font-weight: bold; }
    .assertion { padding: 10px; margin: 5px 0; border-radius: 3px; }
    .assertion.passed { background: #d4edda; border-left: 4px solid ${passedColor}; }
    .assertion.failed { background: #f8d7da; border-left: 4px solid ${failedColor}; }
    .assertion.warning { background: #fff3cd; border-left: 4px solid ${warningColor}; }
    .trace { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; }
    .regression { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 10px 0; }
    .change { padding: 5px; margin: 2px 0; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 12px; font-weight: bold; }
    .badge-success { background: ${passedColor}; color: white; }
    .badge-danger { background: ${failedColor}; color: white; }
    .badge-warning { background: ${warningColor}; color: black; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Behavioral Validation Report</h1>
    <p><strong>Dataset:</strong> ${report.datasetName} (${report.datasetId})</p>
    <p><strong>Generated:</strong> ${report.generatedAt.toISOString()}</p>
    <p><strong>Status:</strong> ${report.overallSuccess 
      ? '<span class="badge badge-success">PASSED</span>' 
      : '<span class="badge badge-danger">FAILED</span>'}</p>
  </div>

  <div class="section">
    <div class="section-title">Overall Results</div>
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Total Turns</div>
        <div class="value">${report.totalTurns}</div>
      </div>
      <div class="summary-card">
        <div class="label">Successful Turns</div>
        <div class="value">${report.successfulTurns}</div>
      </div>
      <div class="summary-card">
        <div class="label">Failed Turns</div>
        <div class="value">${report.failedTurns}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Behavioral Summary</div>
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Planner Accuracy</div>
        <div class="value">${(report.summary.plannerAccuracy * 100).toFixed(1)}%</div>
      </div>
      <div class="summary-card">
        <div class="label">Tool Correctness</div>
        <div class="value">${(report.summary.toolCorrectness * 100).toFixed(1)}%</div>
      </div>
      <div class="summary-card">
        <div class="label">Memory Correctness</div>
        <div class="value">${(report.summary.memoryCorrectness * 100).toFixed(1)}%</div>
      </div>
      <div class="summary-card">
        <div class="label">Conversation Flow</div>
        <div class="value">${(report.summary.conversationFlowCorrectness * 100).toFixed(1)}%</div>
      </div>
      <div class="summary-card">
        <div class="label">Avg Latency</div>
        <div class="value">${report.summary.averageLatency.toFixed(0)}ms</div>
      </div>
      <div class="summary-card">
        <div class="label">Avg Tokens</div>
        <div class="value">${report.summary.averageTokenUsage.toFixed(0)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Error Rate</div>
        <div class="value">${(report.summary.errorRate * 100).toFixed(1)}%</div>
      </div>
    </div>
  </div>
`;

    if (report.regressionComparison) {
      html += `
  <div class="section">
    <div class="section-title">Regression Comparison</div>
    <div class="regression">
      <p><strong>Baseline Trace ID:</strong> ${report.regressionComparison.baselineTraceId}</p>
      <p><strong>Current Trace ID:</strong> ${report.regressionComparison.currentTraceId}</p>
      <p><strong>Latency Regression:</strong> ${report.regressionComparison.latencyRegression 
        ? '<span class="badge badge-danger">YES</span>' 
        : '<span class="badge badge-success">NO</span>'}</p>
      <p><strong>Token Usage Regression:</strong> ${report.regressionComparison.tokenUsageRegression 
        ? '<span class="badge badge-danger">YES</span>' 
        : '<span class="badge badge-success">NO</span>'}</p>
      <p><strong>Behavior Regression:</strong> ${report.regressionComparison.behaviorRegression 
        ? '<span class="badge badge-danger">YES</span>' 
        : '<span class="badge badge-success">NO</span>'}</p>
    </div>
`;
      if (report.regressionComparison.plannerChanges.length > 0) {
        html += '<h3>Planner Changes</h3>';
        for (const change of report.regressionComparison.plannerChanges) {
          html += `<div class="change">- ${change}</div>`;
        }
      }
      if (report.regressionComparison.toolOrderingChanges.length > 0) {
        html += '<h3>Tool Ordering Changes</h3>';
        for (const change of report.regressionComparison.toolOrderingChanges) {
          html += `<div class="change">- ${change}</div>`;
        }
      }
      html += '</div>';
    }

    html += `
  <div class="section">
    <div class="section-title">Assertions</div>
`;

    for (const assertion of report.assertions) {
      const statusClass = assertion.passed ? 'passed' : 'failed';
      html += `
    <div class="assertion ${statusClass}">
      <strong>Turn ${assertion.turn}:</strong> ${assertion.assertion}
      <br><small>Expected: ${JSON.stringify(assertion.expected)}</small>
      <br><small>Actual: ${JSON.stringify(assertion.actual)}</small>
      <br><small>${assertion.message}</small>
    </div>
`;
    }

    html += `
  </div>

  <div class="section">
    <div class="section-title">Execution Traces</div>
`;

    for (const trace of report.traces) {
      html += `
    <div class="trace">
      <strong>Turn ${trace.turnNumber}:</strong> ${trace.userMessage}
      <br><strong>Response:</strong> ${trace.assistantResponse.substring(0, 150)}...
      <br><strong>Capability:</strong> ${trace.capabilitySelected}
      <br><strong>Tools:</strong> ${trace.toolCalls.map(tc => tc.name).join(', ') || 'none'}
      <br><strong>Latency:</strong> ${trace.latency.total}ms
      <br><strong>Tokens:</strong> ${trace.tokenUsage.total}
    </div>
`;
    }

    html += `
  </div>
</body>
</html>
`;

    return html;
  }

  /**
   * Generate summary for multiple reports
   */
  generateBatchSummary(
    reports: Map<string, BehavioralReport & { regressionComparison?: RegressionComparison }>
  ): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push('BEHAVIORAL VALIDATION BATCH SUMMARY');
    lines.push('='.repeat(80));
    lines.push('');

    let totalDatasets = reports.size;
    let passedDatasets = 0;
    let failedDatasets = 0;
    let totalTurns = 0;
    let totalSuccessfulTurns = 0;
    let totalFailedTurns = 0;

    for (const [datasetId, report] of Array.from(reports.entries())) {
      totalTurns += report.totalTurns;
      totalSuccessfulTurns += report.successfulTurns;
      totalFailedTurns += report.failedTurns;

      if (report.overallSuccess) {
        passedDatasets++;
      } else {
        failedDatasets++;
      }

      lines.push(`${report.overallSuccess ? '✓' : '✗'} ${report.datasetName} (${datasetId})`);
      lines.push(`  Turns: ${report.successfulTurns}/${report.totalTurns} passed`);
      lines.push(`  Planner: ${(report.summary.plannerAccuracy * 100).toFixed(1)}%`);
      lines.push(`  Tools: ${(report.summary.toolCorrectness * 100).toFixed(1)}%`);
      lines.push(`  Memory: ${(report.summary.memoryCorrectness * 100).toFixed(1)}%`);
      lines.push(`  Latency: ${report.summary.averageLatency.toFixed(0)}ms`);
      if (report.regressionComparison) {
        lines.push(`  Regression: ${report.regressionComparison.behaviorRegression ? '✗ YES' : '✓ NO'}`);
      }
      lines.push('');
    }

    lines.push('-'.repeat(80));
    lines.push('AGGREGATE STATISTICS');
    lines.push('-'.repeat(80));
    lines.push(`Total Datasets: ${totalDatasets}`);
    lines.push(`Passed Datasets: ${passedDatasets} (${(passedDatasets / totalDatasets * 100).toFixed(1)}%)`);
    lines.push(`Failed Datasets: ${failedDatasets} (${(failedDatasets / totalDatasets * 100).toFixed(1)}%)`);
    lines.push(`Total Turns: ${totalTurns}`);
    lines.push(`Successful Turns: ${totalSuccessfulTurns} (${(totalSuccessfulTurns / totalTurns * 100).toFixed(1)}%)`);
    lines.push(`Failed Turns: ${totalFailedTurns} (${(totalFailedTurns / totalTurns * 100).toFixed(1)}%)`);
    lines.push('');

    lines.push('='.repeat(80));

    return lines.join('\n');
  }
}