#!/usr/bin/env node

/**
 * READ-ONLY pre-migration validation: D1 (production) vs PostgreSQL (Cloud SQL).
 *
 * Executes only SELECT / PRAGMA / information_schema queries — never writes.
 * Validates that all 33 Prisma models present in D1 have a matching table in
 * PostgreSQL, that their row counts are captured, and that the PG target is
 * ready (no conflicting pre-existing data for models that will be copied).
 *
 * Usage:
 *   node scripts/validate-d1-to-pg.mjs              # validates and prints report
 *   node scripts/validate-d1-to-pg.mjs --json       # machine-readable JSON report
 *
 * Environment:
 *   DATABASE_URL            PostgreSQL connection string (required)
 *   WRANGLER_D1_ID          optional override; default atlas-db (prod)
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import pg from "pg";

const D1_NAME = process.env.WRANGLER_D1_ID || "atlas-db";
const SQLITE_PATH = path.join(process.cwd(), "dev.db");
const AS_JSON = process.argv.includes("--json");

// The 33 Prisma models expected on both sides (parents-first order mirrors
// scripts/migrate-to-postgres.mjs MODEL_ORDER).
const MODEL_ORDER = [
  "User",
  "Verification",
  "AtlasUser",
  "UserProfile",
  "Credential",
  "Domain",
  "VoiceConfig",
  "Approval",
  "Conversation",
  "WorkflowSession",
  "TurnTrace",
  "LlmLog",
  "ActivityItem",
  "McpServer",
  "McpOAuthClient",
  "Setting",
  "Memory",
  "MemoryEntity",
  "Routine",
  "RoutineObservation",
  "Execution",
  "Capability",
  "Integration",
  "Session",
  "Account",
  "ModelConfig",
  "RoutingRule",
  "Message",
  "MemoryRelation",
  "ExecutionEvent",
  "IntegrationCapability",
  "IntegrationConfig",
  "UserConnection",
];

function d1(sql) {
  return execFileSync("npx", ["--no-install", "wrangler", "d1", "execute", D1_NAME, "--remote", "--json", "--command", sql], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function d1Results(sql) {
  return JSON.parse(d1(sql));
}

function d1Rows(sql) {
  const out = d1Results(sql);
  const flat = [];
  for (const entry of out) if (entry?.results) flat.push(...entry.results);
  return flat;
}

async function pgQuery(client, sql) {
  const res = await client.query(sql);
  return res.rows;
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    d1Database: D1_NAME,
    postgresUrl: process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]*@/, ":****@") : "(unset)",
    models: [],
    d1ExtraTables: [],
    pgMissingModels: [],
    verdict: "pending",
    d1Summarized: false,
  };

  // ---- D1 side (read-only) ----
  // D1 table list (single statement)
  const d1TableEntries = d1Results(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY name;"
  );
  const d1Tables = d1TableEntries.flatMap((e) => e.results || []).map((r) => r.name);

  report.d1ExtraTables = d1Tables.filter(
    (t) => !MODEL_ORDER.includes(t) && !t.startsWith("_") && t !== "_cf_KV"
  );

  // Implicit m2m tables on D1
  const d1JoinTables = d1Tables.filter((t) => t.startsWith("_")).filter((t) => t !== "_cf_KV");
  report.d1JoinTables = d1JoinTables;

  // Row counts per model — sent as one multi-statement command (D1 rejects
// compound SELECTs with too many terms).
  const countEntries = d1Results(
    MODEL_ORDER.map((m) => `SELECT '${m}' AS model, COUNT(*) AS n FROM "${m}"`).join(";")
  );
  const d1Counts = {};
  for (const entry of countEntries) {
    for (const r of entry.results || []) d1Counts[r.model] = Number(r.n);
  }

  // Column sets per model — all PRAGMAs in one multi-statement command.
  const columnSets = {};
  const pragmaEntries = d1Results(MODEL_ORDER.map((t) => `PRAGMA table_info("${t}")`).join(";"));
  pragmaEntries.forEach((entry, idx) => {
    columnSets[MODEL_ORDER[idx]] = (entry.results || []).map((c) => c.name);
  });

  if (d1Results("SELECT 1").every((b) => b.success)) {
    report.d1Summarized = true;
  }

  // ---- PostgreSQL side (read-only) ----
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  return client.connect().then(async () => {
    const pgTables = await pgQuery(
      client,
      `SELECT tablename FROM pg_catalog.pg_tables
       WHERE schemaname IN ('public')
       ORDER BY tablename;`
    ).then((rows) => rows.map((r) => r.tablename));

    report.pgMissingModels = MODEL_ORDER.filter((m) => !pgTables.includes(m));

    // PG row counts
    const pgCounts = {};
    for (const m of MODEL_ORDER) {
      if (pgTables.includes(m)) {
        try {
          const [r] = await pgQuery(client, `SELECT COUNT(*) AS n FROM "${m}"`);
          pgCounts[m] = Number(r.n);
        } catch (err) {
          pgCounts[m] = `ERR:${String(err.message).slice(0, 60)}`;
        }
      }
    }

    // PG column sets
    const pgColumns = {};
    for (const m of MODEL_ORDER) {
      if (!pgTables.includes(m)) continue;
      const cols = await pgQuery(
        client,
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = '${m}'
         ORDER BY ordinal_position;`
      ).then((rows) => rows.map((r) => r.column_name));
      pgColumns[m] = cols;
    }

    // Compare column parity (report-only; do not fail on expected diffs)
    const columnParity = {};
    for (const m of MODEL_ORDER) {
      const src = (columnSets[m] || []).sort();
      const dst = (pgColumns[m] || []).sort();
      const missingInPg = src.filter((c) => !dst.includes(c));
      const extraInPg = dst.filter((c) => !src.includes(c));
      columnParity[m] = { sourceCount: src.length, pgCount: dst.length, missingInPg, extraInPg };
      report.models.push({
        model: m,
        d1Rows: d1Counts[m] ?? 0,
        pgRows: pgCounts[m] ?? 0,
        columnParity: columnParity[m],
        ready: d1Counts[m] > 0 ? pgCounts[m] === 0 : true,
      });
    }

    // PG recognize join tables
    const pgJoin = await pgQuery(
      client,
      `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND position('_' in tablename)=1 AND tablename != '_prisma_migrations'`
    ).then((rows) => rows.map((r) => r.tablename));
    report.pgJoinTables = pgJoin;

    // Report on join-table readiness too
    report.joinTableState = {
      d1: d1JoinTables,
      pg: pgJoin,
      note: d1JoinTables.map((t) => {
        const pgNames = t.toLowerCase().split("_").slice(1).map((x) => x);
        return { d1Table: t, presentInPg: pgJoin.includes(t.toLowerCase()) };
      }),
    };

    client.end();

    report.verdict =
      report.pgMissingModels.length === 0 &&
      report.models.every((m) => m.ready === undefined || m.ready)
        ? "OK"
        : "CHECK_REQUIRED";
    if (d1Results("SELECT 1").every((b) => b.success)) {
      report.d1Summarized = true;
    }

    if (AS_JSON) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.verdict === "OK" ? 0 : 1);
    }

    // Human-readable
    console.log(`D1 database : ${report.d1Database}`);
    console.log(`PostgreSQL   : ${report.postgresUrl}`);
    console.log(`\nModel-by-model (D1 rows -> PG rows):`);
    for (const m of report.models) {
      const badge = m.ready ? (m.d1Rows === 0 ? "skip  " : "ready ") : "CONFLICT";
      console.log(
        `  ${badge} ${m.model.padEnd(22)} d1=${String(m.d1Rows).padStart(6)} pg=${String(m.pgRows).padStart(6)}`
      );
    }
    if (report.pgMissingModels.length) {
      console.log(`\nWARN: PG missing tables for models: ${report.pgMissingModels.join(", ")}`);
    }
    if (d1JoinTables.length) {
      console.log(`\nImplicit m2m tables on D1: ${d1JoinTables.join(", ")}`);
      console.log(`  present in PG: ${d1JoinTables.map((t) => `${t}=${report.joinTableState.note.find((n) => n.d1Table === t)?.presentInPg}`).join(", ")}`);
    }
    console.log(`\nVerdict: ${report.verdict}`);
    process.exit(report.verdict === "OK" ? 0 : 1);
  }).catch((err) => {
    console.error("Validation failed:", err.message);
    process.exit(2);
  });
}

main();