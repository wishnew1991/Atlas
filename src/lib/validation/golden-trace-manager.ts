/**
 * Golden Trace Management System
 * Manages versioned golden traces for regression testing
 */

import fs from 'fs';
import path from 'path';
import type { ExecutionTrace, ConversationDataset } from './types';

export interface GoldenTraceVersion {
  version: string;
  createdAt: string;
  datasetId: string;
  datasetName: string;
  traces: ExecutionTrace[];
  metadata: {
    author: string;
    commit: string;
    branch: string;
    reason?: string;
  };
}

export class GoldenTraceManager {
  private storagePath: string;
  private currentVersion: string;

  constructor(storagePath: string = './golden-traces') {
    this.storagePath = storagePath;
    this.currentVersion = this.generateVersion();
    this.ensureStorageDirectory();
  }

  /**
   * Ensure storage directory exists
   */
  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * Generate version identifier
   */
  private generateVersion(): string {
    const now = new Date();
    return `v${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
  }

  /**
   * Store golden traces for a dataset
   */
  async storeGoldenTraces(
    dataset: ConversationDataset,
    traces: ExecutionTrace[],
    metadata: Partial<GoldenTraceVersion['metadata']> = {}
  ): Promise<string> {
    const version: GoldenTraceVersion = {
      version: this.currentVersion,
      createdAt: new Date().toISOString(),
      datasetId: dataset.id,
      datasetName: dataset.name,
      traces,
      metadata: {
        author: metadata.author || process.env.USER || 'unknown',
        commit: metadata.commit || this.getCurrentGitCommit(),
        branch: metadata.branch || this.getCurrentGitBranch(),
        reason: metadata.reason,
      },
    };

    const versionPath = path.join(this.storagePath, this.currentVersion);
    if (!fs.existsSync(versionPath)) {
      fs.mkdirSync(versionPath, { recursive: true });
    }

    const filePath = path.join(versionPath, `${dataset.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(version, null, 2));

    // Update latest pointer
    this.updateLatestPointer(dataset.id, this.currentVersion);

    console.log(`Stored golden traces for ${dataset.id} at version ${this.currentVersion}`);
    return this.currentVersion;
  }

