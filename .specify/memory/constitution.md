<!--
Sync Impact Report:
Version change: Initial → 1.0.0
Added sections: Complete constitution for Affilitics.co production transformation
Modified principles: All principles created from scratch for MVP-to-production transformation
Templates requiring updates: All verified and consistent
Follow-up TODOs: None - all placeholders filled with concrete values
-->

# Affilitics.co Constitution

## Core Principles

### I. MVP-First Production Readiness (NON-NEGOTIABLE)
Resolve all existing blockers before adding new features. Every development effort MUST prioritize system stability, environment consistency, and deployment readiness over feature expansion. New features are prohibited until all critical blockers (Node.js v18 deprecation, database configuration, environment variables, port conflicts) are resolved and the MVP is production-ready.

Rationale: The project is 75% complete but stalled due to foundational issues. Attempting new features while core systems are broken leads to compound technical debt and delayed production deployment.

### II. Monorepo Architecture Integrity
Maintain strict separation between `apps/web` (Next.js frontend), `apps/worker` (data processing service), and `packages/db` (shared database logic). Each workspace MUST have independent package.json, clear responsibilities, and minimal cross-dependencies. Changes affecting multiple workspaces require architecture review.

Rationale: Monorepo provides scalability and code sharing benefits but requires disciplined boundaries to prevent coupling and deployment complexity.

### III. Security & RLS First
Supabase Row Level Security (RLS) MUST be enabled on all user data tables. Every database operation MUST include workspace_id filtering. All API endpoints MUST validate Authorization Bearer tokens and x-workspace-id headers. No user data can be accessed without proper workspace isolation.

Rationale: Affiliate marketing data contains sensitive business information requiring strict access controls and multi-tenant isolation.

### IV. CSV Processing Reliability
The data pipeline (upload → staging → transformation → metrics) MUST handle errors gracefully with user-friendly messages, implement retry mechanisms for failed processing, and maintain data integrity throughout the workflow. Every CSV upload operation MUST be auditable and recoverable.

Rationale: CSV processing is the core value proposition; failures directly impact user trust and business value.

### V. Environment Consistency
Development, staging, and production environments MUST use identical configuration patterns. All environment variables MUST be documented in .env.example. Database connections, authentication keys, and service URLs MUST be environment-specific but follow consistent naming conventions across all environments.

Rationale: Environment inconsistencies are the primary cause of current blockers and deployment failures.

## Development Workflow

### Testing Requirements
- Integration tests MUST cover the complete CSV upload workflow
- Contract tests required for all API endpoints
- Database migrations MUST be tested against production-like data volumes
- Worker service MUST have automated job processing tests

### Code Review Standards
- All PRs affecting database schema require architecture review
- Security-related changes require two approvals
- Performance-impacting changes require benchmark validation
- Breaking changes to shared packages require migration plan

## Production Standards

### Performance Requirements
- CSV files up to 50MB MUST process within 10 seconds
- API endpoints MUST respond within 200ms (95th percentile)
- Worker jobs MUST handle 100+ concurrent workspaces
- Database queries MUST use proper indexing for workspace isolation

### Security Compliance
- All data at rest MUST be encrypted (Supabase default)
- API rate limiting MUST be enforced per workspace
- Audit logging MUST capture all data access and modifications
- Sensitive operations MUST require recent authentication

### Monitoring & Observability
- Worker job failures MUST trigger alerts
- Database performance MUST be continuously monitored
- API error rates exceeding 5% MUST trigger investigation
- CSV processing success rates MUST maintain 95% threshold

## Governance

### Amendment Process
Constitution changes require documentation of impact on existing systems, approval from technical lead, and migration plan for affected components. Breaking changes to core principles require business stakeholder approval.

### Compliance Review
All feature planning MUST include constitutional compliance check. Development tasks violating core principles require explicit justification and architectural review. System architecture decisions MUST reference relevant constitutional principles.

### Version Control
Constitution follows semantic versioning. MAJOR increments for principle changes affecting system architecture. MINOR increments for new sections or expanded guidance. PATCH increments for clarifications and documentation improvements.

**Version**: 1.0.0 | **Ratified**: 2025-10-03 | **Last Amended**: 2025-10-03