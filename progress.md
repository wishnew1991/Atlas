# Atlas — Implementation Progress

## Phase 0: Testing Infrastructure Prerequisites
**Status:** ✅ Complete

- `setLlmAdapter()` injection point in `src/lib/atlas/llm/index.ts`
- Three-tier LLM architecture: MockLlmAdapter + CachedLlmAdapter + RealLlmAdapter
- Test isolation: `clearClassifierCache()`, `resetAllRateLimits()`, `resetExecutionQueue()`, `resetRunners()`, `resetRegistered()`, `invalidateCapabilityCache()`
- 44 lines added to production, all additive

## Phase 1: Planner Validation Suite
**Status:** ✅ Complete

- 7 planner assertion helpers (`assertions/planner.ts`)
- 51 planner tests (direct routing, continuations, topic overrides, intent analysis, snapshots)
- 16 golden fixture inputs (`fixtures/planner/direct-routing.json`)

## Phase 2: Tool Registry Validation Suite
**Status:** ✅ Complete

- 8 tool assertion helpers (`assertions/tools.ts`)
- 62 tool registry tests (discovery, capability mapping, schemas, snapshots)
- 2 golden fixture files (`fixtures/tools/`)

## Phase 3: Memory Validation Suite
**Status:** ✅ Complete

- In-memory Prisma mock (`helpers/memory-store.ts`) with dual entity indexing
- 10 memory assertion helpers (`assertions/memory.ts`)
- 31 memory tests (orchestrator, storage, recall, lifecycle, conflicts, knowledge graph, negative recall, conversation continuity)
- 3 golden recall scenarios (`fixtures/memory/`)

## Phase 4: MCP Transport Validation Suite
**Status:** ✅ Complete

- Mock MCP Gateway HTTP server (`helpers/mock-mcp-gateway.ts`) with multi-domain support
- 6 MCP assertion helpers (`assertions/mcp.ts`)
- 18 MCP transport tests (JSON-RPC protocol, tool discovery, execution, error handling, snapshots)
- Exercises real HttpTransport against local mock gateway

## Phase 5: Execution Engine Validation Suite
**Status:** ✅ Complete

- 14 execution engine tests (`executeTool` dispatch, MCP routing, tool context, result structure, error propagation, snapshots)
- Comprehensive Prisma mock covering all models

## Phase 6: Food Domain End-to-End
**Status:** ✅ Complete

- Dummy Payment Provider (`helpers/dummy-payment.ts`) with 13 scenarios
- 24 food tests (happy path, address/restaurant/cart/checkout, payment, memory, routines, snapshots)
- 2 skipped (routine upsert — fixed in Phase 7)

## Phase 7: Reporting, Coverage & Mock Completeness
**Status:** ✅ Complete

- Fixed 4 skipped tests (graph relation state, routine upsert increment)
- JSON + HTML report generator (`generate-report.ts`) with health scores, capability coverage, historical trends
- `npm run test:agent:report` script
- `scripts/test-agent/reports/` directory with `report.html`, `report.json`, `history.json`

## Phase 8: Shopping Domain
**Status:** ✅ Complete

- 28 shopping tests (planner intent, product discovery, cart operations, checkout/payment, memory, routines, failure scenarios, snapshots)
- Integration with MockMcpGateway for shopping MCP tools
- Golden datasets: `fixtures/shopping/`

## Phase A.1–A.2: Behavioral Foundation
**Status:** ✅ Complete

- LLM endpoint config resolver (`replay/endpoint.ts`)
- Mock OpenAI HTTP server (`servers/mock-openai.ts`) — `/v1/chat/completions`, `/v1/embeddings`, SSE streaming, admin endpoints
- Dev server lifecycle manager (`replay/infrastructure.ts`) — InfrastructureController, NextDevServer, DetachedDevServer, waitForReady
- 38 behavioral infra tests (MockOpenAiServer, Hook system, ReplayRuntime)

## Phase A.3–A.5: Replay Engine + Datasets
**Status:** ✅ Complete

- ReplayEngine with priority-sorted hook system (Critical → Assertion → Persistence → Metrics → Observer)
- Dual-mode parsing (SSE stream + JSON response)
- Behavioral assertion engine (toolsCalled, hasApproval, latency, continuation, tokens)
- 8 golden conversation datasets across food, shopping, travel, rides, appointments, multi-capability, edge-cases, regressions
- 8 replay engine tests + 17 dataset validation tests

## Phase A.6–A.8: Diff Engine + Reports + Datasets
**Status:** ✅ Complete

- Semantic trace diff engine (`replay/diff.ts`) with normalization, comparison policies (exact/fuzzy/ordered/unordered/ignore), regression categories, terminal report generation
- 21 diff engine tests
- 4 additional datasets (travel, rides, appointments, failure recovery)
- Golden trace store + batch diff + diff summary reports

## Milestone 1: Provider-Centric Architecture
**Status:** ✅ Complete

### Phase 1.2 — Keyword Cleanup
- Removed provider names (`swiggy`, `zomato`, `amazon`, `flipkart`, `uber`, `ola`, `mcp`) from 4 files
- User-facing capability detection now uses only domain terms

### Phase 1.3 — Engine Refactor
- Created `src/lib/atlas/integrations/routing.ts` — generic domain lock + tool rules
- Engine no longer imports `food-session` or hardcodes `food_set_address` / `food_find_restaurants`

