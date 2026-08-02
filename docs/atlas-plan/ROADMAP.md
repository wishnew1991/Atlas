# Atlas Implementation Roadmap

## Overview

This roadmap outlines the implementation of the Atlas Execution Engine architecture, ordered by architectural importance rather than UI features. Each phase builds upon the previous one, ensuring a solid foundation before adding advanced capabilities.

## Phase 0: Foundation (Weeks 1-2)

### Goal: Production-ready infrastructure

### Tasks

#### 1. Database Migration (Week 1)
**Status:** 🔴 Not Started
**Priority:** P0
**Risk:** High
**Dependencies:** None

**Subtasks:**
- [ ] Set up PostgreSQL database
- [ ] Install and configure pgvector extension
- [ ] Implement connection pooling (PgBouncer)
- [ ] Create database migration scripts from SQLite
- [ ] Migrate existing data to PostgreSQL
- [ ] Update Prisma schema for PostgreSQL
- [ ] Test data integrity after migration
- [ ] Update environment configuration

**Acceptance Criteria:**
- PostgreSQL database is running with pgvector
- All existing data is migrated successfully
- Application connects to PostgreSQL via connection pool
- All existing tests pass with new database

#### 2. Background Job System (Week 1-2)
**Status:** 🔴 Not Started
**Priority:** P0
**Risk:** Medium
**Dependencies:** Database Migration

**Subtasks:**
- [ ] Install and configure BullMQ
- [ ] Create Redis connection (or use in-memory for development)
- [ ] Design job queue architecture
- [ ] Implement job queue creation
- [ ] Create worker pool configuration
- [ ] Implement retry logic with exponential backoff
- [ ] Add dead letter queue
- [ ] Create job monitoring endpoints
- [ ] Add job scheduling capabilities

**Acceptance Criteria:**
- BullMQ is integrated and functional
- Jobs can be queued, processed, and retried
- Failed jobs move to dead letter queue
- Job status can be monitored via API

#### 3. Security Foundation (Week 2)
**Status:** 🔴 Not Started
**Priority:** P0
**Risk:** High
**Dependencies:** None

**Subtasks:**
- [ ] Implement rate limiting middleware
- [ ] Create PII detection system
- [ ] Add input validation framework
- [ ] Implement audit logging
- [ ] Add request authentication enhancement
- [ ] Create security headers middleware
- [ ] Implement CSRF protection
- [ ] Add CORS configuration

**Acceptance Criteria:**
- Rate limiting prevents abuse
- PII is detected and redacted in logs
- All inputs are validated before processing
- All sensitive actions are logged

---

## Phase 1: Execution Engine Core (Weeks 3-6)

### Goal: Replace chat loop with execution engine

### Tasks

#### 1. Execution Model Implementation (Week 3-4)
**Status:** 🔴 Not Started
**Priority:** P0
**Risk:** High
**Dependencies:** Phase 0 completion

**Subtasks:**
- [ ] Define Execution TypeScript interfaces
- [ ] Create Execution database models
- [ ] Implement Execution state machine
- [ ] Build Execution lifecycle management
- [ ] Create Execution persistence layer
- [ ] Implement Execution creation API
- [ ] Add Execution status updates
- [ ] Create Execution retrieval endpoints
- [ ] Implement Execution history tracking

**Acceptance Criteria:**
- Execution can be created and persisted
- Execution state transitions work correctly
- Execution lifecycle is properly managed
- Existing chat API creates Executions

#### 2. Planner Enhancement (Week 5-6)
**Status:** 🔴 Not Started
**Priority:** P0
**Risk:** High
**Dependencies:** Execution Model

**Subtasks:**
- [ ] Enhance intent understanding pipeline
- [ ] Implement goal formation logic
- [ ] Build plan generation system
- [ ] Add plan verification
- [ ] Implement resource estimation
- [ ] Create reflection pipeline
- [ ] Add learning from execution outcomes
- [ ] Implement plan optimization
- [ ] Update existing planner to use new architecture

**Acceptance Criteria:**
- Planner creates proper Execution plans
- Plans are verified before execution
- Planner learns from execution results
- Existing chat functionality works with new planner

---

## Phase 2: Memory System (Weeks 7-10)

### Goal: Layered memory with semantic capabilities

### Tasks

#### 1. Memory Architecture (Week 7-8)
**Status:** 🔴 Not Started
**Priority:** P0
**Risk:** High
**Dependencies:** Phase 1 completion

**Subtasks:**
- [ ] Define memory layer interfaces
- [ ] Implement working memory system
- [ ] Build conversation memory
- [ ] Create long-term memory structure
- [ ] Integrate pgvector for semantic search
- [ ] Implement memory storage layer
- [ ] Add memory retrieval API
- [ ] Create memory cleanup jobs
- [ ] Implement memory TTL management

