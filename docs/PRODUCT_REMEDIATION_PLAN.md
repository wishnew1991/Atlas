# Atlas — Release Remediation Plan

**Prepared:** 2026-08-05
**Source:** `docs/PRODUCT_ACCEPTANCE_TEST_PLAN.md`
**Principle:** No architecture redesign. Fix what exists, in release order.
**Effort scale:** S < 1 day · M 1–3 days · L 1–2 weeks
**Gate:** Beta ships when all P0 + P1 items are resolved and verified by the manual QA checklist.

---

## P0 — Must fix before any beta

### P0-1 · Fresh clone does not boot (DB never migrated or seeded) — ✅ DONE
- **Confirm:** `prisma/dev.db` = 0 bytes / 0 tables (verified via better-sqlite3). `predev` (`package.json:6`) runs only `npx prisma generate` — no `migrate deploy`, no `db push`, no `seed:registry`. 10 migrations exist in `prisma/migrations/`, none applied. Every DB-backed route (chat, profile, tasks, admin, connections) 500s with "no such table".
- **Why P0:** Directly *prevents the application from booting* for any user who clones the repo — the exact P0 definition. Also blocks the integration registry (empty ⇒ no connections/shopping/food data at all).
- **Effort:** S
- **Fix (no redesign):** add `prisma migrate deploy` and `prisma db seed` (with a seed target for `scripts/seed-registry.ts`) to `predev`, or an idempotent migrate-on-boot guard in `src/lib/atlas/server/prisma.ts`. Verify `npm run dev` on a wiped DB creates tables + seeds.
- **Order:** 1
- **Status:** `predev` and `dev:clean` now run `prisma migrate deploy` + `scripts/seed-registry.ts`. Verified on a wiped DB: 10 migrations applied, 35 tables, 12 capabilities, 8 integrations.

### P0-2 · Authentication broken at sign-up (user never gets a session) — ✅ DONE
- **Confirm:** `src/lib/auth/index.ts:11` — `emailAndPassword: { enabled: true, autoSignIn: false }`. After `POST /api/auth/sign-up/email` succeeds, the client navigates to `/chat` (`local-auth-screen.tsx:88-89`) with **no session cookie issued**, so the new user is anonymous until a *second* sign-in. `getAtlasActor()` returns `userId: "anonymous"` (`src/lib/atlas/server/auth.ts:50`).
- **Why P0:** *Breaks authentication* — the primary account-creation flow does not authenticate the user.
- **Effort:** S
- **Fix:** set `autoSignIn: true`, or on sign-up redirect the client to `/sign-in` with a "check your inbox / sign in" message. Add a follow-up assertion: after sign-up, `getAtlasActor().isAuthenticated === true`.
- **Order:** 2
- **Status:** `autoSignIn: true` in `src/lib/auth/index.ts`.

### P0-3 · Data leakage — all anonymous visitors share one identity — ✅ DONE
- **Confirm:** Unauthenticated users map to the constant `"anonymous"` actor (`src/lib/atlas/server/auth.ts:50`); profile API falls back to `"atlas-demo-user"` (`src/app/api/profile/route.ts:19`). `persist.ts` only excludes `"atlas-demo-user"` (never `"anonymous"`). Every guest writes/reads the same tasks, activity, profile, memory, and executions (DB shows guest `Execution` rows with NULL userId).
- **Why P0:** *Causes data leakage* — user A's memory/profile/tasks are visible to any other anonymous visitor.
- **Effort:** M
- **Fix (no redesign):** issue a cryptographically random per-visitor `atlas-user-id` cookie (welcome screen already generates one — `welcome-screen.tsx:34-43`) and have the server identity resolver prefer it over `"anonymous"`; or force auth before any write surface. Key DB rows on the cookie value so guests are isolated.
- **Order:** 3
- **Status:** middleware now issues a per-visitor `crypto.randomUUID()` cookie for unauthenticated requests (`src/middleware.ts`); `getAtlasActor` resolves the guest id from that cookie instead of `"anonymous"` (`src/lib/atlas/server/auth.ts`); welcome screen no longer generates a conflicting id. Every guest's conversations/executions/memory/profile are now keyed on their unique cookie id.

---

## P1 — Required for a usable beta

