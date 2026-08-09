import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";


/** Paused — dead-letter Redis queues are out of scope for Phase 1. */
export async function GET() {
  return NextResponse.json(
    { error: "Dead-letter queue APIs are paused until Execution Engine stabilizes." },
    { status: 501 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Dead-letter queue APIs are paused until Execution Engine stabilizes." },
    { status: 501 }
  );
}
