Atlas is a Next.js app that presents a Personal AI Assistant experience.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Backend Configuration

Atlas keeps all model and MCP credentials on the server. Users only see the chat experience.

1. Copy `.env.example` to `.env.local`.
2. Create a Clerk application and set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
3. Set `OPENAI_API_KEY` and optionally choose `ATLAS_MODEL`.
4. To place real orders or bookings, configure `ATLAS_MCP_GATEWAY_URL` and its token. The gateway is responsible for calling your approved MCP servers and provider APIs.

Without Clerk and model credentials, Atlas remains usable in demo mode. It shows the same chat, search, and approval experience but does not contact a model, MCP server, merchant, or payment provider. With Clerk configured, the menu includes a sign-in control and every live chat and approval is associated with the signed-in account.

Every spend or booking action requires an explicit approval tap. Atlas keeps pending approvals on the server for 15 minutes so the browser cannot alter their details. For production, replace this in-memory store with a shared database or session store, and make the MCP gateway authenticate the user and enforce payment limits.

## Routes

- `/` Home
- `/chat` Conversation
- `/tasks` Task tracking
- `/activity` History and receipts
- `/shopping` Purchase flow
- `/profile` Memory and permissions
- `/architecture` Execution model
