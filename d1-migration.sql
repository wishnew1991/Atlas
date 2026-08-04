-- CreateTable
CREATE TABLE "AtlasUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clerkId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "addressesJson" TEXT NOT NULL DEFAULT '[]',
    "paymentsJson" TEXT NOT NULL DEFAULT '[]',
    "privacyJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "baseUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ModelConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "credentialId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "fallbackModelIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ModelConfig_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoutingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    CONSTRAINT "RoutingRule_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VoiceConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "sttLanguage" TEXT NOT NULL DEFAULT 'en-US',
    "ttsVoiceURI" TEXT NOT NULL DEFAULT '',
    "ttsRate" REAL NOT NULL DEFAULT 1,
    "ttsPitch" REAL NOT NULL DEFAULT 1,
    "sttModelId" TEXT NOT NULL DEFAULT '',
    "ttsModelId" TEXT NOT NULL DEFAULT 'local:piper',
    "sttMode" TEXT NOT NULL DEFAULT 'native_first',
    "ttsMode" TEXT NOT NULL DEFAULT 'server_first'
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fields" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reference" TEXT,
    "meta" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Approval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AtlasUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AtlasUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "payload" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TurnTrace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "conversationId" TEXT,
    "userId" TEXT,
    "domain" TEXT,
    "modelId" TEXT,
    "stages" TEXT NOT NULL DEFAULT '[]',
    "toolsUsed" TEXT NOT NULL DEFAULT '[]',
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "totalMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ActivityItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "time" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "McpServer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "token" TEXT,
    "command" TEXT NOT NULL,
    "args" TEXT NOT NULL DEFAULT '',
    "env" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL DEFAULT 'shopping',
    "roles" TEXT NOT NULL DEFAULT '[]',
    "toolRoles" TEXT NOT NULL DEFAULT '{}',
    "global" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "toolCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "McpOAuthClient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "clientId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'user',
    "type" TEXT NOT NULL DEFAULT 'knowledge',
    "status" TEXT NOT NULL DEFAULT 'active',
    "text" TEXT NOT NULL,
    "embedding" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "importance" REAL NOT NULL DEFAULT 0.5,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MemoryEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'entity',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MemoryRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "strength" REAL NOT NULL DEFAULT 0.5,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MemoryRelation_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "MemoryEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MemoryRelation_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "MemoryEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "summary" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RoutineObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "confidence" REAL NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'observing',
    "askedEver" BOOLEAN NOT NULL DEFAULT false,
    "declinedEver" BOOLEAN NOT NULL DEFAULT false,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "goal" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'immediate',
    "status" TEXT NOT NULL DEFAULT 'planning',
    "planJson" TEXT NOT NULL DEFAULT '{}',
    "stateJson" TEXT NOT NULL DEFAULT '{}',
    "resultsJson" TEXT NOT NULL DEFAULT '[]',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "conversationId" TEXT,
    "runId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ExecutionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutionEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_MemoryToMemoryEntity" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_MemoryToMemoryEntity_A_fkey" FOREIGN KEY ("A") REFERENCES "Memory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_MemoryToMemoryEntity_B_fkey" FOREIGN KEY ("B") REFERENCES "MemoryEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AtlasUser_clerkId_key" ON "AtlasUser"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_slug_key" ON "Domain"("slug");

-- CreateIndex
CREATE INDEX "Conversation_userId_lastMessageAt_idx" ON "Conversation"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowSession_kind_userId_idx" ON "WorkflowSession"("kind", "userId");

-- CreateIndex
CREATE INDEX "WorkflowSession_expiresAt_idx" ON "WorkflowSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TurnTrace_runId_key" ON "TurnTrace"("runId");

-- CreateIndex
CREATE INDEX "TurnTrace_userId_createdAt_idx" ON "TurnTrace"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TurnTrace_createdAt_idx" ON "TurnTrace"("createdAt");

-- CreateIndex
CREATE INDEX "Memory_userId_kind_idx" ON "Memory"("userId", "kind");

-- CreateIndex
CREATE INDEX "Memory_userId_type_status_idx" ON "Memory"("userId", "type", "status");

-- CreateIndex
CREATE INDEX "MemoryEntity_userId_kind_idx" ON "MemoryEntity"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryEntity_userId_name_key" ON "MemoryEntity"("userId", "name");

-- CreateIndex
CREATE INDEX "MemoryRelation_userId_relation_idx" ON "MemoryRelation"("userId", "relation");

-- CreateIndex
CREATE INDEX "MemoryRelation_subjectId_idx" ON "MemoryRelation"("subjectId");

-- CreateIndex
CREATE INDEX "MemoryRelation_objectId_idx" ON "MemoryRelation"("objectId");

-- CreateIndex
CREATE INDEX "Routine_userId_domain_status_idx" ON "Routine"("userId", "domain", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Routine_userId_domain_label_key" ON "Routine"("userId", "domain", "label");

-- CreateIndex
CREATE INDEX "RoutineObservation_userId_domain_state_idx" ON "RoutineObservation"("userId", "domain", "state");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineObservation_userId_domain_fingerprint_key" ON "RoutineObservation"("userId", "domain", "fingerprint");

-- CreateIndex
CREATE INDEX "Execution_userId_createdAt_idx" ON "Execution"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Execution_conversationId_createdAt_idx" ON "Execution"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Execution_status_updatedAt_idx" ON "Execution"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ExecutionEvent_executionId_createdAt_idx" ON "ExecutionEvent"("executionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "_MemoryToMemoryEntity_AB_unique" ON "_MemoryToMemoryEntity"("A", "B");

-- CreateIndex
CREATE INDEX "_MemoryToMemoryEntity_B_index" ON "_MemoryToMemoryEntity"("B");
