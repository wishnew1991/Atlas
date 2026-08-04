import { NextResponse } from "next/server";

import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";
import { getExecution, toPublicExecution } from "@/lib/execution/manager";


/** GET /api/executions/:id — public execution snapshot. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getAtlasActor();
    const { id } = await context.params;
    const executionId = typeof id === "string" ? id.trim() : "";

    if (!executionId) {
      return NextResponse.json({ error: "Execution id required." }, { status: 400 });
    }

    const execution = await getExecution(executionId);
    if (!execution) {
      return NextResponse.json({ error: "Execution not found." }, { status: 404 });
    }

    const uid = actor.userId === "atlas-demo-user" ? "atlas-demo-user" : actor.userId;
    const ownerOk =
      execution.userId === uid ||
      (actor.userId === "atlas-demo-user" && execution.userId === "atlas-demo-user");

    if (!ownerOk && execution.userId !== "atlas-demo-user") {
      // Guest-created rows store null userId mapped to atlas-demo-user in rowToExecution
      if (!(actor.userId === "atlas-demo-user" && !execution.userId)) {
        // Allow read if conversation-linked and same actor created guest rows
      }
    }

    return NextResponse.json(
      { execution: toPublicExecution(execution) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not load execution." }, { status: 500 });
  }
}
