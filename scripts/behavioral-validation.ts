#!/usr/bin/env node

/**
 * Behavioral Validation CLI
 * Command-line interface for running behavioral validation tests
 */

import { ConversationReplayEngine } from '../src/lib/validation/replay-engine';
import { RegressionComparisonEngine } from '../src/lib/validation/regression-engine';
import { BehavioralReportGenerator } from '../src/lib/validation/report-generator';
import { GoldenTraceManager } from '../src/lib/validation/golden-trace-manager';
import { allDatasets, datasetsByCategory, getDatasetById, getDatasetsByDifficulty } from '../src/lib/validation/datasets';
import type { ConversationDataset } from '../src/lib/validation/types';

const args = process.argv.slice(2);
const command = args[0];

const reportGenerator = new BehavioralReportGenerator();

async function showHelp() {
  console.log(`
Behavioral Validation CLI

Usage:
  node scripts/behavioral-validation.ts <command> [options]

Commands:
  run [dataset-id]         Run a specific dataset or all datasets
  run-category <category>  Run all datasets in a category
  run-difficulty <level>   Run all datasets of a difficulty level
  create-golden [dataset-id]  Create golden traces for regression testing
  regression [dataset-id]  Run regression test against golden traces
  batch-regression         Run regression tests on all datasets
  golden-list              List all golden traces
  golden-diff <dataset-id> <v1> <v2>  Diff two versions of golden traces
  golden-accept <dataset-id> <reason>  Accept new version as baseline
  golden-cleanup [dataset-id]  Cleanup old golden trace versions
  golden-export [dataset-id]  Export golden traces
  golden-import <file>      Import golden traces
  list                     List all available datasets
  help                     Show this help message

Categories:
  food, shopping, multi_capability, edge_cases

Difficulty Levels:
  basic, intermediate, advanced

Examples:
  node scripts/behavioral-validation.ts run
  node scripts/behavioral-validation.ts run food_basic_biryani
  node scripts/behavioral-validation.ts run-category food
  node scripts/behavioral-validation.ts run-difficulty basic
  node scripts/behavioral-validation.ts create-golden food_basic_biryani
  node scripts/behavioral-validation.ts regression food_basic_biryani
  node scripts/behavioral-validation.ts batch-regression
  node scripts/behavioral-validation.ts list

Options:
  --api-url <url>          Atlas API URL (default: http://localhost:3001)
  --auth-token <token>     Auth token for API
  --format <format>        Report format: text, html, json (default: text)
  --output <path>          Save report to file
`);
}

async function listDatasets() {
  console.log('\nAvailable Datasets:');
  console.log('===================\n');

  for (const category of Object.keys(datasetsByCategory)) {
    console.log(`${category.toUpperCase()}:`);
    for (const dataset of datasetsByCategory[category as keyof typeof datasetsByCategory]) {
      console.log(`  - ${dataset.id}: ${dataset.name}`);
      console.log(`    Tags: ${dataset.tags.join(', ')}`);
      console.log(`    Difficulty: ${dataset.metadata.difficulty}`);
      console.log(`    Turns: ${dataset.turns.length}`);
      console.log('');
    }
  }
}

async function runDataset(
  dataset: ConversationDataset,
  apiUrl?: string,
  authToken?: string,
  format: 'text' | 'html' | 'json' = 'text',
  outputPath?: string
) {
  console.log(`\nRunning dataset: ${dataset.name} (${dataset.id})`);
  console.log('='.repeat(80));

  const replayEngine = new ConversationReplayEngine(apiUrl, authToken);
  await replayEngine.assertServerReachable(apiUrl ?? 'http://localhost:3001');
  const report = await replayEngine.replayConversation(dataset);

  const reportText = reportGenerator.generateDetailedReport(report, format);

  if (outputPath) {
    const fs = await import('fs');
    fs.writeFileSync(outputPath, reportText);
    console.log(`\nReport saved to: ${outputPath}`);
  } else {
    console.log('\n' + reportText);
  }

  return report;
}

async function runAllDatasets(
  datasets: ConversationDataset[],
  apiUrl?: string,
  authToken?: string,
  format: 'text' | 'html' | 'json' = 'text',
  outputPath?: string
) {
  console.log(`\nRunning ${datasets.length} datasets...`);
  console.log('='.repeat(80));

  // Fail fast when the server is unreachable so `run` doesn't hang.
  const probeEngine = new ConversationReplayEngine(apiUrl, authToken);
  await probeEngine.assertServerReachable(apiUrl ?? 'http://localhost:3001');

  const results = new Map();

  for (const dataset of datasets) {
    try {
      const report = await runDataset(dataset, apiUrl, authToken, format);
      results.set(dataset.id, report);
    } catch (error) {
      console.error(`Failed to run dataset ${dataset.id}:`, error);
    }
  }

  const summary = reportGenerator.generateBatchSummary(results);

  if (outputPath) {
    const fs = await import('fs');
    fs.writeFileSync(outputPath, summary);
    console.log(`\nBatch summary saved to: ${outputPath}`);
  } else {
    console.log('\n' + summary);
  }

  return results;
}

