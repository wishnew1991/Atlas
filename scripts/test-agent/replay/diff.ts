import type { ConversationTrace, TurnTraceEntry } from "./types";

// ── Normalization ──

export function normalizeTrace(trace: ConversationTrace): ConversationTrace {
  return {
    ...trace,
    startedAt: "<stripped>",
    completedAt: "<stripped>",
    totalLatencyMs: 0,
    turns: trace.turns.map(normalizeTurn),
  };
}

function normalizeTurn(turn: TurnTraceEntry): TurnTraceEntry {
  return {
    ...turn,
    executionId: turn.executionId ? "<stripped>" : undefined,
    conversationId: turn.conversationId ? "<stripped>" : undefined,
    latencyMs: 0,
    reply: normalizeText(turn.reply),
    tokensIn: undefined,
    tokensOut: undefined,
  };
}

export function normalizeText(text: string): string {
  return text
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*?Z?/g, "<timestamp>")
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "<uuid>")
    .replace(/\bexec_[a-zA-Z0-9_-]+\b/g, "<execid>")
    .replace(/\brun_[a-zA-Z0-9_-]+\b/g, "<runid>")
    .replace(/\bconv_[a-zA-Z0-9_-]+\b/g, "<convid>")
    .replace(/\bapproval_[a-zA-Z0-9_-]+\b/g, "<apprid>")
    .replace(/(\d+ms)/g, "<duration>")
    .replace(/(₹[\d,]+)/g, "<price>")
    .replace(/\d{1,3}(?:[.,]\d{1,2})?\s*(?:km|mins?|minutes?)/gi, "<distance/duration>")
    .replace(/\b\d{10,13}\b/g, "<timestamp_ms>")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Comparison Policies ──

export type ComparisonPolicy = "exact" | "fuzzy" | "ordered" | "unordered" | "ignore";

interface FieldConfig {
  policy: ComparisonPolicy;
  fuzzyThreshold?: number; // for "fuzzy": minimum Levenshtein ratio (0-1)
}

const FIELD_POLICIES: Record<string, FieldConfig> = {
  user: { policy: "exact" },
  reply: { policy: "fuzzy", fuzzyThreshold: 0.70 },
  toolsUsed: { policy: "unordered" },
  action: { policy: "ignore" },
  capability: { policy: "unordered" },
  assertions: { policy: "ignore" },
  error: { policy: "exact" },
};

// ── Regression Categories ──

export type RegressionCategory =
  | "planner_change"
  | "capability_switch"
  | "tool_added"
  | "tool_removed"
  | "tool_reorder"
  | "reply_divergence"
  | "reply_disappeared"
  | "latency_spike"
  | "error_introduced"
  | "error_resolved"
  | "no_change";

export interface Regression {
  category: RegressionCategory;
  severity: "critical" | "warning" | "info";
  turnIndex: number;
  field: string;
  baseline: string;
  current: string;
  detail: string;
}

// ── Fuzzy Text Comparison ──

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;

  const dp: number[] = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= lb; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(dp[j], dp[j - 1], prev) + 1;
      prev = temp;
    }
  }
  return 1 - dp[lb] / Math.max(la, lb);
}

// ── Diff Engine ──

export interface DiffReport {
  baseline: string;
  current: string;
  turnCount: { baseline: number; current: number; match: boolean };
  regressions: Regression[];
  summary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
    verdict: "pass" | "warning" | "fail";
  };
}

