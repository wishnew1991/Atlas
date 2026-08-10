import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import {
  listMcpServers,
  upsertMcpServer,
  deleteMcpServer,
  getMcpServer,
  updateMcpServerHealth,
  updateMcpClassification,
  type AtlasMcpServerInput,
} from "@/lib/atlas/server/model-registry";
import { withMcpServer } from "@/lib/atlas/server/mcp-client";
import { classifyMcpServer } from "@/lib/atlas/mcp/roles";
import { invalidateToolCache, primeToolCache } from "@/lib/atlas/mcp/registry";
import { prisma } from "@/lib/atlas/server/prisma";

export const dynamic = "force-dynamic";


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEnvInput(value: unknown): Record<string, string> {
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, line) => {
        const separator = line.indexOf("=");

        if (separator > 0) {
          acc[line.slice(0, separator)] = line.slice(separator + 1);
        }

        return acc;
      }, {});
  }

  if (isRecord(value)) {
    const result: Record<string, string> = {};

    for (const [key, val] of Object.entries(value)) {
      if (typeof val === "string") {
        result[key] = val;
      }
    }

    return result;
  }

  return {};
}

function parseArgsInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return [];
}

export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  return NextResponse.json({ servers: await listMcpServers() });
}

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isRecord(payload)) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const name = payload.name;
  const command = payload.command;
  const domain = typeof payload.domain === "string" && payload.domain.trim().length > 0 ? payload.domain.trim() : undefined;
  const url = payload.url;
  const token = payload.token;

  if (typeof name !== "string") {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  const hasUrl = typeof url === "string" && url.trim().length > 0;
  const hasCommand = typeof command === "string" && command.trim().length > 0;

  if (!hasUrl && !hasCommand) {
    return NextResponse.json({ error: "Provide either a URL or a command for the MCP server." }, { status: 400 });
  }

  const input: AtlasMcpServerInput = {
    id: typeof payload.id === "string" ? payload.id : undefined,
    name,
    url: hasUrl ? (url as string) : undefined,
    token: typeof token === "string" ? token : undefined,
    command: hasCommand ? (command as string) : undefined,
    args: parseArgsInput(payload.args),
    env: parseEnvInput(payload.env),
    domain: domain ?? "shopping",
    roles: Array.isArray(payload.roles) ? payload.roles.filter((entry): entry is string => typeof entry === "string") : undefined,
    toolRoles: isRecord(payload.toolRoles) ? (payload.toolRoles as Record<string, string[]>) : undefined,
    global: payload.global === true,
  };

  const saved = await upsertMcpServer(input);
  invalidateToolCache(saved.id);

  try {
    const discovered = await withMcpServer(
      {
        url: saved.url ?? undefined,
        token: saved.token ?? undefined,
        command: saved.command,
        args: saved.args,
        env: saved.env,
      },
      async (client) => client.listTools()
    );
    primeToolCache(saved.id, discovered);
    await updateMcpServerHealth(saved.id, discovered.length, null);

    // Auto-classify the server from its discovered tools, unless the admin
    // supplied explicit roles (advanced override).
    if (!input.roles || input.roles.length === 0) {
      const classification = classifyMcpServer(discovered);
      await updateMcpClassification(saved.id, classification.roles, classification.toolRoles);
      await prisma.mcpServer.update({ where: { id: saved.id }, data: { domain: classification.domain } }).catch(() => {});
    }
  } catch (error) {
    await updateMcpServerHealth(saved.id, 0, error instanceof Error ? error.message : "Discovery failed.");
  }

  return NextResponse.json({ server: await getMcpServer(saved.id) });
}

export async function DELETE(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isRecord(payload) || typeof payload.id !== "string") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  await deleteMcpServer(payload.id);
  invalidateToolCache(payload.id);

  return NextResponse.json({ ok: true });
}
