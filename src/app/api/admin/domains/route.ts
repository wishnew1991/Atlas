import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { readRegistry, addDomain, removeDomain } from "@/lib/atlas/server/model-registry";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET() {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const registry = await readRegistry();

  return NextResponse.json({ domains: registry.domains });
}

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isRecord(payload) || typeof payload.domain !== "string") {
    return NextResponse.json({ error: "domain is required." }, { status: 400 });
  }

  const domains = await addDomain(payload.domain);

  return NextResponse.json({ domains });
}

export async function DELETE(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isRecord(payload) || typeof payload.domain !== "string") {
    return NextResponse.json({ error: "domain is required." }, { status: 400 });
  }

  const domains = await removeDomain(payload.domain);

  return NextResponse.json({ domains });
}
