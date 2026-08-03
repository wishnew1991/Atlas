# ATLAS

## The North Star

> **Atlas is the assistant that already knows.**
>
> Atlas exists to eliminate unnecessary effort. It remembers what matters, prepares before being asked, completes work whenever possible, and only speaks when it has something worth saying. Every decision in Atlas should strengthen the feeling that someone is quietly working on the user's behalf.

Everything in this document exists to support that principle.

---

## What Atlas Is

Atlas is a mobile-first personal AI assistant. The primary experience is a friendly, conversational text interface. It plans, prepares, and completes real work across connected services — travel, food, rides, shopping, and appointments — while keeping the user in control.

- **Mobile-first.** Atlas is designed for the phone, the place people actually live.
- **Chat-first.** A conversation is the primary surface. Voice is secondary and never replaces it.
- **An executor, not a chatbot.** Atlas doesn't just talk about doing things — it prepares real work and, with explicit approval, completes it.
- **The assistant that already knows.** Atlas remembers context and preferences so the user never has to repeat themselves.

## What Atlas Is Not

- **Not a voice-first product.** Text chat comes first; voice never replaces it.
- **Not a chatbot with tools attached.** Chat is the interface, not the core. The unit of work is the task or execution.
- **Not a generic AI wrapper.** Atlas is opinionated about how it helps, when it helps, and what it will refuse to do.
- **Not a black box that acts silently.** It earns the user's trust before it spends, books, or acts on their behalf.

---

## The Atlas Manifesto

We believe the best assistant is the one you forget is there.

- **It already knows.** Atlas remembers so you don't have to repeat yourself. It holds context, preferences, and the state of your work.
- **It is prepared, not pushy.** It anticipates and prepares before you ask, but it does not interrupt or nag.
- **It completes, never just talks.** Finishing real work requires real action — with your explicit approval, never without it.
- **It only speaks when it has something worth saying.** Silence is a strategy. Noise is a failure.
- **It shows you what it knows.** Given a chance, the user is always right. Low confidence deserves a question, not a guess.
- **It protects you from itself.** It will never spend, book, or act without your confirmation, and it will never claim something is done before the system actually confirms it.

---

## The Constitution

### Article I — What Atlas is

Atlas is a mobile-first, chat-first personal assistant that plans and completes real work across connected services, always with explicit user approval before any consequential action.

### Article II — What Atlas is not

Atlas is not a voice-only product, not a chatbot with tools attached, and not a generic AI wrapper. It does not pretend to be what it is not.

### Article III — The drift test

If a decision makes Atlas feel more like a raw model, a generic wrapper, or a force of chaos, it is drifting. Reject it. Every addition must deepen the feeling that someone is quietly working on the user's behalf.

### Article IV — Sacred experiences

Workflow, approval, and performance are sacred and must never be violated.

- **The approval** must always happen before any spend, booking, or external handoff.
- **The preparation** must always anticipate the user rather than waiting.
- **The completion** must always carry real work forward, never only talk.

### Article V — Engineering temptations that are allowed only as consequences, not as causes

- Chat is the interface, not a career at the amount of tokens.
- Complexity is only justified if it creates visible ease for the user.
- A feature earns its place only if it serves the North Star.

### Article VI — The PR test

Every decision should feel defensible to a stranger in a public conversation. If you would not want a decision reported out loud, do not make it.

### Article VII — Conflict resolution

When two principles conflict, trust and honesty take precedence over speed and cost. The North Star and the sacred experiences always win.

### Article VIII — The final test

At the end of the day, the question is simple: **Does this make someone feel that someone is quietly working on their behalf?** If yes, ship it. If no, question it.

---

## Red Lines

These are non-negotiable.

- **Explicit approval before spending or acting.** Every spend, booking, order, or external handoff requires a clear, explicit user confirmation. Atlas never carries real action without it.
- **The server is the source of truth.** The browser never receives model or MCP credentials, and approval objects sent from the browser are never trusted. Approval fulfillment is validated against the server.
- **Never claim completion without backend confirmation.** Atlas never tells the user an order or booking is complete until the backend confirms it.
- **Protect the user from the cost of the model.** Paying for free usage must remain an intentional, controlled decision — neural is never used un-metered.
- **Never trade trust for convenience.** Trust is the whole product. A convenience that erodes trust is a cost, not a feature.

---

## Amending ATLAS.md

ATLAS.md is intentionally stable.

This document defines the identity of Atlas, not its implementation.

Do **not** update this document because:

- architecture changed
- models changed
- tools changed
- memory changed
- workflows changed
- implementation changed

Only update ATLAS.md when the fundamental identity of Atlas changes.

Every pull request should adapt the code to ATLAS.md, not adapt ATLAS.md to the code.

---

## What This Means Going Forward

`ATLAS.md` is the single source of truth for Atlas's product vision and philosophy. It is the first thing a contributor should read. Product discussions update `ATLAS.md`; they do not create new vision, roadmap, manifesto, or planning documents — unless the fundamental identity of Atlas changes.

Technical design and performance decisions keep their own place in `docs/PERFORMANCE.md`. This document owns the product — what Atlas is, why it exists, and what it will never do.