**Acceptance Criteria:**
- All memory layers are functional
- Semantic search works with pgvector
- Memory has proper TTL and cleanup
- Memory can be injected into executions

#### 2. Memory Operations (Week 9-10)
**Status:** 🔴 Not Started
**Priority:** P0
**Risk:** Medium
**Dependencies:** Memory Architecture

**Subtasks:**
- [ ] Implement semantic search
- [ ] Build preference learning system
- [ ] Create pattern recognition
- [ ] Add conflict detection/resolution
- [ ] Implement temporal decay
- [ ] Add importance scoring
- [ ] Create PII redaction in memory
- [ ] Implement retention policies
- [ ] Add memory export/deletion

**Acceptance Criteria:**
- Semantic search returns relevant results
- Preferences are learned from executions
- Patterns are detected and stored
- Conflicts are detected and resolved

---

## Phase 3: Capability Graph (Weeks 11-13)

### Goal: Dynamic capability discovery and composition

### Tasks

#### 1. Graph Structure (Week 11-12)
**Status:** 🔴 Not Started
**Priority:** P1
**Risk:** Medium
**Dependencies:** Phase 2 completion

**Subtasks:**
- [ ] Define capability graph interfaces
- [ ] Implement capability node structure
- [ ] Build capability edge system
- [ ] Create graph indexing
- [ ] Implement graph traversal algorithms
- [ ] Add graph persistence
- [ ] Create graph visualization API
- [ ] Implement graph update mechanisms

**Acceptance Criteria:**
- Capability graph can be created and persisted
- Graph traversal works correctly
- Graph can be visualized
- Existing MCPs are integrated into graph

#### 2. Capability Operations (Week 13)
**Status:** 🔴 Not Started
**Priority:** P1
**Risk:** Medium
**Dependencies:** Graph Structure

**Subtasks:**
- [ ] Implement health monitoring
- [ ] Add cost optimization
- [ ] Create composition validation
- [ ] Build alternative discovery
- [ ] Implement capability ranking
- [ ] Add dependency resolution
- [ ] Create capability health API
- [ ] Implement automatic failover

**Acceptance Criteria:**
- Capability health is monitored
- Plans are optimized for cost
- Capability composition is validated
- Alternatives are discovered when capabilities fail

---

## Phase 4: Skills Orchestration (Weeks 14-16)

### Goal: High-level skill composition

### Tasks

#### 1. Skill System (Week 14-15)
**Status:** 🔴 Not Started
**Priority:** P1
**Risk:** Medium
**Dependencies:** Phase 3 completion

**Subtasks:**
- [ ] Define skill interfaces
- [ ] Implement skill structure
- [ ] Build orchestration logic
- [ ] Create skill templates
- [ ] Add fallback strategies
- [ ] Implement skill composition
- [ ] Create skill persistence
- [ ] Add skill execution engine

**Acceptance Criteria:**
- Skills can be defined and executed
- Orchestration logic works correctly
- Fallback strategies activate when needed
- Skills can be composed together

#### 2. Skill Library (Week 16)
**Status:** 🔴 Not Started
**Priority:** P1
**Risk:** Low
**Dependencies:** Skill System

**Subtasks:**
- [ ] Implement Travel Planning skill
- [ ] Create Expense Management skill
- [ ] Build Meeting Coordination skill
- [ ] Add Shopping skill
- [ ] Create Research skill
- [ ] Implement Personal Productivity skill
- [ ] Add skill testing framework
- [ ] Create skill documentation

**Acceptance Criteria:**
- All basic skills are implemented
- Skills can handle real-world scenarios
- Skills have proper error handling
- Skills are documented

---

## Phase 5: Wake-up Engine (Weeks 17-19)

### Goal: Proactive assistance with minimal LLM usage

### Tasks

#### 1. Trigger System (Week 17-18)
**Status:** 🔴 Not Started
**Priority:** P1
**Risk:** Medium
**Dependencies:** Phase 4 completion

**Subtasks:**
- [ ] Define trigger interfaces
- [ ] Implement time-based triggers
- [ ] Build event-driven triggers
- [ ] Create condition-based triggers
- [ ] Add memory-based triggers
- [ ] Implement rule engine
- [ ] Create API check system
- [ ] Add webhook support

**Acceptance Criteria:**
- All trigger types are functional
- Rule engine evaluates triggers correctly
- API checks work without LLM
- Webhooks can trigger executions

#### 2. Wake-up Optimization (Week 19)
**Status:** 🔴 Not Started
**Priority:** P1
**Risk:** Medium
**Dependencies:** Trigger System

**Subtasks:**
- [ ] Implement LLM-free evaluation
- [ ] Add capability status checks
- [ ] Optimize trigger evaluation
- [ ] Add performance monitoring
- [ ] Implement trigger cost tracking
- [ ] Create trigger management UI
- [ ] Add trigger testing tools
- [ ] Optimize for <5% LLM invocation

