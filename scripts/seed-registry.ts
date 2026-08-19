import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";
const filePath = databaseUrl.replace("file:", "");
const absolutePath = filePath.startsWith("/") ? filePath : process.cwd() + "/" + filePath;

const adapter = new PrismaBetterSqlite3({ url: `file:${absolutePath}` });
const prisma = new PrismaClient({ adapter });

const CAPABILITIES = [
  { id: "food", name: "Food Ordering", category: "action", requiresApproval: true, description: "Order food, browse restaurants, manage cart" },
  { id: "travel", name: "Travel", category: "action", requiresApproval: true, description: "Book flights, hotels, plan trips" },
  { id: "shopping", name: "Shopping", category: "action", requiresApproval: true, description: "Search products, compare prices, checkout" },
  { id: "rides", name: "Rides", category: "action", requiresApproval: true, description: "Book cabs, taxis, ride-hailing" },
  { id: "appointments", name: "Appointments", category: "action", requiresApproval: true, description: "Schedule and manage appointments" },
  { id: "calendar", name: "Calendar", category: "action", requiresApproval: true, description: "Manage events, meetings, reminders" },
  { id: "communication", name: "Communication", category: "communication", requiresApproval: false, description: "Send emails, messages, notifications" },
  { id: "web", name: "Web Search", category: "knowledge", requiresApproval: false, description: "Search the web for information" },
  { id: "payments", name: "Payments", category: "action", requiresApproval: true, description: "Process payments, manage wallet" },
  { id: "email", name: "Email", category: "communication", requiresApproval: false, description: "Read, compose, search email" },
  { id: "documents", name: "Documents", category: "knowledge", requiresApproval: false, description: "Create and access documents and files" },
  { id: "messaging", name: "Messaging", category: "communication", requiresApproval: false, description: "Send and receive chat messages" },
  { id: "investing", name: "Investing & Trading", category: "action", requiresApproval: true, description: "View portfolio, place orders, manage positions" },
  { id: "market-data", name: "Market Data", category: "knowledge", requiresApproval: false, description: "Live stock quotes, screening, fundamentals, technicals" },
];

