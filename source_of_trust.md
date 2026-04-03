# Affilitics.co - Source of Trust Documentation

**เอกสารอ้างอิงหลักของระบบ Affilitics.co**
**Last Updated:** October 9, 2025
**Version:** 1.0.0
**Branch:** 001-i-have-an

---

## 📋 สารบัญ

1. [ภาพรวมระบบ](#ภาพรวมระบบ)
2. [สถาปัตยกรรมระบบ](#สถาปัตยกรรมระบบ)
3. [เทคโนโลยีที่ใช้](#เทคโนโลยีที่ใช้)
4. [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์)
5. [ฐานข้อมูล](#ฐานข้อมูล)
6. [API Endpoints](#api-endpoints)
7. [การ Authentication & Authorization](#การ-authentication--authorization)
8. [การ Deployment](#การ-deployment)
9. [การ Monitoring & Observability](#การ-monitoring--observability)
10. [ข้อมูลสำคัญอื่นๆ](#ข้อมูลสำคัญอื่นๆ)

---

## ภาพรวมระบบ

### จุดประสงค์
Affilitics.co เป็นแพลตฟอร์มสำหรับจัดการและวิเคราะห์ข้อมูล Affiliate Marketing จากหลายแพลตฟอร์ม (Shopee, Lazada, TikTok) โดยรองรับการทำงานแบบ Multi-tenant (Workspace-based)

### คุณสมบัติหลัก
- 📤 **CSV Import**: อัปโหลดและประมวลผลไฟล์ CSV จากแพลตฟอร์ม e-commerce
- 📊 **Analytics Dashboard**: วิเคราะห์ข้อมูลยอดขายและคอมมิชชั่น
- 👥 **Multi-tenant**: รองรับหลาย workspace ในระบบเดียว
- 🔒 **Security**: RLS (Row Level Security) และ workspace isolation
- ⚡ **Performance**: ประมวลผล CSV ขนาด 50MB ภายใน 6-8 วินาที
- 📈 **Monitoring**: Real-time error tracking และ performance metrics

### เป้าหมายประสิทธิภาพ
- ✅ API response time < 200ms (P95)
- ✅ 50MB CSV processing < 10 วินาที
- ✅ รองรับ 100+ concurrent workspaces
- ✅ 95%+ success rate
- ✅ 99.5% uptime monitoring capability

---

## สถาปัตยกรรมระบบ

### High-Level Architecture

```
┌─────────────┐
│   Client    │  (Next.js Frontend)
│  (Browser)  │
└──────┬──────┘
       │
       │ HTTPS
       ▼
┌─────────────┐
│   Web App   │  (Next.js + API Routes)
│  (Port 3001)│
└──────┬──────┘
       │
       ├──────► Supabase Auth (Authentication)
       │
       ├──────► Supabase Storage (File Storage)
       │
       ├──────► PostgreSQL Database (via Prisma)
       │
       └──────► Worker Service (CSV Processing)
                       │
                       ▼
                 ┌──────────────┐
                 │  Queue System │
                 │ (Job Manager) │
                 └──────────────┘
```

### Component Architecture

#### 1. **Frontend (Next.js App Router)**
- **Path:** `/apps/web`
- **Framework:** Next.js 14 with App Router
- **UI Library:** React 18 + Radix UI + Tailwind CSS
- **State Management:** React Context API
- **Port:** 3001

#### 2. **Backend (Next.js API Routes)**
- **Path:** `/apps/web/src/app/api`
- **Authentication:** Supabase Auth + JWT
- **Database ORM:** Prisma Client
- **Security:** RLS, CSRF Protection, Rate Limiting

#### 3. **Worker Service**
- **Path:** `/apps/worker`
- **Purpose:** Background CSV processing
- **Features:** Queue management, Memory management, Batch processing

#### 4. **Shared Package**
- **Path:** `/packages/db`
- **Contains:** Prisma schema, Database utilities, Type definitions

---

## เทคโนโลยีที่ใช้

### Core Stack

#### Frontend
- **Next.js** 14.2.5 - React framework with App Router
- **React** 18.3.1 - UI library
- **TypeScript** 5.5.4 - Type-safe development
- **Tailwind CSS** 3.4.9 - Utility-first CSS
- **Radix UI** - Accessible component primitives
- **Recharts** 3.2.1 - Data visualization
- **Lucide React** - Icon library

#### Backend
- **Next.js API Routes** - Serverless API endpoints
- **Prisma** 5.22.0 - Type-safe ORM
- **Supabase** 2.45.0 - Auth, Storage, Database
- **PostgreSQL** - Relational database
- **Zod** 3.23.8 - Schema validation

#### CSV Processing
- **PapaParse** 5.5.3 - CSV parsing
- **Stream processing** - Memory-efficient large file handling
- **Batch operations** - Optimized database inserts

#### Security
- **Supabase Auth** - Authentication provider
- **JWT** - Token-based authentication
- **RLS (Row Level Security)** - Database-level security
- **CSRF Protection** - Cross-site request forgery protection
- **Rate Limiting** - API abuse prevention

#### Testing
- **Vitest** 3.2.4 - Unit & integration testing
- **Testing Library** - Component testing
- **Playwright** - E2E testing

### Infrastructure & DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Coolify** - Deployment platform (primary)
- **Vercel** - Alternative deployment (supported)
- **pnpm** 10.16.1 - Package manager
- **Node.js** 20+ (Required, currently 18 - needs upgrade)

---

## โครงสร้างโปรเจกต์

### Monorepo Structure (pnpm Workspaces)

```
affilitics.co/
├── apps/
│   ├── web/                    # Next.js web application
│   │   ├── src/
│   │   │   ├── app/           # App Router pages & API routes
│   │   │   │   ├── api/       # API endpoints
│   │   │   │   ├── auth/      # Authentication pages
│   │   │   │   ├── dashboard/ # Dashboard pages
│   │   │   │   └── import/    # Import pages
│   │   │   ├── components/    # React components
│   │   │   ├── contexts/      # React contexts
│   │   │   ├── hooks/         # Custom hooks
│   │   │   ├── lib/           # Utilities & helpers
│   │   │   └── types/         # TypeScript types
│   │   ├── public/            # Static assets
│   │   └── package.json
│   │
│   └── worker/                 # Background worker service
│       ├── processors/        # Job processors
│       ├── services/          # Worker services
│       ├── utils/             # Worker utilities
│       └── index.js
│
├── packages/
│   └── db/                     # Shared database package
│       ├── prisma/            # Prisma schema
│       ├── src/               # Database utilities
│       └── package.json
│
├── docs/                       # Documentation
│   ├── affilitics-project-brief.md
│   ├── affilitics-prd.md
│   ├── monitoring-observability-guide.md
│   └── sub-agents-orches.md
│
├── specs/                      # Feature specifications
│   └── 001-i-have-an/
│       ├── spec.md
│       ├── plan.md
│       ├── tasks.md
│       ├── data-model.md
│       ├── research.md
│       └── quickstart.md
│
├── docker-compose.yml          # Docker compose configuration
├── Dockerfile                  # Docker image definition
├── package.json                # Root package.json
├── pnpm-workspace.yaml         # pnpm workspace config
└── .env.example                # Environment variables template
```

### Key Directories Explained

#### `/apps/web/src/app/api/`
API Routes สำหรับต่าง ๆ:
- `/api/auth/*` - Authentication endpoints
- `/api/import/*` - CSV import endpoints
- `/api/analytics/*` - Analytics data endpoints
- `/api/workspace/*` - Workspace management
- `/api/health` - Health check endpoint
- `/api/metrics/*` - Performance metrics

#### `/apps/web/src/components/`
Component structure:
- `/analytics/` - Analytics dashboard components
- `/import/` - Import-related components
- `/ui/` - Reusable UI components (Radix UI wrappers)

#### `/apps/worker/`
Background processing:
- `processors/csv-stream.js` - Stream-based CSV processing
- `services/queue-manager.js` - Job queue management
- `services/health-checker.js` - Health monitoring
- `utils/memory-manager.js` - Memory management

---

## ฐานข้อมูล

### Database Provider
**Supabase PostgreSQL** (https://qpwtdzvmzhlnxighhkpi.supabase.co)

### Schema Overview

#### **Workspace** (Multi-tenant)
```prisma
model Workspace {
  id        String   @id @default(uuid())
  name      String
  plan      String   @default("free")  // free, pro, enterprise
  members   Member[]
  createdAt DateTime @default(now())
}
```

#### **Member** (User-Workspace relationship)
```prisma
model Member {
  id          String   @id @default(uuid())
  userId      String                    // Supabase Auth user ID
  workspaceId String
  role        String                    // owner, admin, member, viewer
  workspace   Workspace @relation(...)
  @@unique([userId, workspaceId])       // One user can have one role per workspace
}
```

#### **ImportJob** (CSV import tracking)
```prisma
model ImportJob {
  id           String   @id @default(uuid())
  workspaceId  String
  platform     String                   // shopee, lazada, tiktok
  filename     String
  size         Int                      // File size in bytes
  status       String   @default("queued")  // queued|processing|done|failed
  error        String?
  startedAt    DateTime?
  finishedAt   DateTime?
  createdBy    String                  // User ID who created the job
  createdAt    DateTime @default(now())
  hash         String?                 // File hash for deduplication
  @@index([workspaceId, createdAt])
}
```

#### **ImportError** (Import error logs)
```prisma
model ImportError {
  id        String   @id @default(uuid())
  jobId     String
  rowNo     Int                        // Row number with error
  field     String?                    // Field name with error
  message   String                     // Error message
  sample    String?                    // Sample data
  createdAt DateTime @default(now())
  @@index([jobId])
}
```

#### **AffiliateOrder** (Fact table)
```prisma
model AffiliateOrder {
  id           String   @id @default(uuid())
  workspaceId  String
  platform     String                  // shopee, lazada, tiktok
  orderId      String                  // Platform order ID
  subid        String?                 // Affiliate sub-ID
  amount       Decimal? @db.Decimal(14,2)   // Order amount
  net          Decimal? @db.Decimal(14,2)   // Net amount
  commission   Decimal? @db.Decimal(14,2)   // Commission earned
  eventDate    DateTime                // Order date
  createdAt    DateTime @default(now())
  @@unique([workspaceId, platform, orderId])  // Prevent duplicates
  @@index([workspaceId, eventDate])
}
```

### Row Level Security (RLS)

All tables have RLS policies enforcing workspace isolation:

```sql
-- Example: Users can only see data from their workspaces
CREATE POLICY "Users can view their workspace data"
ON affiliate_orders FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id
    FROM members
    WHERE user_id = auth.uid()
  )
);
```

### Key Indexes
- `ImportJob`: `(workspaceId, createdAt)`
- `ImportError`: `(jobId)`
- `AffiliateOrder`: `(workspaceId, eventDate)`, `(workspaceId, platform, orderId)`

---

## API Endpoints

### Authentication

#### `POST /api/auth/login`
Login with email/password

#### `POST /api/auth/signup`
Create new account

#### `POST /api/auth/logout`
Logout current session

#### `GET /api/auth/csrf-token`
Get CSRF token for protected requests

### Import Management

#### `POST /api/import/upload`
Upload CSV file for processing
- **Auth:** Required
- **Headers:** `x-workspace-id`, `x-csrf-token`
- **Body:** FormData with file
- **Response:** `{ jobId, status }`

#### `GET /api/import/jobs`
Get import job history
- **Auth:** Required
- **Query:** `workspaceId`
- **Response:** Array of ImportJob

#### `GET /api/import/jobs/[id]`
Get specific import job details
- **Auth:** Required
- **Response:** ImportJob with errors

#### `POST /api/import/validate`
Validate CSV before upload
- **Auth:** Required
- **Body:** `{ csvContent, platform }`
- **Response:** Validation results

#### `POST /api/import/commit`
Commit imported data to fact table
- **Auth:** Required
- **Body:** `{ jobId }`

### Analytics

#### `GET /api/analytics/overview`
Get analytics dashboard data
- **Auth:** Required
- **Query:** `workspaceId, from, to, platform, subid`
- **Response:** Aggregated metrics

#### `GET /api/metrics/summary`
Get metrics summary
- **Auth:** Required
- **Query:** `workspaceId, dateFrom, dateTo`
- **Response:** KPIs and trends

### Workspace

#### `GET /api/workspace/list`
Get user's workspaces
- **Auth:** Required
- **Response:** Array of Workspace

#### `POST /api/workspace/create`
Create new workspace
- **Auth:** Required
- **Body:** `{ name, plan }`

#### `GET /api/workspace/[id]/validate`
Validate workspace access
- **Auth:** Required
- **Response:** `{ valid, role, permissions }`

### Health & Monitoring

#### `GET /api/health`
System health check
- **Auth:** Not required
- **Response:** `{ status: "healthy", uptime, timestamp }`

#### `GET /api/health/worker`
Worker service health
- **Auth:** Required
- **Response:** `{ status, activeWorkers, queueLength }`

#### `GET /api/metrics/performance`
Performance metrics
- **Auth:** Required
- **Response:** Detailed performance data

### Upload Progress

#### `GET /api/upload/progress?uploadId={id}`
Get upload progress
- **Auth:** Required
- **Response:** `{ progress, speed, estimatedTimeRemaining }`

#### `POST /api/upload/progress`
Update upload progress
- **Auth:** Required
- **Body:** `{ uploadId, uploadedBytes, status }`

---

## การ Authentication & Authorization

### Authentication Flow

```
1. User → Login → Supabase Auth
2. Supabase Auth → Return JWT token
3. Client → Store token in HTTP-only cookie
4. Subsequent requests → Include token in Authorization header
5. API → Validate JWT → Check workspace membership → Process request
```

### JWT Token Structure

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "workspace_id": "current-workspace-uuid",
  "role": "owner|admin|member|viewer",
  "exp": 1234567890
}
```

### Permission Matrix

| Role   | Read Data | Write Data | Import Files | Manage Imports | Invite Members | Delete Workspace |
|--------|-----------|------------|--------------|----------------|----------------|------------------|
| Owner  | ✅        | ✅         | ✅           | ✅             | ✅             | ✅               |
| Admin  | ✅        | ✅         | ✅           | ✅             | ✅             | ❌               |
| Member | ✅        | ✅         | ✅           | ❌             | ❌             | ❌               |
| Viewer | ✅        | ❌         | ❌           | ❌             | ❌             | ❌               |

### Security Measures

1. **Row Level Security (RLS)**
   - All database queries filtered by workspace
   - Enforced at database level
   - Cannot be bypassed by application code

2. **CSRF Protection**
   - Token-based CSRF validation
   - Token expiry: 1 hour
   - Rate limiting: 100 requests/hour per user

3. **Rate Limiting**
   - Upload API: Limited per workspace
   - Authentication: Failed attempt tracking
   - API calls: Per-endpoint limits

4. **Audit Logging**
   - All sensitive operations logged
   - Includes user ID, workspace ID, action, timestamp
   - Queryable for compliance

---

## การ Deployment

### Supported Platforms

#### 1. **Coolify (Primary - Recommended)**
- **Guide:** `/COOLIFY_DEPLOYMENT_GUIDE.md`
- **Port:** 3000 (configurable)
- **Services:** web + worker
- **Docker:** Uses `docker-compose.yml`

**Key Features:**
- Auto-deployment on git push
- Zero-downtime deployment
- Built-in SSL/TLS
- Environment variable management
- Log aggregation

#### 2. **Vercel (Alternative)**
- **Guide:** `/VERCEL_DEPLOYMENT_GUIDE.md`
- **Limitations:** No worker service support
- **Best for:** Frontend-only deployment

### Environment Variables

#### Required Variables

```bash
# Application
NODE_ENV=production
PORT=3001
APP_ORIGIN=https://your-domain.com

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_STORAGE_BUCKET=affilitics-uploads

# Database
DATABASE_URL=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres

# Security
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=https://your-domain.com
CSRF_TOKEN_EXPIRY=3600000
CSRF_RATE_LIMIT=100

# Monitoring
ENABLE_METRICS=true
ERROR_REPORTING=true
LOG_LEVEL=info
ALERT_WEBHOOKS=https://hooks.slack.com/YOUR/WEBHOOK

# Performance
MAX_CONCURRENT_JOBS=10
MAX_QUEUE_SIZE=1000
MEMORY_WARNING_THRESHOLD=0.75
MEMORY_CRITICAL_THRESHOLD=0.90
HEALTH_CHECK_INTERVAL=60000
```

### Docker Configuration

#### Dockerfile
- Base: Node.js 20 Alpine
- Multi-stage build for optimization
- Binary targets: native, linux-musl-openssl-3.0.x

#### docker-compose.yml
Services:
- **web**: Next.js application (port 3000)
- **worker**: Background worker service

### Deployment Checklist

Pre-deployment:
- [ ] Environment variables configured
- [ ] Database schema applied
- [ ] RLS policies enabled
- [ ] SSL certificate active
- [ ] Secrets rotated

Post-deployment:
- [ ] Health checks passing
- [ ] Authentication flow working
- [ ] CSV upload and processing working
- [ ] Monitoring and alerts active
- [ ] Performance metrics acceptable

---

## การ Monitoring & Observability

### Monitoring Stack

#### 1. **Error Tracking**
- **File:** `packages/db/src/services/error-tracker.ts`
- **Features:**
  - 5 severity levels (Critical, High, Medium, Low, Info)
  - Auto-notification for critical errors
  - Error analytics and trending
  - Webhook integration

#### 2. **Performance Metrics**
- **File:** `apps/web/src/lib/metrics-aggregator.ts`
- **Metrics:**
  - API response time (avg, p50, p95, p99)
  - CSV processing duration
  - Worker service performance
  - Business KPIs

#### 3. **Health Monitoring**
- **File:** `apps/worker/services/health-checker.js`
- **Checks:**
  - Database connectivity
  - Worker service status
  - API availability
  - System resources (CPU, Memory)
  - Job queue status
- **Frequency:** Every 1 minute

#### 4. **Structured Logging**
- **File:** `packages/db/src/services/logger.ts`
- **Levels:** DEBUG, INFO, WARN, ERROR, FATAL
- **Format:** JSON
- **Context:** Service, workspace, user, request ID
- **Storage:** Database + File (configurable)

### Alert Thresholds

#### Performance Alerts
- ⚠️ API Response Time > 500ms (Warning)
- 🚨 API Response Time > 1000ms (Critical)
- ⚠️ Error Rate > 5% (Warning)
- 🚨 Error Rate > 10% (Critical)
- ⚠️ CSV Processing > 15s (Warning)
- 🚨 CSV Processing > 30s (Critical)

#### Resource Alerts
- ⚠️ Memory Usage > 75% (Warning)
- 🚨 Memory Usage > 90% (Critical)
- ⚠️ CPU Usage > 75% (Warning)
- 🚨 CPU Usage > 90% (Critical)
- ⚠️ Queue Length > 100 (Warning)
- 🚨 Queue Length > 200 (Critical)

#### Worker Alerts
- ⚠️ Active Workers < 2 (Warning)
- 🚨 Active Workers < 1 (Critical)
- ⚠️ Job Failure Rate > 5% (Warning)
- 🚨 Job Failure Rate > 10% (Critical)

### Monitoring Endpoints

- `GET /api/health` - Basic health check
- `GET /api/health/worker` - Worker service health
- `GET /api/metrics/performance` - Detailed performance metrics

### Dashboards

#### System Overview
- Status (healthy/degraded/down)
- Uptime percentage
- Active alerts count
- Recent errors

#### Performance Metrics
- API response time trends
- CSV processing performance
- Success/failure rates
- Request volume

#### Business Metrics
- Active workspaces
- Active users
- Import jobs processed
- Storage usage

---

## ข้อมูลสำคัญอื่นๆ

### Conventions & Patterns

#### Code Style
- **TypeScript:** Strict mode enabled
- **Naming:** camelCase for variables, PascalCase for components
- **Imports:** Absolute imports with `@/` prefix
- **Components:** Functional components with hooks

#### Database Conventions
- **IDs:** UUID v4
- **Timestamps:** `createdAt`, `updatedAt` (where applicable)
- **Soft Delete:** Not implemented (use hard delete)
- **Naming:** camelCase for Prisma models

#### API Conventions
- **RESTful:** Follow REST principles
- **Error Responses:** Consistent error format
- **Status Codes:** Standard HTTP status codes
- **Pagination:** Cursor-based (where needed)

### Testing Strategy

#### Unit Tests (>90% coverage target)
- Location: `__tests__/unit/`
- Framework: Vitest
- Focus: Individual functions and components

#### Integration Tests
- Location: `__tests__/integration/`
- Focus: API endpoints, database interactions
- Tools: Vitest + supertest

#### E2E Tests
- Location: `__tests__/e2e/`
- Framework: Playwright
- Focus: Complete user workflows

#### Performance Tests
- Location: `__tests__/performance/`
- Focus: CSV processing, API response times
- Tools: Custom benchmark scripts

#### Security Tests
- Location: `__tests__/security/`
- Focus: RLS policies, authentication, authorization
- Tools: Vitest with Supabase client

### Performance Optimization

#### Database
- Batch insert operations (1,000 rows per batch)
- Connection pooling
- Strategic indexes
- Query optimization with EXPLAIN

#### CSV Processing
- Stream-based processing
- Memory management with auto-cleanup
- Concurrent batch processing (max 5)
- Progress tracking

#### API
- Response caching (where appropriate)
- Lazy loading
- Pagination
- Compression

#### Frontend
- Code splitting
- Image optimization
- Lazy loading components
- Memoization (React.memo, useMemo)

### Known Issues & Limitations

1. **Node.js Version**
   - Current: v18.20.8
   - Required: v20+
   - Action: Upgrade needed

2. **ESLint Configuration**
   - Status: Not configured
   - Action: Run `next lint` and select strict mode

3. **CSV File Size**
   - Recommended max: 50MB
   - Hard limit: Configurable via environment

4. **Concurrent Workspaces**
   - Tested up to: 100 workspaces
   - Production limit: To be determined based on resources

### Future Enhancements (Backlog)

- SSO integration (Google, GitHub)
- MFA (Multi-Factor Authentication)
- Advanced filtering and saved views
- Report sharing with expirable links
- Automated data enrichment (FB/Google Ads integration)
- Data quality rules and anomaly detection
- Mobile app (React Native)
- API rate limiting per workspace tier
- Webhook notifications for job completion

---

## 📚 Documentation Reference

### Essential Guides
- **Project Brief:** `/docs/affilitics-project-brief.md`
- **Product Requirements:** `/docs/affilitics-prd.md`
- **Vertical Slices Plan:** `/affilitics_vertical_slices_plan.md`
- **Monitoring Guide:** `/docs/monitoring-observability-guide.md`

### Deployment Guides
- **Coolify:** `/COOLIFY_DEPLOYMENT_GUIDE.md`
- **Vercel:** `/VERCEL_DEPLOYMENT_GUIDE.md`
- **Production:** `/production-deployment-guide.md`

### Security Documentation
- **Workspace Security:** `/WORKSPACE_SECURITY.md`
- **CSRF Protection:** `/CSRF_SECURITY_IMPLEMENTATION.md`
- **Validation System:** `/VALIDATION_SYSTEM_SUMMARY.md`

### Implementation Reports
- **Performance Optimization:** `/PERFORMANCE_OPTIMIZATION_REPORT.md`
- **Monitoring Summary:** `/MONITORING_SUMMARY.md`
- **Implementation Complete:** `/IMPLEMENTATION_COMPLETE_REPORT.md`

### Feature Specifications
- **Current Feature (001-i-have-an):**
  - Spec: `/specs/001-i-have-an/spec.md`
  - Plan: `/specs/001-i-have-an/plan.md`
  - Tasks: `/specs/001-i-have-an/tasks.md`
  - Data Model: `/specs/001-i-have-an/data-model.md`
  - Quickstart: `/specs/001-i-have-an/quickstart.md`

### Setup & Configuration
- **OAuth Setup:** `/GOOGLE_OAUTH_SETUP.md`
- **Database Fix:** `/FIX-MEMBERS-TABLE.md`

---

## 🔄 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-09 | Initial source of trust documentation created |

---

## 📞 Support & Maintenance

### Getting Help
- Review this document first
- Check specific guides in `/docs/` directory
- Review implementation reports for recent changes
- Check GitHub issues (if applicable)

### Updating This Document
- Update whenever major architectural changes occur
- Update after adding new features
- Update environment variables section when adding new configs
- Keep API endpoints section synchronized with actual implementation

### Maintenance Schedule
- **Daily:** Monitor health checks and alerts
- **Weekly:** Review error logs and performance metrics
- **Monthly:** Security audit and dependency updates
- **Quarterly:** Performance review and optimization

---

**End of Source of Trust Documentation**

*This document serves as the single source of truth for the Affilitics.co system architecture, technology stack, and operational procedures. Keep it updated and refer to it when making architectural decisions or onboarding new team members.*
