-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'mcp',
    "baseUrl" TEXT,
    "authType" TEXT NOT NULL DEFAULT 'api_key',
    "credentialId" TEXT,
    "endpointCatalogJson" TEXT NOT NULL DEFAULT '[]',
    "endpointsDiscoveredAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'active',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" DATETIME,
    "lastTestOk" BOOLEAN,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'action',
    "description" TEXT,
    "capabilityId" TEXT NOT NULL,
    "connectorId" TEXT,
    "providerId" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "recipeJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Skill_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Skill_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Integration" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Skill_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Skill_capabilityId_idx" ON "Skill"("capabilityId");

-- CreateIndex
CREATE INDEX "Skill_connectorId_idx" ON "Skill"("connectorId");
