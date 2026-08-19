# Universal Connector Gateway — UI Collaboration Plan

This document outlines the division of work between the Backend Core (currently being implemented by Atlas) and the UI (to be implemented via OpenCode).

## Your Mission (OpenCode / UI)
Your goal is to build the Consumer and Admin UI for the Universal Connector Gateway Phase 1. 
The backend database schema is already migrated (Prisma models `ConnectorSession`, `ConnectorJob`, `ConnectorAudit` exist). You do not need to write backend logic; focus exclusively on the React/Next.js frontend.

### 1. Consumer App UI (`Profile → Connections`)
- **Location:** Update the existing Profile page to include a `Connections` section (or sub-tab).
- **Features:**
  - List available connectors (e.g., Swiggy, MakeMyTrip).
  - Show connection states: `Connected`, `Disconnected`, `Session Expired`.
  - **Login / Handoff Flow:** Create a reusable UI component that can display a QR Code and Link for browser-based login handoffs (e.g., scan to login).
  - **Error Handling:** Gracefully display errors (e.g., "Connection Failed", "Scope Rejected") using existing Atlas badge/alert patterns.
  - **Pending Approvals:** Ensure high-risk actions (like payments) appear in the `Tasks → Needs You` section.

### 2. Admin App UI (`Integrations → Connectors`)
- **Location:** Rename the current "Integrations" admin area to "Connectors".
- **Features:**
  - **Connector List:** Show all active connectors, their supported transports (API, MCP, Browser), and health status.
  - **Connector Details:** Display capabilities, required scopes, and configuration.
  - **Audit Logs:** Build an "Audit" tab for connectors that reuses the existing LLM log UI patterns. This will eventually show exactly what the connector did.
  - **Recipes Placeholder:** Scaffold a "Recipes" tab (for later browser automation) showing recipe versions and health.

## Atlas's Mission (Backend Gateway Core)
While you build the UI, I am building:
1. **Gateway Types & Interfaces** (`gateway/types.ts`) - *Done*
2. **Permission Scopes** (`gateway/scopes.ts`)
3. **Transport Resolver** (`gateway/resolver.ts`)
4. **API & MCP Adapters** (`gateway/adapters/api.ts`, `gateway/adapters/mcp.ts`)
5. **Encryption** (Secure storage of tokens in `credential-store.ts`)

### How to Collaborate
You can feed this `UI_COLLAB.md` file directly into OpenCode to set its context. 
If OpenCode needs mock data for the UI, use the standard `Integration` and `UserConnection` Prisma types. We will wire your UI components to my backend routes once both are ready!