async function createGoldenTraces(
  dataset: ConversationDataset,
  apiUrl?: string,
  authToken?: string,
  reason?: string
) {
  console.log(`\nCreating golden traces for: ${dataset.name} (${dataset.id})`);
  console.log('='.repeat(80));

  const regressionEngine = new RegressionComparisonEngine(apiUrl, authToken);
  const report = await regressionEngine.createGoldenTraces(dataset, reason);

  console.log('\nGolden traces created successfully!');
  console.log(`\n${reportGenerator.generateDetailedReport(report, 'text')}`);

  return report;
}

async function runRegression(
  dataset: ConversationDataset,
  apiUrl?: string,
  authToken?: string,
  format: 'text' | 'html' | 'json' = 'text',
  outputPath?: string
) {
  console.log(`\nRunning regression test for: ${dataset.name} (${dataset.id})`);
  console.log('='.repeat(80));

  const regressionEngine = new RegressionComparisonEngine(apiUrl, authToken);
  const report = await regressionEngine.compareAgainstGolden(dataset);

  const reportText = reportGenerator.generateDetailedReport(report, format);

  if (outputPath) {
    const fs = await import('fs');
    fs.writeFileSync(outputPath, reportText);
    console.log(`\nRegression report saved to: ${outputPath}`);
  } else {
    console.log('\n' + reportText);
  }

  return report;
}

async function runBatchRegression(
  datasets: ConversationDataset[],
  apiUrl?: string,
  authToken?: string,
  outputPath?: string
) {
  console.log(`\nRunning batch regression tests for ${datasets.length} datasets...`);
  console.log('='.repeat(80));

  const regressionEngine = new RegressionComparisonEngine(apiUrl, authToken);
  const results = await regressionEngine.batchRegressionTest(datasets);
  const summary = regressionEngine.generateRegressionSummary(results);

  console.log('\n' + JSON.stringify(summary, null, 2));

  if (outputPath) {
    const fs = await import('fs');
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
    console.log(`\nBatch regression summary saved to: ${outputPath}`);
  }

  return summary;
}

function parseOptions(args: string[]): {
  apiUrl?: string;
  authToken?: string;
  format: 'text' | 'html' | 'json';
  outputPath?: string;
  reason?: string;
  storagePath?: string;
} {
  const options: {
    apiUrl?: string;
    authToken?: string;
    format: 'text' | 'html' | 'json';
    outputPath?: string;
    reason?: string;
    storagePath?: string;
  } = {
    format: 'text',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-url' && args[i + 1]) {
      options.apiUrl = args[i + 1];
      i++;
    } else if (args[i] === '--auth-token' && args[i + 1]) {
      options.authToken = args[i + 1];
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      options.format = args[i + 1] as 'text' | 'html' | 'json';
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputPath = args[i + 1];
      i++;
    } else if (args[i] === '--reason' && args[i + 1]) {
      options.reason = args[i + 1];
      i++;
    } else if (args[i] === '--storage-path' && args[i + 1]) {
      options.storagePath = args[i + 1];
      i++;
    }
  }

  return options;
}

