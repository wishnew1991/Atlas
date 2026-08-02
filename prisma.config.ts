import { defineConfig } from "prisma/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { join } from "path";

const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";
const filePath = databaseUrl.replace("file:", "");
const absolutePath = filePath.startsWith("/")
  ? filePath
  : join(process.cwd(), filePath);

export default defineConfig({
  datasource: {
    url: `file:${absolutePath}`,
  },
  migrations: {
    adapter: new PrismaBetterSqlite3({ url: `file:${absolutePath}` }),
  },
  migrationsList: {
    adapter: new PrismaBetterSqlite3({ url: `file:${absolutePath}` }),
  },
});
