-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_McpServer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "token" TEXT,
    "command" TEXT NOT NULL,
    "args" TEXT NOT NULL DEFAULT '',
    "env" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL DEFAULT 'shopping',
    "global" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "toolCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_McpServer" ("args", "command", "createdAt", "domain", "enabled", "env", "id", "lastError", "name", "token", "toolCount", "updatedAt", "url") SELECT "args", "command", "createdAt", "domain", "enabled", "env", "id", "lastError", "name", "token", "toolCount", "updatedAt", "url" FROM "McpServer";
DROP TABLE "McpServer";
ALTER TABLE "new_McpServer" RENAME TO "McpServer";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