export function diffTraces(
  baseline: ConversationTrace,
  current: ConversationTrace
): DiffReport {
  const base = normalizeTrace(baseline);
  const curr = normalizeTrace(current);
  const regressions: Regression[] = [];

  const maxTurns = Math.max(base.turns.length, curr.turns.length);

  for (let i = 0; i < maxTurns; i++) {
    const baseTurn = base.turns[i];
    const currTurn = curr.turns[i];

    if (!baseTurn) {
      regressions.push({
        category: "no_change",
        severity: "info",
        turnIndex: i,
        field: "turn",
        baseline: "(none)",
        current: currTurn.user,
        detail: "New turn added in current trace",
      });
      continue;
    }

    if (!currTurn) {
      regressions.push({
        category: "no_change",
        severity: "warning",
        turnIndex: i,
        field: "turn",
        baseline: baseTurn.user,
        current: "(none)",
        detail: "Turn removed from current trace",
      });
      continue;
    }

    for (const [field, config] of Object.entries(FIELD_POLICIES)) {
      const baseVal = (baseTurn as unknown as Record<string, unknown>)[field];
      const currVal = (currTurn as unknown as Record<string, unknown>)[field];

      const reg = compareValues(
        field,
        baseVal,
        currVal,
        config,
        i,
        baseTurn,
        currTurn
      );
      if (reg) regressions.push(...reg);
    }
  }

  const critical = regressions.filter((r) => r.severity === "critical").length;
  const warning = regressions.filter((r) => r.severity === "warning").length;
  const info = regressions.filter((r) => r.severity === "info").length;

  return {
    baseline: baseline.dataset,
    current: current.dataset,
    turnCount: {
      baseline: baseline.turns.length,
      current: current.turns.length,
      match: baseline.turns.length === current.turns.length,
    },
    regressions,
    summary: {
      critical,
      warning,
      info,
      total: regressions.length,
      verdict: critical > 0 ? "fail" : warning > 0 ? "warning" : "pass",
    },
  };
}

function compareValues(
  field: string,
  baseVal: unknown,
  currVal: unknown,
  config: FieldConfig,
  turnIndex: number,
  baseTurn: TurnTraceEntry,
  currTurn: TurnTraceEntry
): Regression[] | null {
  if (config.policy === "ignore") return null;

  const bStr = String(baseVal ?? "");
  const cStr = String(currVal ?? "");

  if (bStr === cStr) return null;

  switch (config.policy) {
    case "exact":
      return [{
        category: classifyRegression(field, baseVal, currVal),
        severity: classifySeverity(field),
        turnIndex,
        field,
        baseline: bStr.slice(0, 120),
        current: cStr.slice(0, 120),
        detail: `${field} changed from "${bStr.slice(0, 60)}" to "${cStr.slice(0, 60)}"`,
      }];

    case "fuzzy": {
      const ratio = levenshteinRatio(bStr, cStr);
      const threshold = config.fuzzyThreshold ?? 0.70;
      if (ratio >= threshold) return null;

      const category =
        cStr.length === 0 ? "reply_disappeared" :
        bStr.length === 0 ? "no_change" :
        "reply_divergence";

      return [{
        category,
        severity: category === "reply_disappeared" ? "critical" : "warning",
        turnIndex,
        field,
        baseline: bStr.slice(0, 120),
        current: cStr.slice(0, 120),
        detail: `${field} diverged (similarity: ${(ratio * 100).toFixed(0)}%, threshold: ${(threshold * 100).toFixed(0)}%)`,
      }];
    }

    case "unordered": {
      const baseSet = new Set(
        Array.isArray(baseVal) ? (baseVal as string[]).sort() : []
      );
      const currSet = new Set(
        Array.isArray(currVal) ? (currVal as string[]).sort() : []
      );

      const onlyInBase = Array.from(baseSet).filter((x) => !currSet.has(x));
      const onlyInCurr = Array.from(currSet).filter((x) => !baseSet.has(x));

      if (onlyInBase.length === 0 && onlyInCurr.length === 0) return null;

      const regs: Regression[] = [];
      for (const item of onlyInBase) {
        regs.push({
          category: "tool_removed",
          severity: "warning",
          turnIndex,
          field,
          baseline: item,
          current: "(missing)",
          detail: `"${item}" was in baseline but missing in current`,
        });
      }
      for (const item of onlyInCurr) {
        regs.push({
          category: "tool_added",
          severity: "warning",
          turnIndex,
          field,
          baseline: "(missing)",
          current: item,
          detail: `"${item}" is new in current (was not in baseline)`,
        });
      }
      return regs.length > 0 ? regs : null;
    }

    case "ordered": {
      const baseArr = (Array.isArray(baseVal) ? baseVal : []) as string[];
      const currArr = (Array.isArray(currVal) ? currVal : []) as string[];
      if (baseArr.join(",") === currArr.join(",")) return null;

      const added = currArr.filter((x) => !baseArr.includes(x));
      const removed = baseArr.filter((x) => !currArr.includes(x));

      if (added.length > 0 || removed.length > 0) {
        const regs: Regression[] = [];
        for (const item of added) regs.push({
          category: "tool_added", severity: "warning", turnIndex, field,
          baseline: "(missing)", current: item,
          detail: `"${item}" added in current`,
        });
        for (const item of removed) regs.push({
          category: "tool_removed", severity: "warning", turnIndex, field,
          baseline: item, current: "(missing)",
          detail: `"${item}" removed in current`,
        });
        return regs;
      }

      return [{
        category: "tool_reorder",
        severity: "warning",
        turnIndex,
        field,
        baseline: baseArr.join(", "),
        current: currArr.join(", "),
        detail: "Tool order changed",
      }];
    }

    default:
      return null;
  }
}

