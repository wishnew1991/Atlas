-- CreateTable
CREATE TABLE "ProactiveBrief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'delivered',
    "title" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL DEFAULT '[]',
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProactiveTrigger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "schedule" TEXT NOT NULL DEFAULT '07:00',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ProactiveBrief_userId_deliveredAt_idx" ON "ProactiveBrief"("userId", "deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProactiveBrief_userId_triggerType_period_key" ON "ProactiveBrief"("userId", "triggerType", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ProactiveTrigger_userId_triggerType_key" ON "ProactiveTrigger"("userId", "triggerType");
