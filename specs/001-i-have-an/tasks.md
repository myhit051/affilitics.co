# Tasks: Production Readiness Enhancement

**Input**: Design documents from `/specs/001-i-have-an/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Web app**: `apps/web/src/`, `apps/worker/`, `packages/db/`
- **Tests**: `apps/web/__tests__/`, `packages/db/__tests__/`

## Phase 3.1: Critical Blockers Resolution (Week 1 - Days 1-2)
**URGENT: Must complete before any new features**

- [x] T001 Upgrade Node.js version to v20+ in package.json engines and update CI/CD configs
- [x] T002 Configure environment variables in .env.example with all required Supabase keys
- [x] T003 [P] Fix port conflict by updating development scripts in apps/web/package.json (dev: next dev -p 3001)
- [x] T004 [P] Update DATABASE_URL configuration in packages/db/prisma/schema.prisma to use Supabase connection
- [x] T005 Test local development environment startup and resolve any remaining blockers

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

- [x] T006 [P] Contract test /api/health in apps/web/__tests__/contract/health.test.ts
- [x] T007 [P] Contract test /api/health/worker in apps/web/__tests__/contract/worker-health.test.ts
- [x] T008 [P] Contract test /api/errors/report in apps/web/__tests__/contract/error-report.test.ts
- [x] T009 [P] Contract test /api/jobs/{jobId}/retry in apps/web/__tests__/contract/job-retry.test.ts
- [x] T010 [P] Integration test CSV upload workflow in apps/web/__tests__/integration/csv-upload.test.ts
- [x] T011 [P] Integration test worker processing in apps/web/__tests__/integration/worker-processing.test.ts
- [x] T012 [P] Integration test error handling and retry in apps/web/__tests__/integration/error-retry.test.ts

## Phase 3.3: Backend Infrastructure (Week 1 - Days 3-5)
**Focus: Data persistence and worker reliability - NO UI changes**

- [x] T013 [P] Environment configuration service in packages/db/src/services/config-service.ts
- [x] T014 [P] Worker service management models in packages/db/src/models/worker-instance.ts
- [x] T015 [P] Enhanced import jobs model with retry logic in packages/db/src/models/import-job.ts
- [x] T016 [P] Security framework utilities in packages/db/src/services/security-service.ts
- [x] T017 [P] Monitoring metrics collection in packages/db/src/services/metrics-service.ts
- [x] T018 Health check API endpoint in apps/web/src/app/api/health/route.ts
- [x] T019 Worker health endpoint in apps/web/src/app/api/health/worker/route.ts
- [x] T020 Error reporting endpoint in apps/web/src/app/api/errors/report/route.ts
- [x] T021 Job retry endpoint in apps/web/src/app/api/jobs/[jobId]/retry/route.ts
- [x] T022 Performance metrics endpoint in apps/web/src/app/api/metrics/performance/route.ts

## Phase 3.4: Worker Service Enhancement (Week 1 - Days 6-7)
**Focus: CSV processing reliability**

- [x] T023 Streaming CSV parser with memory efficiency in apps/worker/processors/csv-stream.js
- [x] T024 Job retry logic with exponential backoff in apps/worker/processors/retry-handler.js
- [x] T025 Worker health monitoring and heartbeat in apps/worker/services/health-monitor.js
- [x] T026 Enhanced error handling with user-friendly messages in apps/worker/utils/error-formatter.js
- [x] T027 Performance metrics collection in worker in apps/worker/services/metrics-collector.js

## Phase 3.5: Security Hardening (Week 2 - Days 1-2)
**Focus: RLS policies and authentication**

- [x] T028 [P] Enhanced RLS policies for new tables in packages/db/sql/enhanced-rls.sql
- [x] T029 [P] Workspace isolation validation in packages/db/src/middleware/workspace-validator.ts
- [x] T030 [P] API rate limiting middleware in apps/web/src/middleware/rate-limiter.ts
- [x] T031 Authentication token validation enhancement in apps/web/src/lib/auth-validator.ts
- [x] T032 Audit logging for sensitive operations in packages/db/src/services/audit-logger.ts

## Phase 3.6: Performance Optimization (Week 2 - Days 3-4)
**Focus: Maintain existing UX while improving performance**

- [x] T033 [P] Database query optimization for CSV processing in packages/db/src/services/query-optimizer.ts
- [x] T034 [P] Memory usage monitoring and cleanup in apps/worker/utils/memory-manager.js
- [x] T035 Concurrent processing limits and queue management in apps/worker/services/queue-manager.js
- [x] T036 File upload progress tracking (backend only) in apps/web/src/app/api/upload/progress/route.ts
- [x] T037 Background job status polling optimization in apps/web/src/lib/job-poller.ts

## Phase 3.7: Monitoring and Alerting (Week 2 - Days 5-6)
**Focus: Production observability**

- [x] T038 [P] Error tracking and notification system in packages/db/src/services/error-tracker.ts
- [x] T039 [P] Performance metrics dashboard data in apps/web/src/lib/metrics-aggregator.ts
- [x] T040 System health monitoring cron jobs in apps/worker/services/health-checker.js
- [x] T041 Alert threshold configuration in packages/db/src/config/alert-thresholds.ts
- [x] T042 Log aggregation and structured logging in packages/db/src/services/logger.ts

## Phase 3.8: Testing and Validation (Week 2 - Day 7)
**Focus: Quality assurance**

- [x] T043 [P] Unit tests for new service layers in packages/db/__tests__/unit/
- [x] T044 [P] Performance tests for 50MB CSV processing in apps/web/__tests__/performance/
- [x] T045 [P] Security tests for RLS and authentication in apps/web/__tests__/security/
- [x] T046 End-to-end workflow tests covering complete pipeline in apps/web/__tests__/e2e/
- [x] T047 Load testing for concurrent workspace scenarios in apps/web/__tests__/load/

## Dependencies
- Critical blockers (T001-T005) before ALL other tasks
- Tests (T006-T012) before implementation (T013-T022)
- Backend infrastructure (T013-T022) before worker enhancement (T023-T027)
- Security (T028-T032) can run parallel with performance (T033-T037)
- Monitoring (T038-T042) depends on backend infrastructure
- Testing (T043-T047) after all implementation phases

## Parallel Example
```
# Week 1 Day 3 - Launch backend infrastructure tasks together:
Task: "Environment configuration service in packages/db/src/services/config-service.ts"
Task: "Worker service management models in packages/db/src/models/worker-instance.ts"
Task: "Enhanced import jobs model with retry logic in packages/db/src/models/import-job.ts"
Task: "Security framework utilities in packages/db/src/services/security-service.ts"
Task: "Monitoring metrics collection in packages/db/src/services/metrics-service.ts"
```

## Incremental Deployment Strategy
**Week 1 End**: Deploy blocker fixes and basic monitoring (T001-T027)
**Week 2 Mid**: Deploy security enhancements and performance optimizations (T028-T037)
**Week 2 End**: Deploy monitoring/alerting and final validation (T038-T047)

## UI/UX Preservation Notes
- NO changes to existing React components during Phases 3.3-3.7
- NO changes to existing routing or page structure  
- NO changes to current user workflows or interactions
- Backend enhancements should be transparent to users
- Performance improvements should enhance, not change, existing experience

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing
- Each task should take 1-2 hours maximum
- Focus on incremental deployment readiness
- Preserve all existing functionality
- Commit after each task for rollback capability