# Quickstart: Production Readiness Enhancement

## Overview
This quickstart guide validates the production readiness enhancements for Affilitics.co, ensuring all critical blockers are resolved and the system meets production standards.

## Prerequisites
- Node.js v20+ installed
- pnpm package manager
- Access to Supabase project
- Vercel account for deployment

## Environment Setup Validation

### 1. Node.js Version Check
```bash
node --version
# Should return v20.x.x or higher
```

### 2. Environment Variables Verification
```bash
# Check all required environment variables are set
cat .env.local | grep -E "(SUPABASE_URL|SUPABASE_ANON_KEY|DATABASE_URL|NEXT_PUBLIC_)"
```

**Required Variables:**
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key
- `DATABASE_URL`: Supabase database connection string
- `NEXT_PUBLIC_SUPABASE_URL`: Public Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public Supabase key

### 3. Port Conflict Resolution
```bash
# Kill any process using port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Start development environment
pnpm dev
```

## Core Functionality Validation

### 4. Application Health Check
```bash
# Test application startup
curl http://localhost:3000/api/health
# Expected: {"status":"healthy","timestamp":"..."}
```

### 5. Database Connection Test
```bash
# Test database connectivity
pnpm run db:test
# Should connect successfully to Supabase
```

### 6. Worker Service Validation
```bash
# Start worker service in separate terminal
cd apps/worker
pnpm dev

# Test worker health
curl http://localhost:3000/api/health/worker
# Expected: Worker status with metrics
```

## CSV Processing Workflow Test

### 7. Upload Test File
1. Navigate to `http://localhost:3000`
2. Create or select a workspace
3. Upload a test CSV file (sample provided in `/test-data/sample-affiliate.csv`)
4. Verify processing completes within expected timeframe

### 8. End-to-End Pipeline Validation
```bash
# Monitor job processing
curl -H "Authorization: Bearer <jwt_token>" \
     -H "x-workspace-id: <workspace_id>" \
     http://localhost:3000/api/jobs/<job_id>/status

# Expected: Job progresses through states:
# queued → processing → completed
```

## Performance Validation

### 9. Large File Processing Test
- Upload a 50MB CSV file
- Verify processing completes within 10 seconds
- Check memory usage remains stable

### 10. Concurrent Upload Test
- Simulate multiple workspace uploads
- Verify system maintains performance
- Check no data cross-contamination occurs

## Security Validation

### 11. Authentication Test
```bash
# Test unauthenticated access is blocked
curl http://localhost:3000/api/import/upload
# Expected: 401 Unauthorized

# Test workspace isolation
curl -H "Authorization: Bearer <jwt_token>" \
     -H "x-workspace-id: <wrong_workspace_id>" \
     http://localhost:3000/api/metrics/summary
# Expected: 403 Forbidden or empty results
```

### 12. RLS Policy Verification
```sql
-- Connect to Supabase and verify RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = true;
```

## Monitoring and Error Handling

### 13. Error Handling Test
- Upload malformed CSV file
- Verify user-friendly error message
- Check error is logged for debugging

### 14. Retry Mechanism Test
- Simulate worker failure during processing
- Verify job automatically retries
- Check retry count increments correctly

### 15. Performance Metrics Collection
```bash
# Test metrics endpoint
curl -H "Authorization: Bearer <jwt_token>" \
     http://localhost:3000/api/metrics/performance?timeRange=1h
# Expected: Performance data with success rates
```

## Production Deployment Validation

### 16. Build Process Test
```bash
# Test production build
pnpm run build
# Should complete without errors
```

### 17. Type Safety Check
```bash
# Run TypeScript type checking
pnpm run type-check
# Should pass without errors
```

### 18. Security Test Suite
```bash
# Run security-focused tests
pnpm run test:security
# Should pass all security validations
```

## Success Criteria Checklist

- [ ] Node.js v20+ successfully installed and configured
- [ ] All environment variables properly set
- [ ] Port conflicts resolved, development environment starts cleanly
- [ ] Database connection established with proper RLS policies
- [ ] Worker service starts and processes jobs
- [ ] CSV upload and processing pipeline works end-to-end
- [ ] 50MB file processes within 10 seconds
- [ ] Multiple concurrent workspaces supported
- [ ] Authentication and authorization working
- [ ] Error handling provides user-friendly messages
- [ ] Retry mechanisms function correctly
- [ ] Performance metrics collection active
- [ ] Production build succeeds
- [ ] Type checking passes
- [ ] Security tests pass

## Troubleshooting Common Issues

### Port 3000 in Use
```bash
# Find and kill process using port 3000
sudo lsof -i :3000
sudo kill -9 <PID>
```

### Environment Variable Issues
```bash
# Copy example environment file
cp .env.example .env.local
# Edit with actual Supabase credentials
```

### Database Connection Problems
```bash
# Test database URL format
echo $DATABASE_URL | grep -E "^postgresql://.*@.*:.*/.*(sslmode=require)?"
```

### Worker Service Startup Issues
```bash
# Check worker dependencies
cd apps/worker
pnpm install
# Verify environment variables are accessible
node -e "console.log(process.env.SUPABASE_URL)"
```

## Next Steps

After successful quickstart validation:
1. Run full test suite: `pnpm test`
2. Deploy to staging environment
3. Conduct load testing
4. Security audit review
5. Production deployment