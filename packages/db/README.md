# Database Package - Fix Missing Tables

## 🚨 Emergency Fix: Missing `members` Table

If you're getting the error `"Could not find the table 'public.members' in the schema cache"`, this means the database schema hasn't been applied to your Supabase instance yet.

### Quick Fix Options

#### Option 1: Manual SQL Execution (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `fix-missing-members-table.sql`
4. Click **Run** to execute the SQL
5. Restart your application

```bash
# The SQL file contains:
cat packages/db/fix-missing-members-table.sql
```

#### Option 2: Automated Script

```bash
# Install dependencies and run the initialization script
cd packages/db
pnpm install
pnpm run init-db
```

Make sure these environment variables are set:
- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`

#### Option 3: Complete Schema Setup

For a complete setup, run all schema files in order:

```sql
-- In Supabase SQL Editor, run these files in order:
-- 1. schema.sql
-- 2. rls.sql  
-- 3. functions.sql
-- 4. audit-schema.sql
```

### What Gets Created

The emergency fix creates these essential tables:

- ✅ `workspaces` - Workspace management
- ✅ `members` - User-workspace relationships with roles
- ✅ Row Level Security (RLS) policies
- ✅ Basic foreign key constraints

### Verification

After running the fix, verify the tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('workspaces', 'members');
```

### Troubleshooting

If you still get errors after running the fix:

1. **Check RLS policies**: Make sure Row Level Security is enabled
2. **Verify user authentication**: Ensure you're properly logged in
3. **Check service role**: The initialization script needs service role permissions
4. **Restart application**: Clear any cached connections

### Error Prevention

To prevent this issue in future deployments:

1. Always run database migrations before deploying code
2. Use the provided initialization scripts
3. Document database setup in your deployment process
4. Consider using database migration tools for production

### Related Files

- `fix-missing-members-table.sql` - Emergency fix for missing tables
- `init-db.js` - Automated initialization script
- `sql/schema.sql` - Complete database schema
- `sql/rls.sql` - Row Level Security policies
- `sql/functions.sql` - Database functions
- `sql/audit-schema.sql` - Audit logging tables