### Phase 1.1 — Registry Foundation
- `src/lib/atlas/capabilities/types.ts` — CanonicalCapability type (13 canonical IDs)
- `src/lib/atlas/integrations/types.ts` — IntegrationDefinition, IntegrationConfig, UserConnection types
- `src/lib/atlas/integrations/registry.ts` — CRUD for integrations, configs, connections
- `src/lib/atlas/integrations/credential-store.ts` — CredentialStore service
- `src/lib/atlas/integrations/selector.ts` — IntegrationSelector stub for Policy Engine
- 5 new Prisma models: Capability, Integration, IntegrationCapability, IntegrationConfig, UserConnection
- `scripts/seed-registry.ts` — seeds 12 capabilities + 8 integrations

---

## Milestone 2: Policy Engine + Behavioral Validation Hardening
**Status:** ✅ Complete

### Phase 6 — Policy Engine (`IntegrationSelector`)
- Replaced the stub in `src/lib/atlas/integrations/selector.ts` with a full policy chain
- 7 policy tiers: user-override → enterprise-approved → health → user-preference → cost → speed → fallback
- Injectable data loaders (integrations/configs/connections/health/cost/latency) with Prisma-backed defaults
- Decision trace (`policies[]`) + human-readable `reason` chain on every selection
- `resolveSelectedProvider()` convenience + `integrationSelector` singleton for the runtime
- Wired into `src/lib/execution/engine.ts` (live + streaming paths): a decisive policy can now auto-resolve
  multi-provider selection, wrapping the legacy `flows/registry` + `provider-state` path
- 12 policy tests in `scripts/test-agent/suites/policy.test.ts` (override, allowlist, health, cost/speed
  rank, owner + connection requirements, reason chain)

### Behavioral Validation Hardening
- Root cause of `npm run test:behavioral` hang: unbounded `fetch` with no timeout + no connectivity check
- Added 30s request timeouts + AbortError handling in `replay-engine.ts` (`AtlasApiClient`)
- Added `assertServerReachable()` fail-fast preflight (pings `/api/domains`) with a clear error message
- Wired preflight into the CLI (`run`, `runAllDatasets`); 23-dataset batch now completes
- Fixed report-generator crash on empty assistant responses
- Validation framework is now type-clean: fixed bad import paths, missing `ExpectationTurn`,
  undefined/boolean hazards, `map.entries()` iteration under es5, un-awaited `diffVersions`/`export`
- Fixed `metrics-service` `behaviorRegression` field name + required-after-optional param

### Test/Typecheck Status
- Agent suites: **345 passed / 1 skipped** across 14 files (12 new Policy Engine tests)
- Project `tsc` now reports 47 errors, all confined to `scripts/retrace-audit.ts` — the
  behavioral validation framework and policy engine are type-clean
- Behavioral CLI 23-dataset batch runs to completion (no more 120s hang)

---

## Milestone 3: Unified Capability Registry (Control Plane)
**Status:** 🚧 In progress

### Phase 0 — Registry Backend (✅ Complete)
- 3 new Prisma models: `Skill`, `Provider`, `ConnectorAudit` (both `schema.prisma` + `schema.postgresql.prisma`)
- Migration applied to `dev.db`; client regenerated
- `src/lib/atlas/registry/index.ts` — typed CRUD: providers (list/get/create/update/delete/test), skills, `listEnabledSkills()`
- `src/lib/atlas/registry/audit.ts` — `recordConnectorAudit()` best-effort audit writer
- Admin API routes (401-guarded via `requireAtlasAdmin`):
  - `/api/admin/skills` + `/api/admin/skills/[id]`
  - `/api/admin/providers` + `/api/admin/providers/[id]`
  - `/api/admin/connectors/audit` — real DB feed (was 404; panel previously fell back to sample rows)
- `scripts/seed-registry.ts` — now also seeds 9 providers + 8 skills (idempotent upserts; integration cleanup unchanged)

### Phase 3 — Admin UI Wiring (✅ Complete)
- `src/components/atlas/skills-panel.tsx` — list/create/toggle/detail/delete, live/status badges, category counts
- `src/components/atlas/providers-panel.tsx` — list/create/toggle/test/detail/delete, endpoint/credential inspector, last-test badge
- New "Registry" group in the Control Plane nav (`atlas-admin.tsx`) with Skills + Providers tabs
- Audit feed is now live: `atlas-agent.ts` records real `ConnectorAudit` rows at every completion point
  (order place → pending payment / success, gateway `execute`, UPI `confirm_payment`)
- Verified: tsc clean for all touched files; audit route query returns `integrationName` via join (probe row round-trip tested)

## Final Test Summary

| Suite | Tests | Status |
|---|---|---|
| Infrastructure | 17 | ✅ |
| Planner | 51 | ✅ |
| Tool Registry | 62 | ✅ |
| Memory | 31 | ✅ |
| MCP Transport | 18 | ✅ |
| Execution Engine | 14 | ✅ |
| Food Domain | 24 | ✅ |
| Shopping Domain | 28 | ✅ |
| Behavioral Infra | 38 | ✅ |
| Behavioral Replay | 8 + 1 skipped | ✅ |
| Diff Engine | 21 | ✅ |
| Golden Datasets | 17 | ✅ |
| Policy Engine | 12 | ✅ |
| **Total** | **345** | **0 failed** |

## Key Files

| Path | Purpose |
|---|---|
| `src/lib/atlas/capabilities/types.ts` | Canonical capability identifiers |
| `src/lib/atlas/integrations/types.ts` | Integration, config, connection types |
| `src/lib/atlas/integrations/registry.ts` | Integration CRUD |
| `src/lib/atlas/integrations/credential-store.ts` | Credential encapsulation |
| `src/lib/atlas/integrations/selector.ts` | IntegrationSelector stub |
| `src/lib/atlas/integrations/routing.ts` | Generic domain lock resolver |
| `scripts/test-agent/` | 13 test suites, replay engine, diff engine, reporters |
| `prisma/schema.prisma` | +5 models (Capability, Integration, IntegrationCapability, IntegrationConfig, UserConnection) |