**Acceptance Criteria:**
- <5% of wake-ups invoke LLM
- Trigger evaluation is fast
- Wake-up costs are tracked
- Triggers can be managed via UI

---

## Phase 6: Background Execution (Weeks 20-22)

### Goal: Offline execution capabilities

### Tasks

#### 1. Job System (Week 20-21)
**Status:** 🔴 Not Started
**Priority:** P1
**Risk:** Medium
**Dependencies:** Phase 5 completion

**Subtasks:**
- [ ] Implement job scheduling
- [ ] Build checkpoint system
- [ ] Add resumable execution
- [ ] Create notification system
- [ ] Implement job priorities
- [ ] Add job dependencies
- [ ] Create job monitoring
- [ ] Implement job cancellation

**Acceptance Criteria:**
- Jobs can be scheduled and executed
- Checkpoints allow resumable execution
- Notifications are sent for job completion
- Jobs can be cancelled and monitored

#### 2. Job Orchestration (Week 22)
**Status:** 🔴 Not Started
**Priority:** P1
**Risk:** Low
**Dependencies:** Job System

**Subtasks:**
- [ ] Implement polling jobs
- [ ] Create scheduled jobs
- [ ] Build event handlers
- [ ] Add long-running jobs
- [ ] Implement job chains
- [ ] Create job templates
- [ ] Add job performance monitoring
- [ ] Implement job cost tracking

**Acceptance Criteria:**
- All job types are functional
- Jobs can be chained together
- Job performance is monitored
- Job costs are tracked

---

## Phase 7: Approval Queue (Weeks 23-24)

### Goal: Cross-device approval management

### Tasks

#### 1. Approval System (Week 23)
**Status:** 🔴 Not Started
**Priority:** P1
**Risk:** Medium
**Dependencies:** Phase 6 completion

**Subtasks:**
- [ ] Implement approval queue
- [ ] Build approval lifecycle
- [ ] Add modification support
- [ ] Create expiry system
- [ ] Implement approval persistence
- [ ] Add approval notification
- [ ] Create approval history
- [ ] Implement approval search

**Acceptance Criteria:**
- Approvals can be created and managed
- Approval lifecycle works correctly
- Approvals expire properly
- Approval history is maintained

#### 2. Cross-Device Sync (Week 24)
**Status:** 🔴 Not Started
**Priority:** P1
**Risk:** Medium
**Dependencies:** Approval System

**Subtasks:**
- [ ] Implement device sync
- [ ] Add multi-device support
- [ ] Build recovery system
- [ ] Create notification system
- [ ] Implement conflict resolution
- [ ] Add device management
- [ ] Create sync status monitoring
- [ ] Implement offline approval caching

**Acceptance Criteria:**
- Approvals sync across devices
- Multi-device approval works
- System recovers from sync failures
- Offline approvals are cached

---

## Phase 8: Production Hardening (Weeks 25-28)

### Goal: Production-ready reliability

### Tasks

#### 1. Observability (Week 25-26)
**Status:** 🔴 Not Started
**Priority:** P0
**Risk:** Low
**Dependencies:** Phase 7 completion

**Subtasks:**
- [ ] Enhance structured logging
- [ ] Add execution metrics
- [ ] Implement memory system analytics
- [ ] Create capability health monitoring
- [ ] Add performance monitoring
- [ ] Implement error tracking
- [ ] Create alerting system
- [ ] Add dashboard for metrics

**Acceptance Criteria:**
- All system components are observable
- Metrics are collected and displayed
- Alerts fire for critical issues
- Performance can be monitored

#### 2. Reliability (Week 27-28)
**Status:** 🔴 Not Started
**Priority:** P0
**Risk:** Medium
**Dependencies:** Observability

**Subtasks:**
- [ ] Implement circuit breakers
- [ ] Add graceful degradation
- [ ] Create cost monitoring
- [ ] Implement performance optimization
- [ ] Add load testing
- [ ] Create disaster recovery procedures
- [ ] Implement backup system
- [ ] Add failover mechanisms

**Acceptance Criteria:**
- System degrades gracefully under load
- Circuit breakers prevent cascading failures
- Costs are monitored and controlled
- System can recover from failures

---

## Phase 9: UI Integration (Weeks 29-32)

### Goal: Execution-focused UI

### Tasks

#### 1. Execution UI (Week 29-30)
**Status:** 🔴 Not Started
**Priority:** P2
**Risk:** Low
**Dependencies:** Phase 8 completion

**Subtasks:**
- [ ] Create execution timeline component
- [ ] Build plan visualization
- [ ] Add progress tracking
- [ ] Implement result display
- [ ] Create execution history UI
- [ ] Add execution search
- [ ] Implement execution filtering
- [ ] Create execution export