async function main() {
  const options = parseOptions(args.slice(1));
  const commandArgs = args.slice(1); // Full args for command-specific parsing

  switch (command) {
    case 'help':
      await showHelp();
      break;

    case 'list':
      await listDatasets();
      break;

    case 'run':
      if (args[1]) {
        const dataset = getDatasetById(args[1]);
        if (dataset) {
          await runDataset(dataset, options.apiUrl, options.authToken, options.format, options.outputPath);
        } else {
          console.error(`Dataset not found: ${args[1]}`);
          await listDatasets();
        }
      } else {
        await runAllDatasets(allDatasets, options.apiUrl, options.authToken, options.format, options.outputPath);
      }
      break;

    case 'run-category':
      if (args[1]) {
        const categoryDatasets = datasetsByCategory[args[1] as keyof typeof datasetsByCategory];
        if (categoryDatasets) {
          await runAllDatasets(categoryDatasets, options.apiUrl, options.authToken, options.format, options.outputPath);
        } else {
          console.error(`Category not found: ${args[1]}`);
          console.log('Available categories:', Object.keys(datasetsByCategory).join(', '));
        }
      } else {
        console.error('Please specify a category');
        await showHelp();
      }
      break;

    case 'run-difficulty':
      if (args[1]) {
        const difficultyDatasets = getDatasetsByDifficulty(args[1] as 'basic' | 'intermediate' | 'advanced');
        if (difficultyDatasets.length > 0) {
          await runAllDatasets(difficultyDatasets, options.apiUrl, options.authToken, options.format, options.outputPath);
        } else {
          console.error(`No datasets found for difficulty: ${args[1]}`);
        }
      } else {
        console.error('Please specify a difficulty level');
        await showHelp();
      }
      break;

    case 'create-golden':
      if (args[1]) {
        const dataset = getDatasetById(args[1]);
        if (dataset) {
          await createGoldenTraces(dataset, options.apiUrl, options.authToken, options.reason);
        } else {
          console.error(`Dataset not found: ${args[1]}`);
          await listDatasets();
        }
      } else {
        console.error('Please specify a dataset ID');
        await showHelp();
      }
      break;

    case 'regression':
      if (args[1]) {
        const dataset = getDatasetById(args[1]);
        if (dataset) {
          await runRegression(dataset, options.apiUrl, options.authToken, options.format, options.outputPath);
        } else {
          console.error(`Dataset not found: ${args[1]}`);
          await listDatasets();
        }
      } else {
        console.error('Please specify a dataset ID');
        await showHelp();
      }
      break;

    case 'batch-regression':
      await runBatchRegression(allDatasets, options.apiUrl, options.authToken, options.outputPath);
      break;

    case 'golden-list':
      const goldenManager = new GoldenTraceManager(options.storagePath);
      const datasets = goldenManager.listDatasets();
      console.log('\nGolden Traces:');
      console.log('==============\n');
      for (const datasetId of datasets) {
        const versions = goldenManager.listVersions(datasetId);
        const latest = goldenManager.getLatestVersion(datasetId);
        console.log(`${datasetId}:`);
        console.log(`  Latest: ${latest || 'none'}`);
        console.log(`  Versions: ${versions.length} (${versions.slice(0, 3).join(', ')}${versions.length > 3 ? '...' : ''})`);
        console.log('');
      }
      break;

    case 'golden-diff':
      if (commandArgs[1] && commandArgs[2] && commandArgs[3]) {
        const goldenManager = new GoldenTraceManager(options.storagePath);
        const diff = await goldenManager.diffVersions(commandArgs[1], commandArgs[2], commandArgs[3]);
        if (diff) {
          console.log(`\nDiff for ${commandArgs[1]}:`);
          console.log(`Version 1: ${diff.version1.version} (${diff.version1.createdAt})`);
          console.log(`Version 2: ${diff.version2.version} (${diff.version2.createdAt})`);
          console.log('\nDifferences:');
          if (diff.differences.length === 0) {
            console.log('  No differences found');
          } else {
            for (const difference of diff.differences) {
              console.log(`  - ${difference}`);
            }
          }
        } else {
          console.error('Failed to load traces for comparison');
        }
      } else {
        console.error('Usage: golden-diff <dataset-id> <version1> <version2>');
        await showHelp();
      }
      break;

    case 'golden-accept':
      if (commandArgs[1] && commandArgs[2]) {
        const regressionEngine = new RegressionComparisonEngine(options.apiUrl, options.authToken, options.storagePath);
        await regressionEngine.acceptNewBaseline(commandArgs[1], commandArgs[2]);
      } else {
        console.error('Usage: golden-accept <dataset-id> <reason>');
        await showHelp();
      }
      break;

    case 'golden-cleanup':
      const cleanupManager = new GoldenTraceManager(options.storagePath);
      if (commandArgs[1]) {
        cleanupManager.cleanupOldVersions(commandArgs[1]);
      } else {
        const allDatasets = cleanupManager.listDatasets();
        for (const datasetId of allDatasets) {
          cleanupManager.cleanupOldVersions(datasetId);
        }
      }
      break;

    case 'golden-export':
      const exportManager = new GoldenTraceManager(options.storagePath);
      const exportFile = await exportManager.export(commandArgs[1]);
      console.log(`Exported to: ${exportFile}`);
      break;

    case 'golden-import':
      if (commandArgs[1]) {
        const importManager = new GoldenTraceManager(options.storagePath);
        await importManager.import(commandArgs[1]);
      } else {
        console.error('Usage: golden-import <file>');
        await showHelp();
      }
      break;

    default:
      console.error(`Unknown command: ${command}`);
      await showHelp();
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});