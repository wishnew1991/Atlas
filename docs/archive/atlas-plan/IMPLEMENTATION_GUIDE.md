# Atlas Execution Engine - Implementation Guide

## Current Status

Phase 0 (Foundation) is **25% complete**. Database infrastructure is set up with PostgreSQL and pgvector. The next immediate steps are to complete the database migration and begin background job system implementation.

## Immediate Next Steps

### 1. Complete Database Migration

The user needs to update their local `.env` file with the database connection string:

```env
DATABASE_URL="postgresql://atlas_user:atlas_password@localhost:5432/atlas_dev?schema=public"
```

Then run:

```bash
npx prisma db push
node scripts/migrate-to-postgres.mjs
```

### 2. Background Job System

Once database migration is complete, implement the background job system using BullMQ.

### 3. Security Foundation

Implement rate limiting, PII detection, and other security measures.

## Architecture Overview

The Atlas Execution Engine is designed around the following core principles:

1. **Execution-First Design** - Every user request becomes an execution with full lifecycle management
2. **Layered Memory** - Working, conversation, long-term, and knowledge layers
3. **Intelligent Planning** - Intent understanding, planning, execution, observation, reflection
4. **Capability Graph** - Dynamic capability discovery and composition
5. **Skills Orchestration** - High-level skill composition over raw tools
6. **Wake-up Engine** - Proactive assistance with minimal LLM usage
7. **Background Execution** - Offline, resumable, reliable execution
8. **Persistent Approvals** - Cross-device approval management

## Key Technical Decisions

### Database
- **PostgreSQL 16** with pgvector for semantic search
- **Connection pooling** with PgBouncer for production
- **Vector embeddings** stored as pgvector fields for semantic memory

### Background Jobs
- **BullMQ** for reliable job processing
- **Redis** for job queue management (can use in-memory for development)
- **Retry logic** with exponential backoff
- **Dead letter queue** for failed jobs

### Security
- **Rate limiting** per user and IP
- **PII detection** and redaction
- **Input validation** framework
- **Audit logging** for sensitive actions

## Development Workflow

1. **Complete Phase 0** - Foundation (database, jobs, security)
2. **Phase 1** - Execution Engine Core
3. **Phase 2** - Memory System
4. **Phase 3** - Capability Graph
5. **Phase 4** - Skills Orchestration
6. **Phase 5** - Wake-up Engine
7. **Phase 6** - Background Execution
8. **Phase 7** - Approval Queue
9. **Phase 8** - Production Hardening
10. **Phase 9** - UI Integration

## Testing Strategy

Each phase should include:
- Unit tests for core components
- Integration tests for data flow
- End-to-end tests for user workflows
- Performance tests for critical paths
- Security tests for vulnerabilities

## Documentation

All architectural decisions, API contracts, and implementation details should be documented in the `docs/atlas-plan/` directory.

## Progress Tracking

Progress is tracked in:
- `PROGRESS.md` - Overall implementation status
- `ROADMAP.md` - Detailed roadmap with tasks
- `ARCHITECTURE.md` - Complete architecture documentation
- `SETUP.md` - Setup and configuration instructions

## Success Criteria

Each phase is considered complete when:
- All acceptance criteria are met
- All tests pass
- Documentation is updated
- No regressions in existing functionality
- System is production-ready for that phase