const INTEGRATIONS = [
  { id: "swiggy", name: "Swiggy", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2", scopes: ["mcp:tools", "mcp:resources"] }]), capabilities: [{ capabilityId: "food", priority: 10 }] },
  { id: "zomato", name: "Zomato", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2", scopes: ["mcp:tools"] }]), capabilities: [{ capabilityId: "food", priority: 20 }] },
  { id: "zepto", name: "Zepto", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2", scopes: ["mcp:tools"] }]), capabilities: [{ capabilityId: "shopping", priority: 20 }] },
  { id: "uber", name: "Uber", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2", scopes: ["mcp:tools"] }]), capabilities: [{ capabilityId: "rides", priority: 10 }] },
  { id: "dhan", name: "Dhan", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2", scopes: ["mcp:tools"] }]), capabilities: [{ capabilityId: "investing", priority: 10 }] },
  { id: "upstox", name: "Upstox", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2", scopes: ["mcp:tools"] }]), capabilities: [{ capabilityId: "investing", priority: 20 }] },
  { id: "tapetide", name: "Tapetide", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2", scopes: ["openid", "email", "profile"] }]), capabilities: [{ capabilityId: "market-data", priority: 10 }] },
  { id: "google", name: "Google", transport: "sdk", authMethodsJson: JSON.stringify([{ kind: "oauth2", scopes: ["calendar", "gmail", "drive"] }]), capabilities: [{ capabilityId: "calendar", priority: 10 }, { capabilityId: "email", priority: 10 }, { capabilityId: "documents", priority: 10 }] },
  { id: "fewsats", name: "Fewsats", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "api_key" }]), capabilities: [{ capabilityId: "payments", priority: 10 }] },
];

// Business providers powering connectors (implementation method = kind).
const PROVIDERS = [
  { name: "Swiggy MCP", kind: "mcp", baseUrl: "https://mcp.swiggy.com", authType: "oauth2", source: "catalog" },
  { name: "Zomato MCP", kind: "mcp", baseUrl: "https://mcp.zomato.com", authType: "oauth2", source: "catalog" },
  { name: "Zepto MCP", kind: "mcp", baseUrl: "https://mcp.zepto.com", authType: "oauth2", source: "catalog" },
  { name: "Uber MCP", kind: "mcp", baseUrl: "https://mcp.uber.com", authType: "oauth2", source: "catalog" },
  { name: "Dhan MCP", kind: "mcp", baseUrl: "https://mcp.dhan.com", authType: "oauth2", source: "catalog" },
  { name: "Upstox MCP", kind: "mcp", baseUrl: "https://mcp.upstox.com", authType: "oauth2", source: "catalog" },
  { name: "Tapetide MCP", kind: "mcp", baseUrl: "https://mcp.tapetide.com", authType: "oauth2", source: "catalog" },
  { name: "Google Cloud SDK", kind: "sdk", authType: "oauth2", source: "catalog" },
  { name: "Fewsats API", kind: "api", baseUrl: "https://api.fewsats.com", authType: "api_key", source: "catalog" },
];

// Starter skills: capabilities Atlas can perform, offered by connectors,
// powered by the providers above.
const SKILLS = [
  { name: "Order food", category: "action", capabilityId: "food", connectorId: "swiggy", providerId: null, requiresApproval: true, status: "active" },
  { name: "Book a ride", category: "action", capabilityId: "rides", connectorId: "uber", providerId: null, requiresApproval: true, status: "active" },
  { name: "Search products", category: "action", capabilityId: "shopping", connectorId: "zepto", providerId: null, requiresApproval: true, status: "active" },
  { name: "Book a flight", category: "action", capabilityId: "travel", connectorId: null, providerId: null, requiresApproval: true, status: "draft" },
  { name: "Find a hotel", category: "action", capabilityId: "travel", connectorId: null, providerId: null, requiresApproval: true, status: "draft" },
  { name: "Web search", category: "knowledge", capabilityId: "web", connectorId: null, providerId: null, requiresApproval: false, status: "active" },
  { name: "Pay with Fewsats", category: "action", capabilityId: "payments", connectorId: "fewsats", providerId: null, requiresApproval: true, status: "active" },
  { name: "View portfolio", category: "action", capabilityId: "investing", connectorId: "dhan", providerId: null, requiresApproval: true, status: "active" },
];

async function main() {
  console.log("Seeding capabilities...");
  for (const cap of CAPABILITIES) {
    await prisma.capability.upsert({
      where: { id: cap.id },
      create: cap,
      update: { name: cap.name, category: cap.category, description: cap.description },
    });
  }
  console.log(`  ${CAPABILITIES.length} capabilities seeded.`);

  console.log("Seeding integrations...");
  for (const integration of INTEGRATIONS) {
    const { capabilities, ...data } = integration;
    await prisma.integration.upsert({
      where: { id: data.id },
      create: data,
      update: { name: data.name, transport: data.transport, authMethodsJson: data.authMethodsJson },
    });

    for (const link of capabilities) {
      await prisma.integrationCapability.upsert({
        where: { integrationId_capabilityId: { integrationId: data.id, capabilityId: link.capabilityId } },
        create: { integrationId: data.id, capabilityId: link.capabilityId, priority: link.priority },
        update: { priority: link.priority },
      });
    }
  }
  console.log(`  ${INTEGRATIONS.length} integrations seeded.`);

  console.log("Seeding providers...");
  const providerIdByName = new Map<string, string>();
  for (const provider of PROVIDERS) {
    const row = await prisma.provider.upsert({
      where: { id: slugify(provider.name) },
      create: { id: slugify(provider.name), ...provider, enabled: true, status: "active" },
      update: { name: provider.name, kind: provider.kind, baseUrl: provider.baseUrl ?? null, authType: provider.authType, source: provider.source },
    });
    providerIdByName.set(provider.name, row.id);
  }
  console.log(`  ${PROVIDERS.length} providers seeded.`);

  console.log("Seeding skills...");
  for (const skill of SKILLS) {
    const providerId = skill.providerId ?? (skill.connectorId ? providerIdByName.get(connectorProviderName(skill.connectorId)) ?? null : null);
    await prisma.skill.upsert({
      where: { id: `skill-${slugify(skill.name)}` },
      create: { id: `skill-${slugify(skill.name)}`, ...skill, providerId, recipeJson: "{}" },
      update: { name: skill.name, category: skill.category, capabilityId: skill.capabilityId, connectorId: skill.connectorId, providerId, requiresApproval: skill.requiresApproval, status: skill.status },
    });
  }
  console.log(`  ${SKILLS.length} skills seeded.`);

  console.log("Cleaning up removed integrations...");
  const expectedIds = new Set(INTEGRATIONS.map((i) => i.id));
  const existing = await prisma.integration.findMany({ select: { id: true } });
  let removed = 0;
  for (const row of existing) {
    if (expectedIds.has(row.id)) continue;
    const activeConnections = await prisma.userConnection.count({
      where: { integrationId: row.id, status: "active" },
    });
    if (activeConnections > 0) {
      console.warn(`  Skipping ${row.id}: still has ${activeConnections} active connection(s).`);
      continue;
    }
    await prisma.integration.delete({ where: { id: row.id } });
    removed += 1;
  }
  console.log(`  ${removed} removed integrations cleaned up.`);

  await prisma.$disconnect();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function connectorProviderName(connectorId: string): string {
  const map: Record<string, string> = {
    swiggy: "Swiggy MCP",
    zomato: "Zomato MCP",
    zepto: "Zepto MCP",
    uber: "Uber MCP",
    dhan: "Dhan MCP",
    upstox: "Upstox MCP",
    tapetide: "Tapetide MCP",
    google: "Google Cloud SDK",
    fewsats: "Fewsats API",
  };
  return map[connectorId] ?? connectorId;
}

main().catch((e) => { console.error(e); process.exit(1); });
