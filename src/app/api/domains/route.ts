import { NextResponse } from "next/server";

import { readRegistry } from "@/lib/atlas/server/model-registry";

export const runtime = "edge";
export const dynamic = "force-dynamic";


export async function GET() {
  const registry = await readRegistry();

  return NextResponse.json({ domains: registry.domains });
}
