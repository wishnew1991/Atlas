# Atlas Project Memory

Updated: 2026-07-30

## Product Direction

Atlas is a mobile-first web application that behaves like a personal AI assistant. The primary experience is a ChatGPT-style text conversation. Voice is secondary and should not replace the text chat interface.

The application is intended for:

- Mobile web usage first
- Desktop web usage as a supported surface
- Natural-language requests for travel, food, rides, shopping, and appointments
- Searching and comparing connected services
- Preparing orders or bookings for explicit user approval
- Tracking tasks, activity, receipts, memory, and permissions

## UX Decisions

- The home page opens directly into a chat interface.
- The top-left arrow opens a slide-out menu.
- Menu items navigate to separate pages.
- The main screen does not expose technical settings or physical control panels.
- The composer behaves like a mobile messaging application.
- Atlas must show an approval card before spending money, booking, ordering, or sending an external request.
- Atlas must never claim that an order or booking is complete before the backend confirms it.

## Current Routes

- `/` Home chat
- `/chat` Conversation page
- `/tasks` Active tasks
- `/activity` Activity, receipts, and updates
- `/shopping` Shopping workflow demo
- `/profile` Memory, accounts, and privacy controls
- `/architecture` System and MCP architecture
- `/sign-in` Clerk sign-in
- `/sign-up` Clerk sign-up
- `/api/chat` Server-side chat endpoint
- `/api/actions/execute` Server-side approval execution endpoint

## Backend Architecture

The browser never receives model or MCP credentials.

1. The mobile chat sends message text and limited conversation history to `/api/chat`.
2. The server authenticates the request through Clerk when Clerk is configured.
3. The server calls the configured model provider.
4. The model can request controlled Atlas tools such as search or approval preparation.
5. Atlas sends tool calls to the configured MCP gateway.
6. Atlas returns an assistant response and, when needed, an approval card.
7. The user explicitly confirms the approval card.
8. The browser sends only the server-issued approval ID to `/api/actions/execute`.
9. The server checks ownership and expiry before calling `execute_approved_action` through the MCP gateway.

## Modular Engine (refactor)

Atlas now uses a modular, ChatGPT/Gemini-style pipeline. The LLM is the brain; MCPs are workers. `src/lib/atlas/server/atlas-agent.ts` is a thin orchestrator that wires these modules (all under `src/lib/atlas/`):

- `llm/` — `LLMClient` + provider adapters (openai/custom, anthropic, google). Supports `stream: true`.
- `conversation/manager.ts` — builds the trimmed context window (last 12, 4000 chars) and memory hooks.
- `conversation/state.ts` — **single source of truth for conversational understanding.** Resolves capabilities + action domain from the whole conversation, not just the last utterance. Confirmations ("yes", "go ahead", "book it", "that one", "2") and slot-fills ("tomorrow works") inherit the in-flight task's capability. Both the planner and the agent's domain routing call `resolveConversationState`, so they can never disagree.
- `intent/analyzer.ts` — advisory intent classification (chat/tool/task/clarify). Not a gate.
- `planner/planner.ts` — `plan(message, history)`; delegates understanding to `conversation/state.ts` and decides whether tools are exposed.
- `mcp/registry.ts` — loads enabled MCP servers from Prisma, caches tool lists (60s TTL). `global` servers are available cross-domain.
- `mcp/router.ts` — picks the best tool by intent scoring, calls the MCP with retries, returns structured results, supports concurrency.
- `tools/registry.ts` — registers LLM-facing tools: `web_search` (global parallel.ai), `atlas_search`, `atlas_prepare_approval`, plus the food ordering suite. All are always exposed to the model.
- `approvals/service.ts` — creates the pending approval (15-min TTL).
- `response/composer.ts` — merges LLM text + tool results, never exposes raw JSON.
- `memory/interface.ts` — `MemoryInterface` + `NoOpMemory` (swappable later).

