-- CreateTable
CREATE TABLE "McpServer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "args" TEXT NOT NULL DEFAULT '',
    "env" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL DEFAULT 'shopping',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "toolCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

