import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";


/** Paused — Redis/BullMQ queue dashboards are out of scope until Execution Engine is solid. */
export async function GET() {
  return NextResponse.json(
    { error: "Queue stats are paused. Execution uses the in-process job runner." },
    { status: 501 }
  );
}
