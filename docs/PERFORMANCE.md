# Atlas performance core

Architectural and performance changes shipped to make Atlas faster, more
transparent, and restart-safe — without breaking existing `/api/chat`,
`/api/actions/*`, or admin APIs.

## Goals

- Live execution timeline instead of generic thinking dots
- Lower latency on follow-up turns (`yes`, `that one`, `continue`)
- Durable conversations + food sessions across restarts
- Cached MCP tool schemas with admin invalidation
- Trimmed/summarized model context
- Modular agent pipeline with observability (run IDs, stage timings)

## Backward compatibility

| Surface | Compatibility |
|--------|----------------|
| `POST /api/chat` request | Unchanged; optional `conversationId` |
| Non-stream JSON response | Same fields; additive `conversationId`, `runId` |
| SSE `token` / `done` / `error` | Unchanged |
| SSE additive events | `stage`, `meta` — ignored by old clients |
| `/api/actions/*` | Unchanged |
| Admin MCP/models/voice | Unchanged; cache invalidated on discover/upsert/delete |

## Module layout

```
src/lib/atlas/server/agent/
  prompts.ts      system prompt + food session context
  memory.ts       retrieve + extract memories
  tools.ts        tool-call parsing / leak guards
  reply.ts        createAtlasReplyCore + streamAtlasReplyCore

src/lib/atlas/server/atlas-agent.ts
  thin facade: create/stream + executeAtlasAction + finalizeFoodUpi + demo

src/lib/atlas/observability/trace.ts
  run IDs, stage timers, structured logs, TurnTrace persistence

src/lib/atlas/conversation/
  history.ts      trim + rolling summary for model context
  persist.ts      Conversation / Message durability
  state.ts        single source of truth (classifier skip on continuations)
```

## Latency wins

1. **Single `resolveConversationState` per turn** — planner accepts precomputed state, removing the duplicate classifier call.
2. **Continuation hot path** — confirmations/references inherit capabilities with **zero** classifier LLM calls.
3. **History trim** — last 8 turns verbatim; older turns collapsed into a rolling summary on the conversation row.
4. **MCP schema cache** — TTL raised to 10 minutes; `invalidateToolCache` / `primeToolCache` on admin Discover/upsert/delete.
5. **Food session hydrate** — L1 memory Map + durable `WorkflowSession` write-through.

## Execution timeline stages

Emitted as SSE `{ type: "stage", stage, label, status, durationMs? }`:

`understanding` → `planning` → `routing` → `loading_tools` → `memory` → `reasoning` → `tool_execution` → `approval?` → `composing` → `complete`

UI: `assistant-home.tsx` replaces thinking dots with a live step list while `isSending`.

## Persistence

| Data | Store |
|------|--------|
| Conversations / messages / rolling summary | Prisma `Conversation`, `Message` |
| Food ordering session | Prisma `WorkflowSession` (`kind=food`) + in-memory L1 |
| Approvals | existing Prisma `Approval` |
| Turn metrics | Prisma `TurnTrace` |

## Observability

Structured logs: `[atlas] stage.start|stage.end|turn.complete …`

Each turn records: `runId`, stage durations, tools used, estimated tokens, model, domain, success/error.

## Verification checklist

- [ ] `npm run test:pipeline`
- [ ] `npm run test:food`
- [ ] Send chat message → timeline stages appear before tokens
- [ ] Follow-up `yes` does not trigger classifier (check logs: `continuation`)
- [ ] Restart server mid food session → hydrate restores cart/address
- [ ] Admin Discover refreshes MCP cache without chat restart
