# Atlas — Current Status

## Focus

**Phase 1 Execution Engine is shipped.** Intent-aware memory / recommendation pipeline is live on the execution path.

- PostgreSQL / pgvector migration remains **paused**.
- Local runtime remains **SQLite** (`file:./dev.db`).
- Chat is the interface; **Execution** is the unit of work.

## Phase 0 — paused

Previous foundation work (BullMQ/Redis sketches, security scaffolding, Postgres prep) is **not** being expanded. Non-execution BullMQ queues are unused. Execution steps use an **in-process job runner** (no Redis required).

## Phase 1 — Execution Engine (core shipped)

### Done

- Durable `Execution` + `ExecutionEvent` Prisma models (JSON fields)
- Prisma-backed manager + status state machine
- In-process `EXECUTION_STEP` job runner; workers call real step handlers
- Chat create/stream paths create and drive Executions (`executionId` on SSE `meta`/`done`)
- `GET /api/executions` and `GET /api/executions/[id]`
- Approval completion resumes linked Execution
- Observe → reflect → learn pipeline (`reflect.ts`)
- Post-approval resume runs remaining plan steps (`fulfill_approval`) then learn

### Live pipeline

`understand` → `classify_intent` → `detect_domain` → `retrieve_safety_memory` → `retrieve_preference_memory` → `build_recommendation` → `select_tools` → `invoke_tools` → `compose_reply` (+ optional approval)

| Intent | Safety memory | Preference memory | Recommendation engine |
|--------|---------------|-------------------|------------------------|
| conversational | skip | skip | skip |
| execution | load | skip | skip |
| recommendation | load (food/travel/rides) | load | build |
| hybrid | load | load | build |
| ambiguous | skip | skip | clarify |

### Acceptance criteria

- [x] Every live chat turn creates a persisted Execution
- [x] Status transitions enforced
- [x] Steps run through in-process job queue
- [x] Chat/food/approval flows preserved (additive APIs)
- [x] No Redis required for `npm run dev`
- [x] Observing/reflecting are real learning steps
- [x] Approval unlocks remaining plan steps
- [x] Preference memory is intent-gated (not always-on)

## Next

- Resume Postgres migration / production job backend when ready
- Deeper Phase 2 layered memory (working / conversation / knowledge)
- Keep investor + engineering docs current with the pipeline

## Side work (UI)

- Profile redesigned: identity hero, flat sections, privacy switches
- Details populated from Clerk / local sign-up; Edit opens the form
- Profile API + `UserProfile` persistence in place

## Docs

- `PROGRESS.md` — checklist (includes intent-aware memory)
- `ARCHITECTURE.md` — target architecture
- `ROADMAP.md` — phased roadmap
- `SETUP.md` — local/dev setup notes
- `IMPLEMENTATION_GUIDE.md` — implementation guidance
- `../PERFORMANCE.md` — performance-core notes
- `../atlas-pitch-8-api-credits.html` + `../Atlas-Pitch-API-Credits.pdf` — API-credits pitch
