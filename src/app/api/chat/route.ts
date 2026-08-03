import { NextRequest, NextResponse } from "next/server";

import { createAtlasReply, streamAtlasReply } from "@/lib/atlas/server/atlas-agent";
import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";
import type { AtlasChatHistoryItem } from "@/lib/atlas/agent-contract";
import { createExecutionFromChat, getExecutionResponse } from "@/lib/execution/manager";

export const runtime = "nodejs";

function isHistoryItem(value: unknown): value is AtlasChatHistoryItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    (item.role === "assistant" || item.role === "user") &&
    typeof item.text === "string" &&
    item.text.trim().length > 0
  );
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid JSON request." }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null) {
    return NextResponse.json({ error: "Send a message to Atlas." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message || message.length > 4000) {
    return NextResponse.json({ error: "Messages must be between 1 and 4000 characters." }, { status: 400 });
  }

  const history = Array.isArray(body.history)
    ? body.history.filter(isHistoryItem).slice(-12).map((item) => ({ ...item, text: item.text.slice(0, 4000) }))
    : [];

  const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() || undefined : undefined;
  const wantsStream = body.stream === true || request.headers.get("accept")?.includes("text/event-stream");

  try {
    const actor = await getAtlasActor();

    // Create execution from chat context (execution-centric transformation)
    const execution = await createExecutionFromChat({
      conversationId,
      message,
      history,
      userId: actor.userId,
      capabilities: actor.capabilities as unknown as Record<string, unknown>,
    });

    if (!wantsStream) {
      const response = await createAtlasReply(message, history, actor.userId, actor.capabilities, {
        conversationId,
        executionId: execution.id,
      });

      // Enhance response with execution metadata
      const enhancedResponse = {
        ...response,
        executionId: execution.id,
        executionStatus: response.executionStatus ?? execution.status,
      };

      return NextResponse.json(enhancedResponse, { headers: { "Cache-Control": "no-store" } });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

        try {
          // Send execution metadata first
          send({
            type: "execution_start",
            executionId: execution.id,
            goal: execution.goal,
            status: execution.status,
          });

          for await (const chunk of streamAtlasReply(
            message,
            history,
            actor.userId,
            actor.capabilities,
            request.signal,
            { conversationId, executionId: execution.id }
          )) {
            // Update the executionId in the streamed chunk if the core omitted it.
            if (chunk.executionId !== execution.id) {
              chunk.executionId = execution.id;
            }
            if (chunk.error) {
              send({ type: "error", text: chunk.error });
              continue;
            }

            // Additive SSE event — older clients ignore unknown types.
            if (chunk.stage) {
              send({
                type: "stage",
                stage: chunk.stage.stage,
                label: chunk.stage.label,
                status: chunk.stage.status,
                detail: chunk.stage.detail,
                durationMs: chunk.stage.durationMs,
                runId: chunk.runId,
                conversationId: chunk.conversationId,
                executionId: execution.id,
              });
            }

            if (chunk.runId && !chunk.text && !chunk.done && !chunk.stage) {
              send({
                type: "meta",
                runId: chunk.runId,
                conversationId: chunk.conversationId ?? null,
                executionId: execution.id,
              });
            }

            if (chunk.text) {
              send({ type: "token", text: chunk.text });
            }

            if (chunk.done) {
              send({
                type: "done",
                action: chunk.action ?? null,
                runId: chunk.runId ?? null,
                conversationId: chunk.conversationId ?? null,
                executionId: execution.id,
              });
            }
          }
        } catch (error) {
          console.error("[api/chat] stream failed", error);
          send({ type: "error", text: "Atlas could not process this request." });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const status = error instanceof AtlasAuthenticationError ? 401 : 500;
    const message = error instanceof Error ? error.message : "Atlas could not process this request.";
    return NextResponse.json({ error: message }, { status });
  }
}
