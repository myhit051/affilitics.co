# Technology Stack

## Architecture
- **Monorepo**: Multi-app workspace with shared packages
- **Frontend**: Next.js 14 with App Router
- **Backend**: Next.js API Routes + Node.js Worker
- **Database**: PostgreSQL via Supabase
- **Storage**: Supabase Storage for file uploads
- **Auth**: Supabase Auth with JWT tokens

## Key Dependencies
- **Next.js**: React framework with App Router
- **Prisma**: Database ORM and schema management
- **Supabase**: Backend-as-a-Service (Auth, DB, Storage)
- **Zod**: Runtime type validation
- **csv-parse**: CSV file processing
- **pg**: Direct PostgreSQL client for worker operations

## Development Commands
```bash
# Install dependencies
pnpm install

# Start web app (development)
pnpm --filter @aff/web dev

# Start worker (development)  
pnpm --filter @aff/worker dev

# Build web app
pnpm --filter @aff/web build

# Start web app (production)
pnpm --filter @aff/web start

# Start worker (production)
pnpm --filter @aff/worker start
```

## Database Management
- SQL files in `packages/db/sql/` define schema, RLS policies, and functions
- Prisma schema in `packages/db/prisma/schema.prisma` for type generation
- Run SQL files in order: `schema.sql` → `rls.sql` → `functions.sql`

## Environment Setup
1. Copy `.env.example` to `.env`
2. Configure Supabase credentials and database URL
3. Run SQL migrations in Supabase dashboard
4. Start web and worker services

## Deployment
- Docker Compose configuration provided
- Web app runs on port 3000
- Worker connects via DATABASE_URL with service role permissions