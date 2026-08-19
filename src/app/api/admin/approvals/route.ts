import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { prisma } from "@/lib/atlas/server/prisma";
import { upsertMcpServer, deleteMcpServer, writeVoiceConfig } from "@/lib/atlas/server/model-registry";
import { invalidateToolCache } from "@/lib/atlas/mcp/registry";
import { encryptSecret } from "@/lib/security/secrets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  try {
    const approvals = await prisma.approval.findMany({
      where: { domain: "admin" },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ approvals });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load approvals." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  try {
    const { id, status } = await request.json();
    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required." }, { status: 400 });
    }

    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
    }

    // Find the approval first
    const approval = await prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      return NextResponse.json({ error: "Approval not found." }, { status: 404 });
    }

    if (approval.status !== "pending") {
      return NextResponse.json({ error: "Approval is already resolved." }, { status: 400 });
    }

    // If approved, execute the corresponding admin tool action or flagged consumer tool
    if (status === "approved") {
      if (approval.meta) {
        try {
          const metaObj = JSON.parse(approval.meta);
          if (metaObj.action === "run_flagged_tool") {
            const { name: toolName, args: toolArgs, userId } = metaObj.args;
            const { executeTool } = await import("@/lib/atlas/tools/registry");
            const result = await executeTool(toolName, toolArgs, { userId, history: [] });
            
            // Save the result to the approval metadata so the engine can inspect it when resuming
            await prisma.approval.update({
              where: { id },
              data: {
                reference: result.message || "Executed",
                meta: JSON.stringify({ ...metaObj, result })
              }
            });

            // Resume the consumer execution engine in the background
            try {
              const { findPendingExecutionForApproval, resumeExecutionAfterApproval } = await import(
                "@/lib/execution/engine"
              );
              const executionId = await findPendingExecutionForApproval(id);
              if (executionId) {
                await resumeExecutionAfterApproval(executionId, id);
              }
            } catch (e) {
              console.error("Failed to resume execution:", e);
            }
          }
        } catch (err) {
          console.error("Failed to execute approved flagged tool:", err);
        }
      }

      if (approval.fields) {
        let payload: any = {};
        try {
          payload = JSON.parse(approval.fields);
        } catch {}
        const { action, args } = payload;

      if (action === "add_mcp_server") {
        const parseEnv = (str: string) => {
          if (!str) return {};
          const res: Record<string, string> = {};
          str.split("\n").forEach((line) => {
            const parts = line.split("=");
            if (parts.length >= 2) res[parts[0].trim()] = parts.slice(1).join("=").trim();
          });
          return res;
        };

        const parseArgs = (str: string) => {
          if (!str) return [];
          if (str.startsWith("[")) {
            try { return JSON.parse(str); } catch {}
          }
          return str.split("\n").map(s => s.trim()).filter(Boolean);
        };

        const saved = await upsertMcpServer({
          id: args.id as string,
          name: args.name as string,
          command: args.command as string,
          args: parseArgs(args.args as string),
          env: parseEnv(args.env as string),
          url: args.url as string,
          token: args.token as string,
          domain: (args.domain as string) || "shopping",
          global: true
        });
        invalidateToolCache(saved.id);
      } else if (action === "delete_mcp_server") {
        await deleteMcpServer(args.id as string);
        invalidateToolCache(args.id as string);
      } else if (action === "add_connector") {
        await prisma.integration.upsert({
          where: { id: args.id as string },
          update: { name: args.name as string, transport: args.transport as string, description: args.description as string },
          create: { id: args.id as string, name: args.name as string, transport: args.transport as string, description: args.description as string }
        });
      } else if (action === "delete_connector") {
        await prisma.integration.delete({ where: { id: args.id as string } });
      } else if (action === "install_skill") {
        await prisma.skill.create({
          data: {
            id: args.id as string || randomUUID(),
            name: args.name as string,
            category: (args.category as string) || "action",
            capabilityId: args.capabilityId as string,
            connectorId: args.connectorId as string || null,
            status: "active"
          }
        });
      } else if (action === "configure_llm_provider") {
        const encrypted = encryptSecret(args.apiKey as string, `Credential ${args.provider} key`);
        await prisma.credential.create({
          data: {
            label: (args.label as string) || args.provider as string,
            provider: args.provider as string,
            apiKey: encrypted,
            baseUrl: (args.baseUrl as string) || null
          }
        });
      } else if (action === "configure_voice_settings") {
        await writeVoiceConfig(args);
      }
    }
  }

    const updated = await prisma.approval.update({
      where: { id },
      data: {
        status,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ approval: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update approval." }, { status: 500 });
  }
}
