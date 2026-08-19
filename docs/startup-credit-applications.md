# Atlas — Startup Credit Program Applications

Reference drafts grounded in the implemented codebase (not the pitch deck).
All three programs are 100% no-equity.

---

## 1. Modal for Startups (up to $50K of B200/H100 serverless GPU)

**URL:** https://modal.com/startups

**Company:** Atlas — "The assistant that already knows"
**Role:** Founder
**Stage:** Pre-revenue, working MVP deployed, founded within the last year
**Product one-liner:** A chat-first personal AI assistant that plans and completes real work (food orders, rides, shopping, travel) across connected services — with explicit approval before any spend, durable execution plans, and memory that personalizes only when asked.

**Current build (what's shipped):**
- Next.js/TypeScript app with streaming multi-model LLM tool loops (Gemini, GPT, Claude), admin-managed model registry.
- Durable execution engine: plan → tools → approve → execute, with a queue (BullMQ + in-process fallback).
- Live food-ordering state machine over the MCP protocol (address → menu → cart → checkout → approval) with typed payload parsing and per-stage observability.
- Approvals with server-trusted intents, 15-min TTL — nothing spends or books without confirmation.
- Policy-based integration selector (user-override → health → preference → cost scoring) over 9 connectors (Swiggy, Zomato, Uber, Zepto, Dhan, Upstox, Tapetide, Google, Fewsats) with OAuth.
- Memory + routines learning engine; proactive daily briefs; voice (STT + self-hosted Kokoro TTS on Cloud Run).
- Behavioral regression suite: 100+ tests, golden traces, reports.

**Why we need Modal GPU compute:**
- Self-hosted Kokoro TTS for natural voice replies — currently CPU-bound (~4s per reply). Modal's serverless B200/H100 would cut this to under 300ms for real-time conversation.
- Bursty conversational LLM inference for multi-step agent loops — serverless, pay-per-use fits our usage shape.
- Occasional fine-tuning / eval runs against our golden-trace validation suite.

**In return:** case study, public attribution, technical feedback on serverless GPU UX for latency-sensitive generation.

---

## 2. AWS Activate — Founders (up to $5,000)

**URL:** https://aws.amazon.com/startups/credits/

**Company profile:**
- Company: Atlas
- Stage: bootstrapped, pre-revenue, pre-Series B (self-funded)
- Founded: within the current year; solo-founding team
- Build: production Next.js app (streaming Gemini/Claude/GPT tool loops, durable execution engine, live food-ordering flow over MCP connectors, approvals with server-trusted intents, policy-based integration routing, voice with self-hosted TTS, 100+ test behavioral regression suite). Currently deployed on Cloud Run + PostgreSQL.

**Elevator pitch:**
Chatbots answer. Atlas does. It turns "order biryani" or "book my Monday Uber" into a durable plan it prepares, shows you, gets your explicit approval for, then completes — across Swiggy, Zomato, Uber, and more, via MCP connectors. Trust by design: explicit approvals before any spend, safety memory, and honest completion (never claims done until the backend confirms).

**How we'd use the credits:**
- GPU-backed TTS (Kokoro) for latency-free voice replies.
- Frontier LLM inference for agent tool loops (planning, intent classification, tool selection).
- Embeddings for the memory layer.
- AWS services planned: EC2 GPU for elastic TTS, Bedrock for model fallback diversity, Lambda for agent dispatch.

---

## 3. Microsoft for Startups / Founders Hub (instant starter → up to $150K)

**URL:** https://foundershub.startups.microsoft.com/

**About your startup:**
Atlas is an AI execution engine. Send a message like "order biryani" or "get me an Uber Monday morning" and Atlas produces a plan, shows it to you, gets your explicit approval, and then completes the real work across connected services. Unlike chatbots with tools bolted on, Atlas treats work as durable executions — approvals, safety memory, and honest completion. It remembers without repeating on you and only personalizes when you ask it to suggest.

**Built so far:**
- Next.js/TypeScript app, PostgreSQL + Prisma, better-auth.
- Multi-model LLM routing (Gemini, GPT, Claude) with an admin-managed registry.
- Live food-ordering flow over MCP connectors (Swiggy/Zomato) with a full state machine and approvals.
- Policy-based integration routing across 9 connectors with OAuth.
- Proactive daily briefs, routines learning, memory, voice (STT + self-hosted Kokoro TTS).
- 100+ test behavioral regression suite with golden traces.

**Technology stack:** Next.js, TypeScript, PostgreSQL, Prisma, BullMQ, MCP protocol, serverless (Cloud Run/Pages).

**Cloud services planned:** Azure OpenAI for model diversity and cost hedging; GPU VMs for Kokoro TTS latency; Cosmos/Postgres for state; Blob for audio assets.

**Funding stage:** Self-funded. **Founded:** within the last year.

---

## 4. Development sponsorship ask (for VCs / partners)

Atlas is also open to partners who want to **sponsor and fund active development** and/or join as a technical team member — not just grant generic cloud credits. The sponsor gets:
- Direct contributor role on the roadmap (feature prioritization input).
- Public attribution + case study rights.
- Early technical access/API preview of the execution-agent platform.

**What we'd put a development fund toward:**
- Frontier LLM + GPU (TTS) inference budget for the agent execution loops.
- Expanding real connectors (more domains: travel, rides, payments) beyond the food flow.
- SRE/hosting for the Cloud Run + PostgreSQL runtime.

---

## Requires your input before submitting

- Company legal name + founding date (all three programs verify this)
- Business email on a company domain (Modal + AWS ask for it; MS accepts a personal email)
- Company website/domain (required by AWS Activate; modal.com asks optionally; MS Founders Hub accepts without)
- GitHub org/repo visibility: `wishnew1991/Atlas` can be referenced as live code evidence