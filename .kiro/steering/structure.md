# Project Structure

## Root Level
- `.env.example` - Environment variable template
- `docker-compose.yml` - Container orchestration for web + worker
- `affilitics_vertical_slices_plan.md` - Product development roadmap

## Apps Directory (`apps/`)
### Web App (`apps/web/`)
- **Framework**: Next.js 14 with App Router
- **Structure**:
  - `src/app/api/` - API route handlers
  - `src/lib/` - Shared utilities (auth, db, supabase clients)
  - `next.config.js` - Next.js configuration
  - `package.json` - Web app dependencies

### Worker (`apps/worker/`)
- **Purpose**: Background CSV processing service
- **Structure**:
  - `index.js` - Main worker loop and CSV parsing logic
  - `package.json` - Worker dependencies (csv-parse, pg, supabase)

## Packages Directory (`packages/`)
### Database (`packages/db/`)
- **SQL Files** (`sql/`):
  - `schema.sql` - Core table definitions and indexes
  - `rls.sql` - Row Level Security policies
  - `functions.sql` - Database functions and views
- **Prisma** (`prisma/`):
  - `schema.prisma` - Type-safe database schema

## API Route Patterns
- `/api/import/upload` - File upload to Supabase Storage + job creation
- `/api/import/commit` - Trigger data transformation and metrics refresh
- `/api/metrics/summary` - Retrieve aggregated metrics with filtering

## Data Flow Architecture
1. **Upload Layer**: API routes handle file uploads and job queuing
2. **Processing Layer**: Worker polls jobs and processes CSV files
3. **Storage Layer**: Staging tables → normalized tables → metrics tables
4. **Security Layer**: RLS policies enforce workspace isolation

## Naming Conventions
- **Tables**: Snake_case (e.g., `import_jobs`, `affiliate_orders`)
- **API Routes**: RESTful paths with clear resource naming
- **Environment Variables**: SCREAMING_SNAKE_CASE
- **Package Names**: Scoped with `@aff/` prefix