-- CreateTable
CREATE TABLE "Capability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'action',
    "icon" TEXT,
    "description" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "transport" TEXT NOT NULL DEFAULT 'mcp',
    "authMethodsJson" TEXT NOT NULL DEFAULT '[]',
    "icon" TEXT,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IntegrationCapability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "integrationId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 10,
    CONSTRAINT "IntegrationCapability_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IntegrationCapability_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "integrationId" TEXT NOT NULL,
    "label" TEXT,
    "baseUrl" TEXT,
    "apiKey" TEXT,
    "oauthToken" TEXT,
    "oauthRefresh" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IntegrationConfig_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "displayName" TEXT,
    "oauthToken" TEXT,
    "oauthRefresh" TEXT,
    "tokenExpiresAt" DATETIME,
    "apiKey" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserConnection_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "IntegrationCapability_capabilityId_priority_idx" ON "IntegrationCapability"("capabilityId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCapability_integrationId_capabilityId_key" ON "IntegrationCapability"("integrationId", "capabilityId");

-- CreateIndex
CREATE INDEX "IntegrationConfig_integrationId_idx" ON "IntegrationConfig"("integrationId");

-- CreateIndex
CREATE INDEX "UserConnection_userId_status_idx" ON "UserConnection"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserConnection_userId_integrationId_key" ON "UserConnection"("userId", "integrationId");
