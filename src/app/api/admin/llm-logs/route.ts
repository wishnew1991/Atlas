import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { prisma } from "@/lib/atlas/server/prisma";

export const runtime = "edge";
export const dynamic = "force-dynamic";


function parseCount(value: string | null, fallback: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseCount(searchParams.get("limit"), 50, 200);
  const offset = parseCount(searchParams.get("offset"), 0, 10000);

  const [logs, total] = await Promise.all([
    prisma.llmLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.llmLog.count(),
  ]);

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      runId: log.runId,
      conversationId: log.conversationId,
      userId: log.userId,
      domain: log.domain,
      modelId: log.modelId,
      provider: log.provider,
      round: log.round,
      tokensIn: log.tokensIn,
      tokensOut: log.tokensOut,
      latencyMs: log.latencyMs,
      success: log.success,
      error: log.error,
      toolCalls: log.toolCalls,
      createdAt: log.createdAt,
    })),
    total,
  });
}
