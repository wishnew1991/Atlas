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
];

const INTEGRATIONS = [
  { id: "swiggy", name: "Swiggy", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2", scopes: ["mcp:tools", "mcp:resources"] }]), capabilities: [{ capabilityId: "food", priority: 10 }] },
  { id: "zomato", name: "Zomato", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2", scopes: ["mcp:tools"] }]), capabilities: [{ capabilityId: "food", priority: 20 }] },
  { id: "amazon", name: "Amazon", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2" }]), capabilities: [{ capabilityId: "shopping", priority: 10 }] },
  { id: "uber", name: "Uber", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2", scopes: ["mcp:tools"] }]), capabilities: [{ capabilityId: "rides", priority: 10 }] },
  { id: "ola", name: "Ola", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2" }]), capabilities: [{ capabilityId: "rides", priority: 20 }] },
  { id: "makemytrip", name: "MakeMyTrip", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "oauth2" }]), capabilities: [{ capabilityId: "travel", priority: 10 }] },
  { id: "google", name: "Google", transport: "sdk", authMethodsJson: JSON.stringify([{ kind: "oauth2", scopes: ["calendar", "gmail", "drive"] }]), capabilities: [{ capabilityId: "calendar", priority: 10 }, { capabilityId: "email", priority: 10 }, { capabilityId: "documents", priority: 10 }] },
  { id: "fewsats", name: "Fewsats", transport: "mcp", authMethodsJson: JSON.stringify([{ kind: "api_key" }]), capabilities: [{ capabilityId: "payments", priority: 10 }] },
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

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
