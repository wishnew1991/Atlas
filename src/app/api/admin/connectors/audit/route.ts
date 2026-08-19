import { NextResponse } from "next/server";

import { prisma } from "@/lib/atlas/server/prisma";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  const statusFilter = url.searchParams.get("status");

  try {
    const where: Record<string, unknown> = {};
    if (statusFilter && statusFilter !== "all") {
      where.status = statusFilter;
    }

    const [rows, total] = await Promise.all([
      prisma.connectorAudit.findMany({
        where,
        include: { integration: true },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.connectorAudit.count({ where }),
    ]);

    return NextResponse.json({
      entries: rows.map((row) => ({
        id: row.id,
        integrationId: row.integrationId,
        integrationName: row.integration?.name ?? row.integrationId,
        userId: row.userId,
        action: row.action,
        resource: row.resource,
        status: row.status,
        details: safeJson(row.detailsJson),
        createdAt: row.createdAt,
      })),
      total,
    });
  } catch (err) {
    console.error("[admin/connectors/audit] GET failed:", err);
    return NextResponse.json({ error: "Could not load audit feed." }, { status: 500 });
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}