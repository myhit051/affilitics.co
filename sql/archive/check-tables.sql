-- Check what tables exist in the database
SELECT 
    schemaname,
    tablename 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Show table names in both formats (prisma vs postgres)
SELECT 
    'Expected by Prisma: ' || 'AffiliateOrder' as model_name,
    'Expected by SQL: ' || 'affiliate_orders' as table_name
UNION ALL
SELECT 
    'Expected by Prisma: ' || 'ImportJob' as model_name,
    'Expected by SQL: ' || 'import_jobs' as table_name
UNION ALL
SELECT 
    'Expected by Prisma: ' || 'ImportError' as model_name,
    'Expected by SQL: ' || 'import_errors' as table_name
UNION ALL
SELECT 
    'Expected by Prisma: ' || 'Workspace' as model_name,
    'Expected by SQL: ' || 'workspaces' as table_name
UNION ALL
SELECT 
    'Expected by Prisma: ' || 'Member' as model_name,
    'Expected by SQL: ' || 'members' as table_name;