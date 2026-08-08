# Atlas — Remaining Work

## Immediate: Integration Registry Completion

### 1. Admin API Endpoints for Integration CRUD
Create REST endpoints to manage integrations from the admin panel:

| Endpoint | Purpose |
|---|---|
| `GET /api/admin/integrations` | List all Integration definitions with capabilities |
| `POST /api/admin/integrations` | Register a new Integration definition |
| `PUT /api/admin/integrations/:id` | Update Integration metadata |
| `DELETE /api/admin/integrations/:id` | Remove Integration (if no active connections) |
| `GET /api/admin/integrations/:id/config` | Get IntegrationConfig |
| `PUT /api/admin/integrations/:id/config` | Upsert IntegrationConfig (API key, base URL) |
| `GET /api/admin/integrations/health` | Return health status per integration |

**Files:** `src/app/api/admin/integrations/route.ts`, `src/app/api/admin/integrations/[id]/route.ts`

---

## Upcoming: Policy Engine (Phase 6)

### 2. IntegrationSelector Full Implementation
Replace the stub in `src/lib/atlas/integrations/selector.ts` with a configurable policy chain:

| Policy | Priority | Purpose |
|---|---|---|
| UserOverride | 0 | User explicitly named an integration |
| EnterpriseApproved | 10 | Filter to approved integrations |
| HealthGate | 20 | Skip unhealthy integrations |
| UserPreference | 30 | User's saved default |
| CostOptimize | 40 | Rank by total cost |
| SpeedOptimize | 50 | Rank by historical latency |
| Fallback | 100 | Pick highest-scored remaining |

### 3. Wire Integration Selector into Engine
Replace the current provider selection code in `engine.ts` (lines ~110-131) with calls to the IntegrationSelector. The existing `provider-state.ts` and `flows/registry.ts` path becomes the legacy path that the selector wraps.

---

## Upcoming: User Connections

### 4. Connections UI in Profile
Add a "Connections" section to the Profile page:

- List linked integrations with status indicators (active/expired/revoked)
- Connect/Disconnect buttons per integration
- OAuth flow triggering from user context

### 5. User Connection API
| Endpoint | Purpose |
|---|---|
| `GET /api/user/connections` | List user's connections |
| `POST /api/user/connections/:integrationId/connect` | Start OAuth flow |
| `DELETE /api/user/connections/:id` | Disconnect |

---

## Upcoming: Behavioral Framework (Full Stack)

### 6. Make ATLAS_BEHAVIORAL_LIVE=1 Work End-to-End
The full-stack replay test is currently skipped. Goal: start the full Next.js server with MockLLM + MockMCP, replay all 8 golden conversation datasets, and diff against baselines.

### 7. Baseline Generation Workflow
```
npm run test:agent:baseline  # generate golden traces from current behavior
```

### 8. Regression Detection in CI
Fail CI builds when behavioral traces diverge from baselines beyond configured thresholds.

---

## Future: Additional Domains

| Domain | Tests Needed | Effort |
|---|---|---|
| Travel | ~28 | Medium |
| Rides | ~28 | Medium |
| Appointments | ~28 | Medium |
| Payments | ~28 | Medium |

Each follows the Shopping reference implementation pattern.

---

## Future: Control Plane (Phase B)

### B.1 — Planner v2
- Domain-agnostic capability planning with pluggable strategies (keyword, semantic, composite)
- Confidence scoring per strategy

### B.2 — Workflow Engine
- State machine replacing unused 9-step pipeline
- Domain-specific step registration
- Durable workflow context via Prisma WorkflowSession

### B.3 — Mission Engine
- Autonomous multi-step task execution
- Scheduling, retry, recovery
- Mission persistence

### B.4 — Provider Health
- Periodic health checks per integration
- Latency tracking (p50/p95/p99)
- Automatic circuit breaking on repeated failures

### B.5 — Typed Profile
- Replace JSON columns with structured types
- Profile validation via Zod schemas

### B.6 — Activity Timeline
- Grouped event feed with filtering