### P1-1 · Admin authorization is wide open (and has a latent bug) — ✅ DONE
- **Confirm:** `src/lib/atlas/server/auth.ts:63` — `if (adminIds.length === 0) return true;` ⇒ with `ATLAS_ADMIN_USER_IDS` unset, **every signed-in user is an admin**. `src/middleware.ts:35` passes the raw `session_token` cookie into `isConfiguredAdmin`, comparing token strings against user IDs — admin becomes unreachable for everyone the moment the env var is set. Admin "Sign out" link points to `/sign-out`, which **does not exist** (`atlas-auth-controls.tsx:10`, verified no route).
- **Why P1:** *Admin authorization issues* (explicit P1 bucket). Not a data leak to *guests*, but over-exposes admin to all signed-in users and silently breaks if configured.
- **Effort:** S–M
- **Fix:** resolve user id from the session server-side (`auth.api.getSession`) instead of the token string; seed `ATLAS_ADMIN_USER_IDS`; add `/sign-out` route or point the link at better-auth's sign-out.
- **Order:** 4
- **Status:** 
  - `Sign out` now calls `POST /api/auth/sign-out` instead of 404ing.
  - The middleware can **not** evaluate the allowlist: better-auth session tokens are opaque random strings (not JWTs — verified by signing in via `auth.api.signInEmail`), and Edge middleware has no DB access. Admin authorization is enforced server-side where the session can be resolved: the `/admin` page (server component, `isAtlasAdminActor`) and the admin API routes (`requireAtlasAdmin`). Middleware only redirects *signed-out* users from `/admin` to `/sign-in`.
  - `isAtlasAdminActor`: when `ATLAS_ADMIN_USER_IDS` is set it is an allowlist; when unset it allows signed-in users in dev/test (working local admin UI out of the box) and **denies in production**. `.env.example` documents the allowlist.
- **Note:** a temporary JWT-based middleware check was attempted and removed after this was discovered.

