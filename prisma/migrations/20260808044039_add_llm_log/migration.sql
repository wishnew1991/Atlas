-- CreateTable
CREATE TABLE "LlmLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT,
    "conversationId" TEXT,
    "userId" TEXT,
    "domain" TEXT,
    "modelId" TEXT,
    "provider" TEXT,
    "round" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "toolCalls" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "LlmLog_userId_createdAt_idx" ON "LlmLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmLog_modelId_createdAt_idx" ON "LlmLog"("modelId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmLog_createdAt_idx" ON "LlmLog"("createdAt");