function classifyRegression(
  field: string,
  _baseVal: unknown,
  currVal: unknown
): RegressionCategory {
  if (field === "capability") return "capability_switch";
  if (field === "error") {
    return String(currVal ?? "").length > 0 ? "error_introduced" : "error_resolved";
  }
  if (field === "toolsUsed") return "tool_removed";
  return "planner_change";
}

function classifySeverity(field: string): Regression["severity"] {
  if (field === "capability") return "critical";
  if (field === "error") return "critical";
  if (field === "reply") return "warning";
  return "info";
}

// ── Golden Trace Store ──

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export function storeGoldenTrace(
  trace: ConversationTrace,
  dir: string
): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${trace.dataset.replace(/[^a-zA-Z0-9_-]/g, "_")}.trace.json`);
  writeFileSync(path, JSON.stringify(trace, null, 2));
}

export function loadGoldenTrace(
  datasetName: string,
  dir: string
): ConversationTrace | null {
  const path = join(dir, `${datasetName.replace(/[^a-zA-Z0-9_-]/g, "_")}.trace.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

// ── Batch Diff ──

export function batchDiffTraces(
  baselineDir: string,
  currentTracings: ConversationTrace[]
): DiffReport[] {
  return currentTracings.map((current) => {
    const baseline = loadGoldenTrace(current.dataset, baselineDir);
    if (!baseline) {
      return {
        baseline: "(none)",
        current: current.dataset,
        turnCount: { baseline: 0, current: current.turns.length, match: false },
        regressions: [],
        summary: { critical: 0, warning: 0, info: 0, total: 0, verdict: "pass" },
      };
    }
    return diffTraces(baseline, current);
  });
}

// ── Report Generator ──

export function generateDiffSummary(reports: DiffReport[]): string {
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════");
  lines.push("  Behavioral Regression Report");
  lines.push("═══════════════════════════════════════════");
  lines.push("");

  let totalCritical = 0;
  let totalWarning = 0;

  for (const report of reports) {
    const icon = report.summary.verdict === "pass" ? "✓" :
                 report.summary.verdict === "warning" ? "⚠" : "✗";
    lines.push(`  ${icon} ${report.baseline}`);
    lines.push(`    Turns: ${report.turnCount.baseline} → ${report.turnCount.current} ${report.turnCount.match ? "" : "(mismatch)"}`);
    if (report.regressions.length > 0) {
      lines.push(`    Regressions: ${report.summary.critical}C ${report.summary.warning}W ${report.summary.info}I`);
      for (const reg of report.regressions) {
        const s = reg.severity === "critical" ? "✗" : reg.severity === "warning" ? "⚠" : "ℹ";
        lines.push(`      ${s} [${reg.category}] turn #${reg.turnIndex} ${reg.field}: ${reg.detail}`);
      }
    }
    lines.push("");
    totalCritical += report.summary.critical;
    totalWarning += report.summary.warning;
  }

  lines.push("───────────────────────────────────────────");
  lines.push(`  Total: ${totalCritical} critical, ${totalWarning} warnings`);
  lines.push(`  Verdict: ${totalCritical > 0 ? "FAIL" : totalWarning > 0 ? "WARN" : "PASS"}`);
  lines.push("═══════════════════════════════════════════");

  return lines.join("\n");
}
