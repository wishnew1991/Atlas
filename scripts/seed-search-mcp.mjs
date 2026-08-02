// Seeds the parallel.ai web search MCP server into the database when configured.
// Run with: node scripts/seed-search-mcp.mjs (after setting DATABASE_URL + PARALLEL_API_KEY)
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";
const filePath = databaseUrl.replace("file:", "");
const absolutePath = filePath.startsWith("/") ? filePath : process.cwd() + "/" + filePath;

const adapter = new PrismaBetterSqlite3({ url: `file:${absolutePath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const url = process.env.PARALLEL_MCP_URL || "https://search.parallel.ai/mcp";
  const token = process.env.PARALLEL_API_KEY;

  if (!token) {
    console.log("[seed-search-mcp] PARALLEL_API_KEY not set; skipping web search MCP seed.");
    return;
  }

  const name = "parallel-search";

  const existing = await prisma.mcpServer.findFirst({ where: { name } });

  if (existing) {
    await prisma.mcpServer.update({
      where: { id: existing.id },
      data: { url, token, domain: "search", global: true, enabled: true },
    });
    console.log(`[seed-search-mcp] Updated existing web search MCP (${existing.id}).`);
    return;
  }

  const created = await prisma.mcpServer.create({
    data: {
      name,
      url,
      token,
      command: "",
      args: "",
      env: "",
      domain: "search",
      global: true,
      enabled: true,
    },
  });

  console.log(`[seed-search-mcp] Created web search MCP (${created.id}).`);
}

main()
  .catch((error) => {
    console.error("[seed-search-mcp] failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