Request flow: ConversationManager → Plan → LLM (`tool_choice: auto`, tools always available) → on tool call, McpRouter executes → results back to LLM → ResponseComposer. The chat route (`/api/chat`) streams via SSE when the client sends `stream: true`.

### Tool-call handling invariants (do not regress)

1. **The first LLM turn is never streamed.** `streamAtlasReply` calls `chat()` (non-streaming) so tool calls are detected and executed *before* any token reaches the client. Streaming the first turn is what previously leaked raw tool JSON to the UI.
2. **Every path runs both parsers.** `resolveToolCalls()` checks native `tool_calls` first, then falls back to `extractToolCallFromContent()`. Reasoning models emit tool calls as plain-text JSON when the prompt names a tool that is absent from the `tools` array.
3. **`looksLikeToolPayload()` is the last line of defence.** Assistant content that still parses as `{tool|name, arguments|parameters|input}` is never shown to the user, never streamed, and never written into the transcript. The streaming loop buffers any output starting with `{` until it is proven to be prose.
4. **Tool turns are never stored as empty strings.** `summarizeToolTurn()` writes the real MCP result text into the assistant turn, so the next turn can resolve "yes" / "that one" / "book it". An empty assistant turn destroys conversational state and makes the model hallucinate confirmations.

Run `npm run test:pipeline` (35 regression assertions) and `npm run trace:pipeline` (live end-to-end trace) after touching any of the above.

## Conversational food ordering (Phase 4)

Food is a guided, stateful conversation. **The LLM orchestrates; the MCP performs.**
The model calls granular tools and passes the user's own words; Atlas owns every
Swiggy identifier server-side, so the user never types a menu number unless they want to.

Modules (`src/lib/atlas/mcp/`):

- `food-session.ts` — `FoodSession`: address, restaurant, menu, cart, totals, payment method, `step`. In-memory, keyed by userId, 1-hour TTL. **Temporary and independent of the Memory Service / Knowledge Graph.**
- `swiggy-client.ts` — typed access to the Swiggy MCP. Reads `structuredContent` (ratings, ETAs, prices, veg flags, stock, tax breakdown) rather than regex-scraping prose. Prose parsing remains only as a fallback.
- `food-resolve.ts` — natural-language layer: `parseCartIntent` (add / remove / set quantity / replace / clear) and `resolveReference` (by number, ordinal, or fuzzy name).
- `food-service.ts` — the operations the LLM composes, plus all recovery behaviour.
- `food-format.ts` — restaurant cards, categorised menus, cart summaries.
- `food-approval.ts` — the itemised approval card **and** the server-trusted `FoodOrderIntent` persisted with it.
- `food-log.ts` — one structured line per step (`ATLAS_FOOD_LOG=0` to silence).

LLM-facing tools: `food_set_address`, `food_find_restaurants`, `food_select_restaurant`,
`food_browse_menu`, `food_update_cart`, `food_view_cart`, `food_checkout`,
`food_select_payment`, `food_cancel_order`.

Flow: address → restaurant discovery (rating/ETA/price) → menu (categories, veg,
bestsellers, availability, paginated) → natural-language cart edits → checkout →
itemised approval card → user confirms → `place_food_order`.

### Food invariants (do not regress)

1. **`food_checkout` never places the order.** It only builds the approval card. Placement happens in `executeAtlasAction` *after* the user confirms.
2. **Execution uses the stored `FoodOrderIntent`, never browser input.** The intent is persisted inside `Approval.fields` at approval time, so the order placed is exactly the one shown.
3. **The approval card is built from live cart figures**, re-read at checkout — never from menu prices, which exclude packing charges.
4. **`inStock`/`in_stock` absent means available.** Only an explicit `0` is out of stock.
5. **Removals and quantity edits resend the full desired cart** (`update_food_cart` is declarative); clearing uses `flush_food_cart`.

Run `npm run test:food` (21 NLU assertions, offline) and `npm run trace:food`
(live end-to-end; flushes the cart and never places an order).

