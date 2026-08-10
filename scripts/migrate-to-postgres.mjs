#!/usr/bin/env node

/**
 * Migration script from SQLite (dev.db) to PostgreSQL.
 *
 * Reads every row from the SQLite database (dev.db) and copies it into the
 * PostgreSQL database referenced by DATABASE_URL. Both schemas
 * (prisma/schema.prisma and prisma/schema.postgresql.prisma) share the same
 * 33 models with identical field names, so rows are copied generically using
 * the Prisma model delegates.
 *
 * Usage:
 *   node scripts/migrate-to-postgres.mjs          # migrate dev.db -> $DATABASE_URL
 *   node scripts/migrate-to-postgres.mjs --dry-run  # only report counts, no writes
 */

import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

// Parents first so FK constraints hold during bulk inserts.
const MODEL_ORDER = [
  // Leaf models (no FK to an Atlas model)
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
  // FK dependents
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

const SQLITE_PATH = path.join(process.cwd(), "dev.db");
const BATCH_SIZE = 500;
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (!fs.existsSync(SQLITE_PATH)) {
    console.log("No SQLite database found at dev.db. Skipping data migration.");
    return;
  }

  const sqlite = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: "file:./dev.db" }),
  });

  let postgres = null;
  if (!DRY_RUN) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL must be set to a PostgreSQL connection string (or pass --dry-run)."
      );
    }
    postgres = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  console.log(`SQLite database found at ${SQLITE_PATH}.`);

  try {
    for (const model of MODEL_ORDER) {
      const rows = await sqlite[model].findMany();
      if (rows.length === 0) {
        console.log(`  ${model}: 0 rows — skipped`);
        continue;
      }
      console.log(`  ${model}: ${rows.length} row(s)`);
      if (postgres === null) continue;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await postgres[model].createMany({
          data: batch,
          skipDuplicates: true,
        });
      }
    }

    await migrateImplicitJoinTables(sqlite, postgres);

    console.log("Migration completed successfully!");
    console.log("Please backup your SQLite database before removing it.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await sqlite.$disconnect();
    if (postgres) await postgres.$disconnect();
  }
}

async function migrateImplicitJoinTables(sqlite, postgres) {
  if (postgres === null) return;

  const tables = await sqlite.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  );
  const joinTables = tables
    .map((t) => t.name)
    .filter((name) => name.startsWith("_") && name !== "_prisma_migrations");

  for (const table of joinTables) {
    const rows = await sqlite.$queryRawUnsafe(
      `SELECT * FROM "${table.replaceAll('"', '""')}"`
    );
    if (rows.length === 0) {
      console.log(`  ${table} (implicit m2m): 0 rows — skipped`);
      continue;
    }
    console.log(`  ${table} (implicit m2m): ${rows.length} rows`);
    const columns = Object.keys(rows[0]);
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      for (const row of batch) {
        const colSql = columns.map((c) => `"${c}"`).join(", ");
        const placeholders = columns.map((_, j) => `$${j + 1}`).join(", ");
        const values = columns.map((c) => row[c]);
        await postgres.$executeRawUnsafe(
          `INSERT INTO "${table}" (${colSql}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          ...values
        );
      }
    }
  }
}

main();