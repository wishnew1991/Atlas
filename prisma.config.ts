import { defineConfig } from "prisma/config";

// Postgres migration paused until the execution data model stabilizes.
// Runtime Prisma client uses the SQLite adapter in src/lib/atlas/server/prisma.ts.
export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL || "file:./dev.db",
  },
});