See `SWIGGY_MCP_CAPABILITIES.md` for the full tool inventory and known gaps.

`web_search` is always in the tool list, so regular chat can search the web. The parallel.ai server is seeded by `npm run seed:search` (needs `PARALLEL_API_KEY`).

## Server Configuration

Copy `.env.example` to `.env.local` and set these values as the application developer:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
OPENAI_API_KEY=
ATLAS_MODEL=gpt-4.1-mini
ATLAS_MCP_GATEWAY_URL=
ATLAS_MCP_GATEWAY_TOKEN=
PARALLEL_API_KEY=
PARALLEL_MCP_URL=https://search.parallel.ai/mcp
```

Never use a `NEXT_PUBLIC_` prefix for model keys, MCP tokens, payment credentials, or other secrets.

The MCP gateway receives this shape:

```json
{
  "tool": "search | prepare_approval | execute_approved_action",
  "arguments": {}
}
```

It should return:

```json
{
  "message": "Human-readable result",
  "data": {}
}
```

## Authentication

Clerk is the selected authentication provider.

- The project uses Next.js 15.5.22 and `@clerk/nextjs` 6.
- `src/middleware.ts` connects Clerk to Next.js requests.
- `AtlasAuthProvider` enables Clerk only when developer keys exist.
- Without Clerk keys, the app stays in isolated demo mode.
- With Clerk configured, live model and MCP requests require a signed-in user.
- Pending approvals are associated with the Clerk user ID.

## Safety Rules

- Never expose API keys in client components or public environment variables.
- Never execute an order, booking, payment, or external handoff without explicit confirmation.
- Never trust an approval object sent back from the browser.
- Use the server-issued approval ID and validate ownership before execution.
- The MCP gateway must authenticate the user and enforce provider permissions and spending limits.
- The payment layer must remain separate from recommendation and search tools.
- Real production deployments need audit logs, idempotency keys, rate limits, and replay protection.

## Current Storage Limitation

Pending approvals currently use an in-memory server map with a 15-minute expiry. This is acceptable for local development and a single process only.

Before production or multi-instance deployment, replace it with a shared database or session store. Persist at least:

- User ID
- Approval ID
- Domain
- Request and provider details
- Final amount and currency
- Approval status
- Expiration time
- Execution reference
- Created and completed timestamps

## Verification Completed

- `npm run build` passes.
- `npm run lint` passes.
- `npx tsc --noEmit` passes.
- The local Next.js 15 server renders the mobile chat page.
- Demo chat requests return safe responses without external credentials.
- Invalid approval IDs are rejected.
- Real order execution was not triggered during testing.

## Next Recommended Work

1. Configure Clerk keys and verify sign-in/sign-out on the mobile layout.
2. Add a shared database for conversations, approvals, activity, and memory.
3. Implement the MCP gateway adapter for the first real provider.
4. Add authenticated user limits and provider-specific authorization.
5. Add idempotent execution and webhook-based order or booking status updates.
6. Add mobile browser QA for keyboard behavior, safe areas, loading states, and offline errors.

## Important Files

- `src/components/atlas/assistant-home.tsx`: Mobile chat experience
- `src/components/atlas/atlas-shell.tsx`: Mobile shell and slide-out navigation
- `src/components/atlas/atlas-auth-provider.tsx`: Optional Clerk provider
- `src/components/atlas/atlas-auth-controls.tsx`: Sign-in and account controls
- `src/lib/atlas/server/atlas-agent.ts`: Model, tool, MCP, approval, and execution logic
- `src/lib/atlas/server/auth.ts`: Clerk actor resolution
- `src/app/api/chat/route.ts`: Authenticated chat endpoint
- `src/app/api/actions/execute/route.ts`: Authenticated approval endpoint
- `src/middleware.ts`: Clerk middleware
- `.env.example`: Developer configuration template
- `README.md`: Setup and developer notes
