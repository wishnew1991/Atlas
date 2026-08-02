import { NextResponse } from "next/server";

import { readRegistry } from "@/lib/atlas/server/model-registry";

export async function GET() {
  const registry = await readRegistry();

  return NextResponse.json({ voice: registry.voice });
}