**Acceptance Criteria:**
- Execution timeline is visible
- Plans can be visualized
- Progress is tracked in real-time
- Results are displayed clearly

#### 2. Memory UI (Week 31-32)
**Status:** 🔴 Not Started
**Priority:** P2
**Risk:** Low
**Dependencies:** Execution UI

**Subtasks:**
- [ ] Create memory visualization
- [ ] Build preference management
- [ ] Add pattern display
- [ ] Implement conflict resolution UI
- [ ] Create memory search
- [ ] Add memory editing
- [ ] Implement memory deletion
- [ ] Create memory export

**Acceptance Criteria:**
- Memory can be visualized
- Preferences can be managed
- Patterns are displayed
- Conflicts can be resolved

---

## Phase 10: Monetization (Post-Launch, Traction-Dependent)

### Goal: Free-first growth, then subscription based on traction

**Strategic direction (agreed):** Keep Atlas free initially. Gather real user traction and
usage signals, then introduce a subscription model only once usage justifies it — driven by
usage metrics, not by calendar date. Never pay model costs out of pocket for heavy free users.

### Tasks

#### 1. Usage Metering / Token Accounting (Foundation for everything below)
**Status:** 🔴 Not Started
**Priority:** P0 (build even while the app stays free)
**Risk:** Low
**Dependencies:** Existing `TurnTrace` token accounting

**Subtasks:**
- [ ] Surface per-user token usage from existing `TurnTrace` (tokensIn/tokensOut)
- [ ] Add account-level usage ledger (daily, weekly, monthly)
- [ ] Implement free-tier credit/token budget per account
- [ ] Add usage cap enforcement so heavy free users cannot overrun model cost
- [ ] Expose usage data via an admin/metrics endpoint

**Acceptance Criteria:**
- Every account has a tracked usage ledger
- Free usage is metered so per-account model cost is always known and capped
- The subscription tier can be toggled on later without a rebuild (metering already in place)

#### 2. Subscription / Paid Plan Gate (Future)
**Status:** 🔴 Not Started (only once traction justifies)
**Priority:** P2
**Dependencies:** Usage Metering

**Subtasks:**
- [ ] Define Pro tier: model cost bundled into monthly fee
- [ ] Integration with a payment provider (Stripe)
- [ ] Free tier = small token/credit budget; Pro = unlimited/advanced plan
- [ ] "Bring your own key" option so users can supply their own model credentials
- [ ] Enterprise/team offering (sell the AI + MCP gateway layer per-seat)

**Acceptance Criteria:**
- Free tier is genuinely valuable but cost-capped
- Pro subscription covers per-request LLM cost
- Activation is a config toggle driven by a traction metric, not a fixed date

#### 3. Transaction / Commission Revenue (Future)
**Status:** 🔴 Not Started (requires real merchant gateway + payments)
**Priority:** P1
**Dependencies:** real MCP gateway + merchant approval integration

**Subtasks:**
- [ ] Drive real orders/books through MCP gateway (food, rides, travel, shopping)
- [ ] Collect partnership/affiliate commission on completed orders
- [ ] Charge per-transaction convenience/service fee
- [ ] Track completed-order volume as the key monetization signal

**Acceptance Criteria:**
- Revenue is earned on real completed transactions
- Affiliate/fee revenue is tracked separately from subscription revenue
- Order-completion volume is used as a primary traction metric

### Monetization Guardrails
- **Free traction must not run un-metered LLM spend** — cap free-tier tokens/credits from day one.
- **Don't cripple the free tier** — keep it valuable so users build an intent to pay.
- **Use traction metrics (repeat usage, completed orders, weekly active) to decide when to charge** — not a calendar date.

---

## Summary

### Total Duration: 32 weeks

### Priority Breakdown:
- **P0 (Critical):** Phases 0, 1, 2, 8 (12 weeks)
- **P1 (High):** Phases 3, 4, 5, 6, 7 (14 weeks)  
- **P2 (Medium):** Phase 9 (6 weeks)
- **Post-Launch:** Phase 10 (Monetization) — traction-dependent

### Risk Assessment:
- **High Risk:** Database Migration, Execution Model, Planner Enhancement, Security Foundation
- **Medium Risk:** Most other phases
- **Low Risk:** UI Integration, Skill Library, Job Orchestration

### Dependencies:
- Each phase depends on completion of previous phases
- Phase 8 (Production Hardening) depends on all previous phases
- Phase 9 (UI Integration) can be partially done in parallel with Phase 8

### Success Criteria:
- All P0 phases completed successfully
- System can handle production load
- Execution engine replaces chat loop
- Memory system is functional
- Background execution works reliably
- System is observable and reliable
