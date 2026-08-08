# Atlas — Product Acceptance Test Plan

**Prepared:** 2026-08-05
**Scope:** Can a real user successfully use Atlas today?
**Method:** Code-path trace + live DB inspection + UI surface audit. Every verdict cites evidence.
**Judge:** A user who cloned the repo, ran `npm install` + `npm run dev`, and has **no special configuration**.

> **Bottom line: a fresh clone cannot run.** `prisma/dev.db` is a 0-byte file with zero tables, and no script (`predev` only runs `prisma generate`) applies the 10 migrations in `prisma/migrations/`. Every DB-backed query throws "no such table". The product is *buildable but not bootable* out of the box.

---

## Critical prerequisite finding (read first)

| Item | Evidence |
|---|---|
| Database file | `prisma/dev.db` = **0 bytes, 0 tables** (verified with `better-sqlite3`) |
| Migrations | 10 exist in `prisma/migrations/`, none applied |
| Boot path | `predev` = `npx prisma generate` only; no `migrate`/`db push` anywhere |
| Consequence | Fresh clone → chat/admin/profile all 500 with "no such table" |

**To even attempt QA you must first run:** `npx prisma migrate dev && npm run seed:registry` (seed not auto-run either — integration registry tables will be empty).

---

## 1. User onboarding