### P1-2 · Onboarding is broken (orphaned welcome + name never lands in profile)
- **Confirm:** `/welcome` is reachable only by typing the URL (no link anywhere). Its UUID cookie is **ignored by the backend** — `/api/profile` keys off the shared actor, so the typed name lands on the shared anonymous/demo profile. Sign-up name is never seeded (`identityFromClerk()` returns null, `profile/service.ts:82-84`).
- **Why P1:** *Broken onboarding* (explicit P1 bucket) — first-run experience fails and the identity data is discarded.
- **Effort:** M
- **Fix:** route new sign-ins through `/welcome` once; after name entry, call `seed_identity` (route already supports it, `profile/route.ts:49-56`) and persist the identity server-side against the real session (not a cookie the backend ignores). Depends on P0-3 (identity plumbing).
- **Order:** 5
- **Status:** P0-3 partially unblocks this (guest name now seeds against the guest's cookie id). Remaining: route new users through `/welcome` once and seed sign-up name into the profile.

### P1-3 · Chat persistence missing (history lost on refresh) — ✅ DONE
- **Confirm:** `appendConversationTurn` (the transcript writer) has **zero callers** — grep finds it only in `persist.ts` itself. The chat route never creates `Conversation`/`Message` rows; only `Execution` rows are written. `conversationId` never materializes (client sends `null`, server echoes `null`). After refresh the client falls back to the welcome message.
- **Why P1:** *Missing chat persistence* (explicit P1 bucket) — a core chat product must survive reload.
- **Effort:** M
- **Fix:** call `appendConversationTurn` (user + assistant) from the chat write path (`route.ts` / `engine.ts`), return a real `conversationId` in the SSE `done` event, and confirm the restore effect (`atlas-chat-provider.tsx:121-181`) loads history. Note: this also unlocks end-to-end Memory recall (memory extraction requires an LLM + a persisted transcript).
- **Order:** 6
- **Status:** chat route resolves/creates the conversation, passes the real id through execution + agent, returns it in `done`/`meta`/JSON, and persists each completed turn via `appendConversationTurn` (streaming + non-streaming). Restore loop (`/api/conversations?latest=1` + `/api/conversations/:id`) already existed and now receives real data.
- **Note (schema):** this surfaced a broken FK — `Conversation.userId` and `Approval.userId` referenced the legacy `AtlasUser` table that is never populated (better-auth writes to `User`). Removed both FKs (matching the `Execution` precedent) via migration `20260806030907_drop_atlasuser_fks`. Persistence verified with a direct smoke test (guest id → resolve → append → restore).

### P1-4 · Connections cannot be configured end-to-end
- **Confirm:** OAuth requires `SWIGGY_MCP_CLIENT_ID`/scope (mcp-oauth.ts falls back to `"atlas-dev-client"` and is inert). `.env.example` documents `ATLAS_MCP_GATEWAY_URL`/`TOKEN`, but **no code reads them** — `routeToolCall` (`mcp/router.ts`) only consults the `McpServer` table, which has 0 rows. API-key connects store a key nothing executes against. Registry is empty until `npm run seed:registry` runs manually.
- **Why P1:** *Connections that cannot be configured* (explicit P1 bucket) — the whole "connect a service" promise is non-functional.
- **Effort:** L
- **Fix:** wire `ATLAS_MCP_GATEWAY_URL` as a fallback target in `routeToolCall`; complete the OAuth client registration/callback path; make `seed:registry` part of boot (P0-1); add a smoke test that a connected integration is reachable.
- **Order:** 7
- **Status:** registry now seeds on boot (via P0-1); gateway-env wiring and real OAuth client registration remain.

### P1-5 · No capability executes end-to-end for a real user
- **Confirm:** Food tools exist + 24 unit tests, but require a live Swiggy MCP server (0 configured). Payments are simulated (dummy provider); non-food actions reply "confirmed in demo mode" (`atlas-agent.ts:192-200`). Shopping is client-side demo. So today **nothing a user does results in a real external action**.
- **Why P1:** A usable beta needs at least one real, verifiable action flow (food: discover → order → approve → pay). Without it, Atlas is a chat wrapper.
- **Effort:** L
- **Fix:** depends on P1-4. Stand up the food MCP endpoint, register OAuth, and connect a real payment path (or an explicitly labeled sandbox) through `executeAtlasAction` + `confirm-upi`. Keep scope to food only for beta.
- **Order:** 8
- **Status:** the `Approval` FK fix (see P1-3) removes a guaranteed 500 in the real approval path; live MCP/payment wiring remains.

---

## P2 — Product completeness (post-beta)

### P2-1 · Notifications — no system exists
- **Confirm:** no notification API route (glob finds none); only a `notifications` fixture array (`content.ts:235-251`) and a demo badge. `NotificationSendJob`/`JobType.NOTIFICATION_SEND` are declared in `src/lib/queue/index.ts` with **no producer or consumer**.
- **Effort:** L

### P2-2 · Shopping integration — client demo only
- **Confirm:** `shopping-flow.tsx` + `atlas-demo-provider.tsx` are pure client state + `setTimeout`; hardcoded products from `shopping.ts`; `DefaultIntegrationSelector.select()` is a stub returning `null` (`selector.ts:27`).
- **Effort:** L

### P2-3 · Voice improvements
- **Confirm:** STT is real; TTS is Piper-local only — model/cloud TTS explicitly unwired (`tts/route.ts:63`, returns 501 with no target). Voice loop (STT→chat→TTS) not closed.
- **Effort:** M

### P2-4 · Multi-capability execution
- **Confirm:** non-food capabilities (travel/rides/calendar/appointments/payments) map only to generic `atlas_search` + `atlas_prepare_approval` (`tools/registry.ts:482-499`) — no real domain tools, so no multi-step journey can execute its actions.
- **Effort:** L

### P2-5 · Settings drawer shows fixture data
- **Confirm:** Payment methods, Profile ("Alex Morgan"), History, Privacy, Capabilities, Activity in the drawer are hardcoded `content.ts` rows — non-interactive and contradictory to the real profile page.
- **Effort:** S

### P2-6 · Demo-vs-live honesty (misleading "Connected")
- **Confirm:** client flips to `mode="live"` on any `done` event (`atlas-chat-provider.tsx:393-395`), even for canned `demoResponse` text (`mode: "demo"`), so the toolbar claims "Connected" without a real model.
- **Effort:** S

### P2-7 · Performance / queue
- **Confirm:** BullMQ workers not started (`workers.ts:3-4`); queue stats + dead-letter return 501; chat executes synchronously in-request (slow model blocks the request); no p95/p99 surfacing in the running product.
- **Effort:** M–L

### P2-8 · Error-recovery UX hardening
- **Confirm:** hard LLM failures surface as a bare error bubble / 500 (no demo fallback); no retry UX; MCP food outage text is abrupt. Unit-level recovery is tested; user-facing recovery is not.
- **Effort:** M

---

## Recommended implementation order

| # | Item | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|
| 1 | P0-1 Boot (migrate + seed) | P0 | S | — | ✅ |
| 2 | P0-2 Auth sign-in after sign-up | P0 | S | — | ✅ |
| 3 | P0-3 Guest identity isolation | P0 | M | P0-2 | ✅ |
| 4 | P1-1 Admin authorization | P1 | S–M | P0-2 | ✅ |
| 5 | P1-2 Onboarding | P1 | M | P0-3 | ⏳ (P0-3 done; route + seed remain) |
| 6 | P1-3 Chat persistence | P1 | M | P0-1 | ✅ |
| 7 | P1-4 Connections config | P1 | L | P0-1 | ⏳ |
| 8 | P1-5 One e2e action flow (food) | P1 | L | P1-4 | ⏳ |
| 9 | P2-5 Settings drawer fixtures | P2 | S | — | |
| 10 | P2-6 Demo/live honesty | P2 | S | — | |
| 11 | P2-8 Error-recovery UX | P2 | M | P1-3 | |
| 12 | P2-3 Voice | P2 | M | P1-5 | |
| 13 | P2-7 Performance/queue | P2 | M–L | P1-3 | |
| 14 | P2-1 Notifications | P2 | L | P1-3 | |
| 15 | P2-4 Multi-capability execution | P2 | L | P1-5 | |
| 16 | P2-2 Shopping integration | P2 | L | P1-5 | |

**Beta gate:** items 1–8 complete; items 9–16 deferred.

## Verification for each fix
Re-run the affected sections of the Manual QA Checklist in `docs/PRODUCT_ACCEPTANCE_TEST_PLAN.md`:
- P0-1 → Phase 0 (fresh-clone boot)
- P0-2/P0-3/P1-2 → Phase 1 (onboarding/auth) + Phase 5 (memory/profile isolation)
- P1-1 → Phase 2 (admin gate + sign-out)
- P1-3 → Phase 3 (chat, then refresh)
- P1-4/P1-5 → Phase 6 (connections) + Phase 7 (food e2e)

Plus the framework suites (`npm run test:agent`) to confirm no regression in planner/tools/memory/mcp.
