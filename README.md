Atlas is a Next.js app that presents a Personal AI Assistant experience.

**Start here: [ATLAS.md](ATLAS.md)** — the single source of truth for Atlas's product vision, philosophy, and the North Star: _the assistant that already knows_.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

For technical details (execution timeline, persistence, MCP caching, observability), see [docs/PERFORMANCE.md](docs/PERFORMANCE.md). For product vision and philosophy, see [ATLAS.md](ATLAS.md).

## Backend Configuration

Atlas keeps all model and MCP credentials on the server. Users only see the chat experience.

1. Copy `.env.example` to `.env.local`.
2. Create a Clerk application and set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
3. Set `OPENAI_API_KEY` and optionally choose `ATLAS_MODEL`.
4. To place real orders or bookings, configure `ATLAS_MCP_GATEWAY_URL` and its token. The gateway is responsible for calling your approved MCP servers and provider APIs.

Without Clerk and model credentials, Atlas remains usable in demo mode. It shows the same chat, search, and approval experience but does not contact a model, MCP server, merchant, or payment provider. With Clerk configured, the menu includes a sign-in control and every live chat and approval is associated with the signed-in account.

Every spend or booking action requires an explicit approval tap. Pending approvals are persisted via the Prisma `Approval` model on SQLite and expire after 15 minutes, so the browser cannot alter their details. The MCP gateway is responsible for authenticating the user and enforcing payment limits.

In-memory state (local development only, single process): the food-session L1 cache, the rate limiter, and the in-process execution job runner (no Redis required).

## Routes

- `/` Home
- `/chat` Conversation
- `/tasks` Task tracking
- `/activity` History and receipts
- `/shopping` Purchase flow
- `/profile` Memory and permissions
- `/architecture` Execution model