**Status: FAIL** (welcome is an orphaned cosmetic dead-end; sign-up doesn't sign in)

- **What works:** `POST /api/auth/sign-up/email` is a real better-auth/Prisma write. `/welcome` seeds a name into the profile table.
- **What is broken:**
  - Sign-up sets `autoSignIn: false` (`src/lib/auth/index.ts:9-12`) — after sign-up you are **not** logged in and must sign in again.
  - The name typed at sign-up never reaches the profile (`identityFromClerk()` hard-returns `null`, `profile/service.ts:82-84`).
  - The Welcome screen's generated UUID cookie is **ignored by the backend** — `/api/profile` keys off the shared `"anonymous"` actor, so all guests write to one shared profile row.
  - Nothing links to `/welcome`; a user can only reach it by typing the URL.
- **Cannot test today:** any onboarding that survives refresh or is tied to a real account.
- **Manual verify:** `/sign-up` → create account → land on `/chat` → refresh → check whether you are signed in (you are not) → `/welcome` → type name → go to Profile (name is not there).
- **Confidence:** High (direct code trace + empty DB evidence).

## 2. Authentication

**Status: PARTIAL** (real better-auth backend, but identity is effectively optional and guests are shared)

- **What works:** Email/password sign-in/out, sessions in DB, middleware gate on `/admin`, `getAtlasActor()` reads real session.
- **What is broken:**
  - The whole consumer app is **open to anonymous users**; every anonymous visitor shares `userId: "anonymous"`, so tasks/activity/profile/memory are shared across all guests.
  - Admin "Sign out" link points to `/sign-out` which **does not exist → 404** (`atlas-auth-controls.tsx:10`).
  - Admin gate is wide open: `isAtlasAdminActor` returns `true` when `ATLAS_ADMIN_USER_IDS` is unset (`auth.ts:57-65`), so **every signed-in user is an admin**. Latent bug: middleware compares the raw session *token* against user IDs.
- **Cannot test today:** role-based access (only "everyone is admin" or "nobody").
- **Manual verify:** sign in → visit `/admin` (allowed, should not be) → click "Sign out" in admin header (404).
- **Confidence:** High.

## 3. Chat

**Status: PARTIAL** (real SSE transport, but canned demo replies by default; no persistence)

- **What works:** POST `/api/chat`, real SSE stream (`token`/`done`/`error` events), execution rows created per message, real LLM path when a model is configured.
- **What is broken:**
  - **No default LLM.** Empty registry + no `OPENAI_API_KEY` ⇒ `resolveModelChain` returns `null` ⇒ every message hits the canned `demoResponse` keyword-script (`atlas-agent.ts:335-408`). "hello" → fixed "I'm Atlas, your assistant…" text.
  - **No history.** Chat transcripts are never written (`appendConversationTurn` has zero callers); reloading the page loses everything. `conversationId` never materializes.
  - **Misleading UI:** the client flips to "Connected" on any `done` event, even for demo text (`atlas-chat-provider.tsx:393-395`).
  - **No graceful LLM failure.** Bad key/timeout → 500 / streamed error; no demo fallback on hard API failure.
  - **Stage/timeline events never emitted** in the default path — the execution timeline stays "Starting…".
  - **Fresh clone:** DB unmigrated → message 500s with "no such table" before any reply.
- **Cannot test today:** grounded general Q&A (needs LLM key + Serper key or search MCP), real streaming of a real model out of the box.
- **Manual verify:** open Chat → type "hello" → observe canned reply → note toolbar says "Connected" → refresh → history gone → type a novel question → same canned line regardless.
- **Confidence:** High.

## 4. Memory

**Status: PARTIAL** (engine fully built and unit-tested; not reachable end-to-end out of the box)

- **What works:** The memory service (remember/recall/consolidate/knowledge-graph, blended scoring) is implemented and covered by 31 unit tests.
- **What is broken:** No verified end-to-end loop. The LLM-extraction layer that turns chat into memories requires a configured model; with the default demo path, nothing gets extracted, and memory is stored under the shared anonymous/shared profile. No persisted chat transcript means no conversational memory to recall across a refresh.
- **Cannot test today:** "Remember my preference" → persists → recalled in a later session.
- **Manual verify (best effort):** Profile → Memories → add a memory → refresh → confirm it persists (DB-backed, likely works) → open chat and ask Atlas to use that preference (fails without model).
- **Confidence:** Medium-High.

## 5. Profile

**Status: PARTIAL** (CRUD is real and DB-backed; identity/ownership is broken)

- **What works:** Profile page name/phone/email, add/delete addresses and payments, memories, and **real privacy toggle persistence** via `PATCH /api/profile` (`profile-board.tsx:601-639`, `profile/route.ts:122-135`).
- **What is broken:**
  - Guests map to `"atlas-demo-user"`/`"anonymous"` — **all anonymous visitors share one profile**.
  - Sign-up name is never seeded into the profile.
  - Settings drawer's Profile/Payment/Privacy cards are **hardcoded fixtures** from `content.ts` ("Alex Morgan", non-interactive "Edit" badges) — cosmetic duplicates of the real page.
- **Cannot test today:** per-user isolated profiles for unsigned visitors.
- **Manual verify:** sign in as real user → edit profile → refresh (persists) → sign out → another user sees the same data if also unsigned.
- **Confidence:** High.

## 6. Connections (integrations)

**Status: PARTIAL** (APIs + UI are real; nothing external is actually reachable)

- **What works:** `/api/user/connections` list/connect/disconnect, DB-backed `UserConnection` rows, connection cards in Profile + Settings drawer, API-key connect flow.
- **What is broken:**
  - **No real OAuth provider is wired.** Swiggy OAuth requires `SWIGGY_MCP_CLIENT_ID`/`SCOPE` (unset) and a live MCP endpoint. Connect attempts for OAuth integrations cannot complete.
  - API-key connect stores a key but nothing executes against it (no gateway reads it).
  - Fresh clone: registry not seeded → no integrations appear at all.
- **Cannot test today:** authenticating to any real third party (Google, Swiggy, Amazon, Uber…).
- **Manual verify:** Profile → Connections → attempt Connect on Swiggy (no real OAuth) → disconnect a seeded integration → reconnect.
- **Confidence:** High.

## 7. Food ordering (end-to-end)

**Status: FAIL** (full demo flow exists but cannot reach a real service; dependent on unprovisioned Swiggy MCP + unmigrated DB)

- **What works:** The 9 food tools, food domain service, approval card generation, UPI confirm route, and 24 unit tests all exist.
- **What is broken:**
  - Requires a live Swiggy MCP server row (`McpServer` table) — **0 servers configured**, and `routeToolCall` only consults that table.
  - No OAuth client registered (env vars unset). The MCP gateway env vars in `.env.example` (`ATLAS_MCP_GATEWAY_URL`) are **read by no code**.
  - Payment is **simulated** (dummy payment provider) — no real Fewsats/Stripe path; `executeAtlasAction` non-food actions reply "confirmed in demo mode" (`atlas-agent.ts:192-200`).
  - Fresh clone blocks everything at the DB.
- **Cannot test today:** placing a real order, real payment, real order tracking.
- **Manual verify:** Chat → "I'm hungry" → observe the outage message "I couldn't reach Swiggy just then" → note cart/checkout cannot proceed to a real order.
- **Confidence:** High.

## 8. Shopping (end-to-end)

**Status: FAIL** (client-side demo only)

- **What works:** `/shopping` page renders an interactive fixture flow with hardcoded products (`shopping.ts`), stage machine, and timers. Not in the nav.
- **What is broken:** It is 100% client state + `setTimeout`; no backend, no cart, no checkout, no payment. `DefaultIntegrationSelector.select()` is a stub returning `null` (`selector.ts:27`).
- **Cannot test today:** real product search, price comparison, or purchase.
- **Manual verify:** visit `/shopping` → browse → "buy" → nothing persists, refresh resets to start.
- **Confidence:** High.

## 9. Multi-capability conversations

**Status: PARTIAL** (planner supports it; execution is shallow)

- **What works:** Planner routes food/travel/rides/shopping keywords; a `food-then-shopping` dataset exists in the test suite; domain locking during an active flow is implemented.
- **What is broken:** Non-food capabilities map only to generic `atlas_search` + `atlas_prepare_approval` — **no real domain tools** for travel/rides/calendar/appointments/payments (`tools/registry.ts:482-499`). Multi-step journeys can't execute their actual actions.
- **Cannot test today:** "Book flight → hotel → ride → calendar → pay" as one flow.
- **Manual verify:** Chat → "book a flight" → observe it only prepares an approval with no real booking capability.
- **Confidence:** Medium-High.

## 10. Admin panel

**Status: PARTIAL** (real and functional, but over-exposed)

- **What works:** LLM credentials, models (incl. live provider model listing), routing/fallbacks, domains, search key, voice config, MCP servers (add/discover), integrations CRUD — all DB-backed and wired to real APIs.
- **What is broken:**
  - Open to **any signed-in user** (`ATLAS_ADMIN_USER_IDS` unset ⇒ everyone admin).
  - "Sign out" 404s.
  - Discovered-tools list on MCP edit is a placeholder (`atlas-admin.tsx:1025`).
  - Fresh clone: admin page renders but saving requires a migrated DB.
- **Cannot test today:** restricted admin roles.
- **Manual verify:** sign in → `/admin` → add a credential → add a model → save → verify it appears in routing.
- **Confidence:** High.

## 11. LLM configuration

**Status: PASS** (when DB is migrated)

- **What works:** Full CRUD + live `/models` discovery from OpenAI/NVIDIA/Google/Anthropic, default/fallback chain persists, and `resolveModelChain` actually uses the configured model (`reply.ts:57-81`).
- **What is broken:** Nothing in the flow itself; it's just unreachable until the DB is migrated.
- **Manual verify:** Admin → Providers → add key → discover models → attach → set default → chat answers with real content.
- **Confidence:** High.

## 12. Integration management

**Status: PARTIAL** (registry CRUD is real; selection/policy engine is a stub)

- **What works:** Integration definitions/configs/health/capability-mapping CRUD, seeded via `npm run seed:registry`.
- **What is broken:** `selector.ts` (which integration wins per capability) is a stub — no policy engine, so priority is not actually enforced at runtime.
- **Manual verify:** Admin → Integrations → toggle/configure → check health endpoint responds.
- **Confidence:** High.

## 13. MCP Servers

**Status: PARTIAL** (real client + discovery, nothing real to connect to)

- **What works:** Add/list/discover/health, SSE JSON-RPC client, tool caching, `mcp__server__tool` naming, tool routing — genuinely functional against a real endpoint.
- **What is broken:** **0 servers configured** and none provisionable without external credentials. OAuth client registration is inert (env unset).
- **Manual verify:** Admin → MCP → add a public SSE MCP endpoint → discover → verify tools appear and route.
- **Confidence:** High (client verified by 18 protocol tests).

## 14. Search

**Status: PARTIAL** (real Serper wiring, fails soft, needs a key)

- **What works:** Admin stores + live-tests Serper key; `web_search` tool calls Serper, falls back to MCP search, then a graceful "couldn't reach" message — **never fabricates**.
- **What is broken:** No key configured by default ⇒ search returns nothing useful. No key is in `.env` (only `DATABASE_URL` + `GEMINI_API_KEY`, and the latter is never read by app code).
- **Manual verify:** Admin → Search → add Serper key → test → Chat → "latest news" → grounded reply.
- **Confidence:** High.

## 15. Voice

**Status: PARTIAL** (STT real, TTS local-only, no model TTS)

- **What works:** Mic capture, server STT (OpenAI/Groq/NVIDIA-compatible), Piper local TTS, admin voice config + audible "Test TTS".
- **What is broken:** Model/cloud TTS is explicitly unwired (`tts/route.ts:63` returns 501 without a TTS target); Piper requires a local venv + `.onnx` voice not present in repo. Voice conversation loop (STT→chat→TTS) is not closed.
- **Manual verify:** Admin → Voice → Test TTS (works only if Piper set up) → Chat mic (needs STT model config).
- **Confidence:** Medium.

## 16. Settings

**Status: FAIL** (drawer is mostly hardcoded fixtures)

- **What works:** The Connections card reads real data.
- **What is broken:** Payment methods, Profile summary, History, Privacy, Capabilities, Activity in the drawer are **fixtures from `content.ts`** — non-interactive, wrong ("Alex Morgan"), and can contradict the real profile page. No link to the real Profile flows from most cards.
- **Manual verify:** Open Settings → compare drawer rows to your actual profile → they are canned.
- **Confidence:** High.

## 17. Privacy

**Status: PARTIAL** (real on Profile page, cosmetic in drawer/demo)

- **What works:** Profile page privacy toggles persist real booleans (`saveMemory`, `useLocation`, `shareAnalytics`) to DB.
- **What is broken:** Drawer privacy card and `togglePrivacyControl` demo are client-side only, no persistence.
- **Manual verify:** Profile → toggle privacy → refresh → persists. Drawer → toggle → refresh → reverts.
- **Confidence:** High.

## 18. Notifications

**Status: NOT IMPLEMENTED**

- **Evidence:** No notification API route exists. Only a `notifications` fixture array (`content.ts:235-251`) + demo badge. `NotificationSendJob`/`JobType.NOTIFICATION_SEND` are defined in the queue types but have **no producer or consumer** anywhere.
- **Manual verify:** There is nothing to test; the only "notification" is the demo home badge.

## 19. Error recovery

**Status: PARTIAL** (unit-tested recovery paths; weak user-facing UX)

- **What works:** MCP timeout/error recovery, model fallback chain (configurable), 400/401/429 rate limiting on chat, graceful "couldn't reach service" text for food/search.
- **What is broken:** No demo fallback on hard LLM failure (user sees "Atlas could not process this request"); queue/dead-letter endpoints are 501 "paused"; no retry UX.
- **Manual verify:** With a bad model key → send chat → observe error bubble. With no key → observe canned reply but "Connected" label.
- **Confidence:** Medium.

## 20. Performance

**Status: PARTIAL** (infra measured; nothing production-shaped)

- **What works:** Execution runs synchronously in-request; latency metrics captured in the validation framework; rate limiting (20/min) on chat.
- **What is broken:** BullMQ/Redis workers explicitly not started (`workers.ts:3-4`); queue stats/dead-letter return 501; no queue on the chat path — a slow LLM blocks the request; no p95/p99 dashboard wired to the running product.
- **Manual verify:** Send 21 rapid chat messages → observe 429. Watch a slow model reply block the request.
- **Confidence:** Medium.

---

# PRODUCT READINESS REPORT

| # | Feature | Status | Effort to ship |
|---|---|---|---|
| 0 | **Boot on fresh clone (DB migrated + seeded)** | **FAIL** | Small (add migrate+seed to `predev`) |
| 1 | User onboarding | FAIL | Medium |
| 2 | Authentication | PARTIAL | Medium |
| 3 | Chat | PARTIAL | Medium |
| 4 | Memory | PARTIAL | Medium |
| 5 | Profile | PARTIAL | Small |
| 6 | Connections | PARTIAL | Large |
| 7 | Food ordering | FAIL | Large |
| 8 | Shopping | FAIL | Large |
| 9 | Multi-capability | PARTIAL | Large |
| 10 | Admin panel | PARTIAL | Small |
| 11 | LLM configuration | PASS | — |
| 12 | Integration management | PARTIAL | Medium |
| 13 | MCP Servers | PARTIAL | Medium |
| 14 | Search | PARTIAL | Small |
| 15 | Voice | PARTIAL | Medium |
| 16 | Settings | FAIL | Small |
| 17 | Privacy | PARTIAL | Small |
| 18 | Notifications | NOT IMPLEMENTED | Large |
| 19 | Error recovery | PARTIAL | Medium |
| 20 | Performance | PARTIAL | Large |

## Overall Product Readiness

### Without configuration (fresh clone, no keys, unmigrated DB): **0% — does not boot.**

### With DB migrated + seeded, no external keys (best legal config): **~35%**

Real: sign-in, profile CRUD, privacy toggles, tasks, activity (empty), canned chat, admin config of LLM/MCP/search, connections API, integration CRUD. Everything else degrades to canned text, demo fixtures, or outage messages.

### With admin config (LLM key + Serper + one real MCP server): **~55%**

Chat works for real, grounded search works, food tooling executes against the MCP endpoint, but **no real payments, no real OAuth, no shopping, no notifications, no multi-domain execution, no history**.

**The product is not ready for beta.** It is a well-architected demo/framework with working admin infrastructure. The gap between "impressive demo" and "a user can rely on it" is: real OAuth + a real integration endpoint + a real payment path + chat persistence + onboarding + notifications.

---

# MANUAL QA CHECKLIST

Follow top to bottom. Each step records **PASS / FAIL / BLOCKED** (BLOCKED = external dependency missing). Fresh clone first.

### Phase 0 — Environment
- [ ] `npm install` succeeds
- [ ] `npx prisma migrate dev` applies all 10 migrations without error
- [ ] `npm run seed:registry` populates capabilities + integrations
- [ ] `npm run dev` starts without error
- [ ] `prisma/dev.db` now has rows in `User`/`Integration`/`Execution` tables

### Phase 1 — Onboarding & Auth
- [ ] Visit `/` anonymously → app renders (no forced login)
- [ ] Visit `/sign-up` → create account → **note: are you signed in after?** (expected: NO)
- [ ] Sign in with the same credentials → lands on chat
- [ ] Visit `/welcome` directly → enter name → go to Profile → **is the name there?** (expected: NO)
- [ ] Anonymous user on `/` and signed-in user on `/` → check Tasks/Activity/Profile **are they the same data?** (expected: YES — shared anonymous identity)

### Phase 2 — Admin Configuration (unblocks everything)
- [ ] Sign in → visit `/admin` → **are you allowed?** (expected: YES, everyone is admin)
- [ ] Providers tab → add a real LLM credential → discover models → attach + set default → save
- [ ] Admin → **Sign out** → does it 404? (expected: YES)
- [ ] Search tab → save a Serper key → "Test key" succeeds
- [ ] LLM tab → confirm routing shows your default + fallbacks

### Phase 3 — Chat
- [ ] Chat → "hello" → canned reply appears
- [ ] Chat toolbar shows **"Connected"** even though no model used → note as misleading
- [ ] Chat → "who are you" → identity canned reply
- [ ] Chat → "what is the capital of France" → canned "I'm Atlas…" reply (no grounded answer)
- [ ] **Refresh the page** → chat history is GONE
- [ ] Open DevTools Network → type a message → confirm SSE events flow

### Phase 4 — Real Chat (requires Phase 2 LLM config)
- [ ] Chat → "hello" → **now a real LLM reply?** (confirm model was used)
- [ ] Chat → a novel factual question → grounded answer requires Serper key (BLOCKED without it)
- [ ] Configure a bad API key → send → **observe error bubble, no graceful demo fallback**
- [ ] Send 21 messages rapidly → receive 429 rate-limit

### Phase 5 — Memory & Profile
- [ ] Profile → Memories → add memory "User prefers biryani" → refresh → persists
- [ ] Profile → toggle `saveMemory` off → refresh → still off
- [ ] Profile → add an address → appears after refresh
- [ ] Chat (with real model) → "remember I love biryani" → Profile → memory added? (BLOCKED without model)
- [ ] New chat session → "what do I like?" → recalls the memory? (BLOCKED without model)

### Phase 6 — Connections
- [ ] Profile → Connections → see seeded integrations (Swiggy, Amazon, Google…)
- [ ] Connect an `api_key` integration (e.g. Fewsats) → shows Connected
- [ ] Disconnect → shows available again
- [ ] Connect Swiggy → **real OAuth?** (expected: BLOCKED — no client credentials)
- [ ] Settings drawer → Connections card → shows same connections

### Phase 7 — Food Ordering
- [ ] Chat → "I'm hungry" → observe domain routing
- [ ] Follow food flow → expect **"I couldn't reach Swiggy just then"** (BLOCKED — no MCP server)
- [ ] Admin → MCP → add a live SSE MCP server → discover → verify tools appear
- [ ] Re-run food flow with MCP server connected → tools execute against it
- [ ] Reach checkout → approval card appears → confirm → **payment path?** (expected: simulated)

### Phase 8 — Shopping
- [ ] Visit `/shopping` directly (not in nav)
- [ ] Browse → "buy" a product → refresh → **everything resets** (demo only)
- [ ] Confirm no backend calls in DevTools Network for the purchase

### Phase 9 — Tasks, Activity, Settings
- [ ] Tasks tab → after chat messages, executions appear (real DB)
- [ ] Activity tab → shows history after an approved/executed action (empty until then)
- [ ] Settings drawer → Payment methods shows "Alex Morgan"-style **fixture** data (mismatch with real profile)
- [ ] Settings drawer → Privacy toggles → refresh → **revert** (cosmetic)

### Phase 10 — Voice & Search
- [ ] Admin → Voice → Test TTS (works only if Piper installed — BLOCKED otherwise)
- [ ] Chat mic button → record → transcript appears (needs STT model config)
- [ ] Search: with Serper key → "latest news about AI" → grounded reply with citations

### Phase 11 — Notifications & Performance
- [ ] Confirm **no notification appears anywhere** for any action (NOT IMPLEMENTED)
- [ ] `/api/queue/stats` → returns 501 "paused"
- [ ] With a slow model → send a message → observe the request blocking (no queue)

### Phase 12 — Sign-off
- [ ] Reboot the server (fresh `npm run dev`) → DB data persists
- [ ] Record the final verdict per feature from the Readiness Report

**QA Sign-off:**  ____________    **Date:**  ____________

**Gate to beta:** boot-on-clone fix + real LLM default path + chat persistence + one real integration + one real payment path + real notifications.