  /**
   * Retrieve golden traces for a dataset
   */
  async getGoldenTraces(
    datasetId: string,
    version?: string
  ): Promise<GoldenTraceVersion | null> {
    const targetVersion = version || this.getLatestVersion(datasetId);
    
    if (!targetVersion) {
      return null;
    }

    const filePath = path.join(this.storagePath, targetVersion, `${datasetId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Get latest version for a dataset
   */
  getLatestVersion(datasetId: string): string | null {
    const pointerPath = path.join(this.storagePath, `latest-${datasetId}.txt`);
    
    if (!fs.existsSync(pointerPath)) {
      return null;
    }

    return fs.readFileSync(pointerPath, 'utf-8').trim();
  }

  /**
   * Update latest version pointer
   */
  private updateLatestPointer(datasetId: string, version: string): void {
    const pointerPath = path.join(this.storagePath, `latest-${datasetId}.txt`);
    fs.writeFileSync(pointerPath, version);
  }

  /**
   * List all versions for a dataset
   */
  listVersions(datasetId: string): string[] {
    const versions: string[] = [];
    
    if (!fs.existsSync(this.storagePath)) {
      return versions;
    }

    const directories = fs.readdirSync(this.storagePath);
    
    for (const dir of directories) {
      const filePath = path.join(this.storagePath, dir, `${datasetId}.json`);
      if (fs.existsSync(filePath)) {
        versions.push(dir);
      }
    }

    return versions.sort().reverse();
  }

  /**
   * List all datasets with golden traces
   */
  listDatasets(): string[] {
    const datasets = new Set<string>();
    
    if (!fs.existsSync(this.storagePath)) {
      return [];
    }

    const directories = fs.readdirSync(this.storagePath);
    
    for (const dir of directories) {
      const dirPath = path.join(this.storagePath, dir);
      if (fs.statSync(dirPath).isDirectory()) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            datasets.add(file.replace('.json', ''));
          }
        }
      }
    }

    return Array.from(datasets).sort();
  }

  /**
   * Diff two versions of golden traces
   */
  async diffVersions(
    datasetId: string,
    version1: string,
    version2: string
  ): Promise<{
    version1: GoldenTraceVersion;
    version2: GoldenTraceVersion;
    differences: string[];
  } | null> {
    const trace1 = await this.getGoldenTraces(datasetId, version1);
    const trace2 = await this.getGoldenTraces(datasetId, version2);

    if (!trace1 || !trace2) {
      return null;
    }

    const differences: string[] = [];

    // Compare trace counts
    if (trace1.traces.length !== trace2.traces.length) {
      differences.push(`Trace count changed: ${trace1.traces.length} -> ${trace2.traces.length}`);
    }

    // Compare each trace
    const maxTraces = Math.max(trace1.traces.length, trace2.traces.length);
    for (let i = 0; i < maxTraces; i++) {
      const t1 = trace1.traces[i];
      const t2 = trace2.traces[i];

      if (!t1 || !t2) {
        differences.push(`Turn ${i}: Trace missing in one version`);
        continue;
      }

      // Compare planner decisions
      if (t1.plannerDecision.capability !== t2.plannerDecision.capability) {
        differences.push(`Turn ${i}: Capability changed from ${t1.plannerDecision.capability} to ${t2.plannerDecision.capability}`);
      }

      // Compare tool calls
      const tools1 = t1.toolCalls.map(tc => tc.name);
      const tools2 = t2.toolCalls.map(tc => tc.name);
      if (JSON.stringify(tools1) !== JSON.stringify(tools2)) {
        differences.push(`Turn ${i}: Tool calls changed from [${tools1.join(', ')}] to [${tools2.join(', ')}]`);
      }

      // Compare memory operations
      const mem1 = t1.memoryRetrieved.length + t1.memoryStored.length;
      const mem2 = t2.memoryRetrieved.length + t2.memoryStored.length;
      if (mem1 !== mem2) {
        differences.push(`Turn ${i}: Memory operations changed from ${mem1} to ${mem2}`);
      }

      // Compare latency
      const latencyChange = ((t2.latency.total - t1.latency.total) / t1.latency.total) * 100;
      if (Math.abs(latencyChange) > 20) {
        differences.push(`Turn ${i}: Latency changed by ${latencyChange.toFixed(1)}% (${t1.latency.total}ms -> ${t2.latency.total}ms)`);
      }
    }

    return {
      version1: trace1,
      version2: trace2,
      differences,
    };
  }

  /**
   * Accept new version as baseline
   */
  async acceptNewBaseline(
    datasetId: string,
    reason: string,
    author?: string
  ): Promise<void> {
    const latest = this.getLatestVersion(datasetId);
    if (!latest) {
      throw new Error(`No golden traces found for dataset ${datasetId}`);
    }

    const trace = await this.getGoldenTraces(datasetId, latest);
    if (!trace) {
      throw new Error(`Failed to load traces for dataset ${datasetId}`);
    }

    // Create new version with acceptance metadata
    const newVersion = this.generateVersion();
    trace.version = newVersion;
    trace.metadata.reason = reason;
    trace.metadata.author = author || process.env.USER || 'unknown';
    trace.metadata.commit = this.getCurrentGitCommit();
    trace.metadata.branch = this.getCurrentGitBranch();

    const versionPath = path.join(this.storagePath, newVersion);
    if (!fs.existsSync(versionPath)) {
      fs.mkdirSync(versionPath, { recursive: true });
    }

    const filePath = path.join(versionPath, `${datasetId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(trace, null, 2));

    this.updateLatestPointer(datasetId, newVersion);

    console.log(`Accepted new baseline for ${datasetId} at version ${newVersion}`);
  }

  /**
   * Get current git commit
   */
  private getCurrentGitCommit(): string {
    try {
      const result = require('child_process').execSync('git rev-parse HEAD', { encoding: 'utf-8' });
      return result.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get current git branch
   */
  private getCurrentGitBranch(): string {
    try {
      const result = require('child_process').execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' });
      return result.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Cleanup old versions (keep last N versions)
   */
  cleanupOldVersions(datasetId: string, keepCount: number = 5): void {
    const versions = this.listVersions(datasetId);
    
    if (versions.length <= keepCount) {
      return;
    }

    const versionsToDelete = versions.slice(keepCount);
    
    for (const version of versionsToDelete) {
      const filePath = path.join(this.storagePath, version, `${datasetId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Clean up empty directories
      const dirPath = path.join(this.storagePath, version);
      try {
        if (fs.readdirSync(dirPath).length === 0) {
          fs.rmdirSync(dirPath);
        }
      } catch {
        // Directory not empty, skip
      }
    }

    console.log(`Cleaned up ${versionsToDelete.length} old versions for ${datasetId}`);
  }

  /**
   * Export golden traces for backup
   */
  async export(datasetId?: string): Promise<string> {
    const exportPath = path.join(this.storagePath, 'export');
    
    if (!fs.existsSync(exportPath)) {
      fs.mkdirSync(exportPath, { recursive: true });
    }

    const datasets = datasetId ? [datasetId] : this.listDatasets();
    const exportData: Record<string, GoldenTraceVersion[]> = {};

    for (const dsId of datasets) {
      const latest = this.getLatestVersion(dsId);
      if (latest) {
        const trace = await this.getGoldenTraces(dsId, latest);
        if (trace) {
          if (!exportData[dsId]) {
            exportData[dsId] = [];
          }
          exportData[dsId].push(trace);
        }
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportFile = path.join(exportPath, `golden-traces-${timestamp}.json`);
    fs.writeFileSync(exportFile, JSON.stringify(exportData, null, 2));

    console.log(`Exported golden traces to ${exportFile}`);
    return exportFile;
  }

  /**
   * Import golden traces from backup
   */
  async import(exportFile: string): Promise<void> {
    if (!fs.existsSync(exportFile)) {
      throw new Error(`Export file not found: ${exportFile}`);
    }

    const content = fs.readFileSync(exportFile, 'utf-8');
    const data = JSON.parse(content);

    for (const [datasetId, traces] of Object.entries(data)) {
      for (const trace of traces as GoldenTraceVersion[]) {
        const versionPath = path.join(this.storagePath, trace.version);
        if (!fs.existsSync(versionPath)) {
          fs.mkdirSync(versionPath, { recursive: true });
        }

        const filePath = path.join(versionPath, `${datasetId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(trace, null, 2));

        this.updateLatestPointer(datasetId, trace.version);
      }
    }

    console.log(`Imported golden traces from ${exportFile}`);
  }
}