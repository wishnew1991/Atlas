#!/usr/bin/env node

/**
 * Selective config-only migration from local SQLite (dev.db) to PostgreSQL.
 *
 * Copies ONLY production config + the admin identity so Atlas keeps working on
 * the GCP test deployment for real. Discarded on purpose (runtime/test state):
 *   Session, Verification, AtlasUser, UserProfile, Approval, Conversation,
 *   WorkflowSession, TurnTrace, LlmLog, ActivityItem, McpServer, McpOAuthClient,
 *   Memory, MemoryEntity, Routine, RoutineObservation, Execution, Message,
 *   MemoryRelation, ExecutionEvent, UserConnection, plus all non-admin User/Account.
 *
 * Preserved (IDs + relationships intact):
 *   Integration, Capability, IntegrationCapability, IntegrationConfig,
 *   Credential, ModelConfig, RoutingRule, Setting, Domain, VoiceConfig,
 *   and the single admin User + its Account.
 *
 * Idempotent: writes use per-row `ON CONFLICT DO UPDATE`, so re-running (or a
 * target that already contains seeded rows, e.g. the 5 built-in Domains or the
 * singleton VoiceConfig) converges to the source values instead of erroring.
 *
 * Usage:
 *   node scripts/migrate-config-to-postgres.mjs              # write to $DATABASE_URL
 *   node scripts/migrate-config-to-postgres.mjs --dry-run    # report only, no writes
 *
 * --dry-run prints the exact rows to be copied, dependency order, and
 * source-vs-target counts. PG is read-only in dry-run mode and only used if
 * DATABASE_URL is set (it becomes optional).
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import pg from "pg";

const SQLITE_PATH = path.join(process.cwd(), "dev.db");
const DRY_RUN = process.argv.includes("--dry-run");

// The single Atlas admin identity (from D1 auth bootstrapping).
const ADMIN_USER_ID = "6dZFB461PBduB32YyDsv8mJgsMuprFkm";

// Parents first so FK constraints hold during bulk inserts.
const MODEL_ORDER = [
  // Leaves (no FK to an Atlas model)
  "Credential",
  "Capability",
  "Integration",
  "Domain",
  "VoiceConfig",
  "Setting",
  "User", // only the admin user, filtered below
  // FK dependents
  "ModelConfig", // -> Credential
  "RoutingRule", // -> ModelConfig
  "IntegrationCapability", // -> Integration, Capability
  "IntegrationConfig", // -> Integration
  "Account", // -> User
];

// Row filters per model. Rows not matching a predicate are reported as discarded.
const KEEP = {
  User: (row) => row.id === ADMIN_USER_ID,
  Account: (row) => row.userId === ADMIN_USER_ID,
};

// Human labels for the discarded categories, for the summary.
const DISCARD_NOTES = {
  User: "non-admin users",
  Account: "non-admin accounts",
};

// Unique conflict key per model, used for ON CONFLICT.
const CONFLICT_KEY = {
  Setting: "key",
  Domain: "slug",
  VoiceConfig: "id",
};

async function main() {
  if (!fs.existsSync(SQLITE_PATH)) {
    console.log(`No SQLite database found at ${SQLITE_PATH}. Nothing to migrate.`);
    return;
  }

  const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });

  let client = null;
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
  } else if (!DRY_RUN) {
    throw new Error("DATABASE_URL must be set to migrate (or pass --dry-run).");
  } else {
    console.log("DATABASE_URL not set — target counts will be marked 'n/a'.");
  }

  console.log(`SQLite database found at ${SQLITE_PATH}.`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (read-only, no writes)" : "MIGRATE (writes to DATABASE_URL)"}`);
  console.log("");

  const keptRows = {};
  const discarded = {};

  try {
    // ---- Read + filter source rows ----
    for (const model of MODEL_ORDER) {
      const all = sqlite.prepare(`SELECT * FROM "${model}"`).all();
      const keep = KEEP[model] ? all.filter(KEEP[model]) : all;
      const dropCount = all.length - keep.length;

      keptRows[model] = keep;
      if (dropCount > 0) {
        discarded[model] = {
          count: dropCount,
          note: DISCARD_NOTES[model] || "rows not in preserved set",
        };
      }

      console.log(`  ${model}: ${all.length} source row(s)`);
      if (dropCount > 0) {
        console.log(`      └ discarded ${dropCount} (${discarded[model].note})`);
      }
    }

    console.log("");

    // ---- Per-table detail: exact rows to be copied ----
    for (const model of MODEL_ORDER) {
      const rows = keptRows[model];
      if (rows.length === 0) {
        console.log(`  · ${model}: 0 rows preserved`);
        continue;
      }
      console.log(`  · ${model} (${rows.length}):`);
      for (const row of rows) {
        console.log(`      - ${summarize(model, row)}`);
      }
    }

    console.log("");

    // ---- Target (PG) state, read-only ----
    console.log("TARGET COUNTS (existing PostgreSQL rows):");
    if (client === null) {
      for (const model of MODEL_ORDER) {
        console.log(`  ${model}: n/a (DATABASE_URL not set)`);
      }
    } else {
      for (const model of MODEL_ORDER) {
        const res = await client.query(`SELECT COUNT(*) AS n FROM "${model}"`);
        const existing = Number(res.rows[0].n);
        const incoming = keptRows[model].length;
        const flag = existing > 0 && incoming > 0 ? "  <-- target not empty for this table" : "";
        console.log(`  ${model}: ${existing} existing | ${incoming} incoming${flag}`);
      }
    }

    // ---- Discard summary ----
    const discardedTotal = Object.values(discarded).reduce((a, d) => a + d.count, 0);
    const preservedTotal = Object.values(keptRows).reduce((a, r) => a + r.length, 0);
    console.log("");
    console.log("SUMMARY");
    console.log(`  Preserved rows: ${preservedTotal}`);
    console.log(`  Discarded rows: ${discardedTotal}`);
    if (discardedTotal > 0) {
      console.log("  Discarded breakdown:");
      for (const [model, d] of Object.entries(discarded)) {
        console.log(`    ${model}: ${d.count} (${d.note})`);
      }
    }

    if (!DRY_RUN) {
      await writeRows(client, keptRows);
    }

    console.log("");
    console.log(DRY_RUN ? "Dry run complete — no data was written." : "Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    if (client) await client.end();
  }
}

function summarize(model, row) {
  const id = row.id ?? row.key ?? row.slug;
  switch (model) {
    case "Domain":
      return `${id} (slug=${row.slug}, builtIn=${row.builtIn})`;
    case "Setting":
      return `key=${row.key} (value len ${(row.value || "").length})`;
    case "Credential":
      return `${id} (label=${row.label}, provider=${row.provider}, baseUrl=${row.baseUrl || "-"}, apiKey=${mask(row.apiKey)})`;
    case "ModelConfig":
      return `${id} (label=${row.label}, credential=${row.credentialId}, default=${row.isDefault}, fallback=${row.fallbackModelIds})`;
    case "RoutingRule":
      return `${id} (domain=${row.domain} -> model ${row.modelId})`;
    case "User":
      return `${id} (${row.name}, ${row.email})`;
    case "Account":
      return `${id} (provider=${row.providerId}, userId=${row.userId}, password=${row.password ? "set" : "none"})`;
    case "IntegrationCapability":
      return `${id} (integration=${row.integrationId}, capability=${row.capabilityId}, priority=${row.priority})`;
    case "IntegrationConfig":
      return `${id} (integration=${row.integrationId}, apiKey=${row.apiKey ? mask(row.apiKey) : "none"})`;
    case "VoiceConfig":
      return `${id} (stt=${row.sttModelId || "default"}, tts=${row.ttsModelId || "local:piper"}, mode=${row.sttMode}/${row.ttsMode})`;
    case "Capability":
      return `${id} (name=${row.name}, category=${row.category || "-"})`;
    case "Integration":
      return `${id} (name=${row.name}, transport=${row.transport})`;
    default:
      return `${id}`;
  }
}

function mask(value) {
  if (!value) return "-";
  if (value.startsWith("enc:v1:")) return `${value.slice(0, 17)}…encrypted`;
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

async function writeRows(client, keptRows) {
  for (const model of MODEL_ORDER) {
    const rows = keptRows[model];
    if (rows.length === 0) continue;

    const conflictKey = CONFLICT_KEY[model] || "id";
    const columns = Object.keys(rows[0]);
    const colSql = columns.map((c) => `"${c}"`).join(", ");
    const placeholders = columns.map((_, j) => `$${j + 1}`).join(", ");
    const updateSet = columns
      .filter((c) => c !== conflictKey)
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(", ");

    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const values = columns.map((c) => coerce(c, row[c]));
      const res = await client.query(
        `INSERT INTO "${model}" (${colSql}) VALUES (${placeholders})
         ON CONFLICT ("${conflictKey}") DO UPDATE SET ${updateSet}
         RETURNING "${conflictKey}"`,
        values
      );
      if (res.rows.length > 0) {
        if (String(res.rows[0][conflictKey]) === String(row[conflictKey])) created++;
        else updated++;
      }
    }
    console.log(
      `  wrote ${model}: ${created} created, ${updated} updated (ON CONFLICT ${conflictKey})`
    );
  }
}

// Boolean columns (as they exist in today's schema). SQLite stores them as
// 0/1 integers; PG boolean columns need true/false. Everything else — real
// ints (VoiceConfig.id, priority, ttsRate/ttsPitch) and strings — stays as-is.
const BOOL_COLUMNS = new Set([
  "enabled",
  "requiresApproval",
  "isDefault",
  "builtIn",
  "emailVerified",
]);

// Coerce SQLite values to PG-appropriate JS types.
function coerce(column, value) {
  if (value === null || value === undefined) return null;
  if (BOOL_COLUMNS.has(column)) return value !== 0;
  if (typeof value === "number") return value;
  return value;
}

main();