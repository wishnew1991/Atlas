# Atlas — Current Status

## Focus (locked)

**Phase 1: Execution Engine Core is the active workstream.**

- Stop adding platform infrastructure (Redis, analytics, dashboards, extra queues, complex orchestration).
- PostgreSQL / pgvector migration is **paused** until the execution data model stabilizes.
- Local runtime remains **SQLite** (`file:./dev.db`).
- Chat is the interface; **Execution** is the unit of work.

## Phase 0 — paused

Previous foundation work (BullMQ/Redis sketches, security scaffolding, Postgres prep) is **not** being expanded. Non-execution BullMQ queues are unused. Execution steps use an **in-process job runner** (no Redis required).

## Phase 1 — Execution Engine (core shipped)

### Done in this slice

- Durable `Execution` + `ExecutionEvent` Prisma models (JSON fields)
- Prisma-backed manager + status state machine
- Plan builder: understand → memory → select_tools → invoke_tools → compose_reply → optional request_approval
- In-process `EXECUTION_STEP` job runner; workers call real step handlers
- Chat create/stream paths create and drive Executions (`executionId` on SSE `meta`/`done`)
- `GET /api/executions` and `GET /api/executions/[id]`
- Approval completion resumes linked Execution
- Observe → reflect → learn pipeline (`reflect.ts`): durable events, state variables, preference memories
- Post-approval resume runs remaining plan steps (`fulfill_approval`) then learn; UPI confirm resumes too

### Acceptance criteria

- [x] Every live chat turn creates a persisted Execution
- [x] Status transitions enforced
- [x] Steps run through in-process job queue
- [x] Chat/food/approval flows preserved (additive APIs)
- [x] No Redis required for `npm run dev`
- [x] Observing/reflecting are real learning steps (not status stubs)
- [x] Approval unlocks remaining plan steps (not status-only flip)

## Next (later phases)

- [x] Wire Tasks/Activity UI to Executions
- Activity = accomplishments with receipt / status / timeline / actions (not chat duplicate)
- [x] Stronger observe/reflect learning (events + memories + plan notes)
- [x] Resume multi-step plans after approval beyond status flip
- Resume Postgres migration / production job backend when ready
- Phase 2: layered memory system

## Side work (UI)

- Profile redesigned: identity hero, flat sections, privacy switches
- Details populated from Clerk / local sign-up; Edit opens the form
- Profile API + `UserProfile` persistence in place

## Docs

- `PROGRESS.md` — checklist
- `ARCHITECTURE.md` — target architecture
- `ROADMAP.md` — phased roadmap
- `../PERFORMANCE.md` — prior performance-core notes
