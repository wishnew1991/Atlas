import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { getMcpServer, updateMcpServerHealth, updateMcpClassification } from "@/lib/atlas/server/model-registry";
import { withMcpServer } from "@/lib/atlas/server/mcp-client";
import { classifyMcpServer } from "@/lib/atlas/mcp/roles";
import { prisma } from "@/lib/atlas/server/prisma";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isRecord(payload) || typeof payload.id !== "string") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const server = await getMcpServer(payload.id);

  if (!server) {
    return NextResponse.json({ error: "MCP server not found." }, { status: 404 });
  }

  try {
    const tools = await withMcpServer(
      { url: server.url ?? undefined, token: server.token ?? undefined, command: server.command, args: server.args, env: server.env },
      async (client) => client.listTools()
    );

    await updateMcpServerHealth(server.id, tools.length, null);

    // Auto-classify from discovered tool metadata (names + descriptions).
    const classification = classifyMcpServer(tools);
    await updateMcpClassification(server.id, classification.roles, classification.toolRoles);
    await prisma.mcpServer.update({ where: { id: server.id }, data: { domain: classification.domain } }).catch(() => {});

    return NextResponse.json({
      tools,
      roles: classification.roles,
      toolRoles: classification.toolRoles,
      capabilities: classification.capabilities,
      domain: classification.domain,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed.";
    await updateMcpServerHealth(server.id, 0, message).catch(() => {});

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
