# Vercel Deployment Guide for Affilitics.co

This comprehensive guide covers deploying the Affilitics.co Next.js application to Vercel. The application uses a modern tech stack including Next.js 14, TypeScript, Supabase, Prisma ORM, and implements advanced security features including CSRF protection and multi-workspace architecture.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables Setup](#environment-variables-setup)
3. [Supabase Configuration](#supabase-configuration)
4. [Database Setup](#database-setup)
5. [Authentication Configuration](#authentication-configuration)
6. [Domain and OAuth Setup](#domain-and-oauth-setup)
7. [Security Configuration](#security-configuration)
8. [Build Configuration](#build-configuration)
9. [Deployment Steps](#deployment-steps)
10. [Post-Deployment Verification](#post-deployment-verification)
11. [Troubleshooting](#troubleshooting)

## Prerequisites

Before starting the deployment process, ensure you have:

- A Vercel account (sign up at [vercel.com](https://vercel.com))
- A Supabase account and project (sign up at [supabase.com](https://supabase.com))
- Your custom domain configured (optional but recommended for production)
- Access to your repository on GitHub, GitLab, or Bitbucket
- Node.js 18+ and pnpm installed locally for testing

## Environment Variables Setup

The application requires several environment variables for proper operation. Here's the complete list with explanations:

### Required Environment Variables

#### Database Configuration
```bash
# PostgreSQL database URL from Supabase
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
```

#### Supabase Configuration
```bash
# Your Supabase project URL
NEXT_PUBLIC_SUPABASE_URL="https://[your-project-ref].supabase.co"

# Public anonymous key (safe to expose to client)
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Service role key (keep secret - server-side only)
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# JWT secret for token verification
SUPABASE_JWT_SECRET="your-jwt-secret-from-supabase-settings"

# Storage bucket name for file uploads
SUPABASE_STORAGE_BUCKET="imports"
```

#### Authentication Configuration
```bash
# Secret key for NextAuth.js sessions (generate a strong random string)
NEXTAUTH_SECRET="your-super-secret-nextauth-key-32-chars-minimum"

# Your production domain URL
NEXTAUTH_URL="https://your-domain.com"
```

#### Security Configuration
```bash
# Your application's origin URL
APP_ORIGIN="https://your-domain.com"

# CSRF Protection Settings
CSRF_TOKEN_EXPIRY="3600000"      # 1 hour in milliseconds
CSRF_RATE_LIMIT="100"            # Max CSRF token requests per hour per user
CSRF_LOGGING_ENABLED="true"      # Enable CSRF security logging
```

#### Worker Configuration (Optional)
```bash
# Background worker interval for processing jobs
WORKER_INTERVAL="5000"           # 5 seconds in milliseconds
```

## Supabase Configuration

### Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose your organization
4. Enter project details:
   - **Name**: affilitics-production
   - **Database Password**: Generate a strong password (save it securely)
   - **Region**: Choose closest to your users
5. Wait for project creation (2-3 minutes)

### Step 2: Gather Supabase Configuration Values

Once your project is ready:

1. **Project URL and API Keys**:
   - Go to Settings → API
   - Copy the `Project URL` for `NEXT_PUBLIC_SUPABASE_URL`
   - Copy the `anon public` key for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy the `service_role` key for `SUPABASE_SERVICE_ROLE_KEY`

2. **JWT Secret**:
   - Go to Settings → API
   - Copy the `JWT Secret` for `SUPABASE_JWT_SECRET`

3. **Database URL**:
   - Go to Settings → Database
   - Under "Connection string", select "URI"
   - Copy the connection string for `DATABASE_URL`
   - Replace `[YOUR-PASSWORD]` with your actual database password

### Step 3: Configure Supabase Authentication

1. **Authentication Settings**:
   - Go to Authentication → Settings
   - Set "Site URL" to your production domain: `https://your-domain.com`
   - Add redirect URLs:
     - `https://your-domain.com/auth/callback`
     - `https://your-domain.com/**` (for development)

2. **Email Templates** (Optional):
   - Go to Authentication → Email Templates
   - Customize confirmation and password reset emails
   - Update redirect URLs to point to your domain

### Step 4: Set Up Storage

1. **Create Storage Bucket**:
   - Go to Storage
   - Create a new bucket named `imports`
   - Set it as public if you need public access to uploaded files
   - Configure RLS (Row Level Security) policies as needed

## Database Setup

### Step 1: Apply Database Schema

The application uses Prisma for database management. The schema includes:

- **Workspaces**: Multi-tenant workspace management
- **Members**: User-workspace relationships with roles
- **ImportJobs**: File import tracking
- **ImportErrors**: Import error logging
- **AffiliateOrders**: Core business data

### Step 2: Run Database Migrations

You have two options for setting up the database:

#### Option A: Using Prisma (Recommended)
```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push
```

#### Option B: Manual SQL Setup
If you prefer to run SQL directly in Supabase:

1. Go to your Supabase project → SQL Editor
2. Create the tables manually using the schema from `packages/db/prisma/schema.prisma`

### Step 3: Set Up Row Level Security (RLS)

Create RLS policies in Supabase SQL Editor:

```sql
-- Enable RLS on all tables
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportError" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AffiliateOrder" ENABLE ROW LEVEL SECURITY;

-- Example policy for Workspace table
CREATE POLICY "Users can view workspaces they are members of" ON "Workspace"
FOR SELECT USING (
  id IN (
    SELECT "workspaceId" FROM "Member" 
    WHERE "userId" = auth.uid()::text
  )
);

-- Add more policies as needed for your security requirements
```

## Authentication Configuration

The application uses a custom authentication system built on Supabase Auth. Here's how to configure it:

### Step 1: Generate NextAuth Secret

Generate a secure secret key:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32
```

Use this value for `NEXTAUTH_SECRET`.

### Step 2: Configure OAuth Providers (Optional)

If you want to enable OAuth providers:

1. **Google OAuth**:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create OAuth 2.0 credentials
   - Add redirect URI: `https://[your-project-ref].supabase.co/auth/v1/callback`
   - Add the credentials to Supabase Authentication → Providers

2. **GitHub OAuth**:
   - Go to GitHub → Settings → Developer settings → OAuth Apps
   - Create a new OAuth App
   - Set callback URL: `https://[your-project-ref].supabase.co/auth/v1/callback`
   - Add credentials to Supabase

### Step 3: Configure Email Authentication

1. **SMTP Settings** (for production):
   - Go to Supabase → Authentication → Settings
   - Configure SMTP settings for email delivery
   - Or use a service like SendGrid, AWS SES

## Domain and OAuth Setup

### Step 1: Configure Custom Domain

1. **In Vercel**:
   - Go to your project → Settings → Domains
   - Add your custom domain
   - Follow DNS configuration instructions

2. **In Supabase**:
   - Update Site URL to your custom domain
   - Update redirect URLs to use your domain

### Step 2: Update Environment Variables

After domain configuration, update:
```bash
NEXTAUTH_URL="https://your-custom-domain.com"
APP_ORIGIN="https://your-custom-domain.com"
```

## Security Configuration

The application implements several security measures:

### Step 1: CSRF Protection

The app includes built-in CSRF protection. Configure these variables:

```bash
CSRF_TOKEN_EXPIRY="3600000"      # 1 hour
CSRF_RATE_LIMIT="100"            # 100 requests per hour
CSRF_LOGGING_ENABLED="true"      # Enable security logging
```

### Step 2: Security Headers

The middleware automatically sets security headers:
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Content Security Policy
- Rate limiting

### Step 3: Environment Security

- Never commit `.env` files to version control
- Use Vercel's environment variable encryption
- Rotate secrets regularly
- Use different secrets for staging and production

## Build Configuration

### Step 1: Vercel Project Configuration

The application uses a monorepo structure with workspaces. Configure Vercel:

1. **Root Directory**: `/`
2. **Framework Preset**: Next.js
3. **Build Command**: `cd apps/web && pnpm build`
4. **Install Command**: `pnpm install`
5. **Output Directory**: `apps/web/.next`

### Step 2: Package Manager Configuration

Make sure Vercel uses pnpm:

1. Go to Project Settings → General
2. Set Node.js Version to `18.x` or higher
3. The `packageManager` field in root `package.json` should specify pnpm

### Step 3: Build Environment Variables

Set these build-time variables in Vercel:

```bash
# Essential for build process
NEXT_PUBLIC_SUPABASE_URL="https://[your-project-ref].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
DATABASE_URL="your-database-url"
```

## Deployment Steps

### Step 1: Connect Repository to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Configure project settings:
   - **Framework**: Next.js
   - **Root Directory**: `apps/web` 
   - **Build Command**: `pnpm build`
   - **Install Command**: `pnpm install`

### Step 2: Configure Environment Variables

1. Go to Project → Settings → Environment Variables
2. Add all the environment variables listed above
3. Set appropriate scopes:
   - **Production**: Production-only variables
   - **Preview**: Staging/preview variables
   - **Development**: Development variables (optional)

### Step 3: Deploy

1. **Initial Deployment**:
   - Vercel will automatically deploy when you connect the repo
   - Monitor the build logs for any errors

2. **Subsequent Deployments**:
   - Push changes to your main branch
   - Vercel automatically deploys changes

### Step 4: Configure Custom Domain (Optional)

1. Go to Project → Settings → Domains
2. Add your custom domain
3. Configure DNS records as instructed
4. Update environment variables to use new domain

## Post-Deployment Verification

### Step 1: Functional Testing

Test these critical functions:

1. **Authentication Flow**:
   ```
   - Visit /auth/login
   - Register a new account
   - Verify email (check email delivery)
   - Login with credentials
   - Test logout functionality
   ```

2. **Workspace Management**:
   ```
   - Create a new workspace
   - Navigate to workspace dashboard
   - Test workspace switching
   - Invite team members (if applicable)
   ```

3. **Import Functionality**:
   ```
   - Test file upload to Supabase storage
   - Verify import job creation
   - Check error handling for invalid files
   - Monitor background processing
   ```

4. **API Endpoints**:
   ```
   - Test /api/auth/csrf-token
   - Test /api/workspace/* endpoints
   - Verify proper authentication headers
   - Test rate limiting
   ```

### Step 2: Security Verification

1. **CSRF Protection**:
   - Test CSRF token generation and validation
   - Verify protection against cross-site requests

2. **Authentication Security**:
   - Test session management
   - Verify JWT token validation
   - Test workspace access controls

3. **Headers and Policies**:
   - Check security headers in browser dev tools
   - Verify CSP policy is working
   - Test rate limiting

### Step 3: Performance Testing

1. **Core Metrics**:
   - Check Lighthouse scores
   - Verify page load times
   - Test database query performance

2. **Error Monitoring**:
   - Set up error tracking (Sentry recommended)
   - Monitor application logs
   - Set up uptime monitoring

### Step 4: Database Verification

1. **Connection Testing**:
   ```bash
   # Test database connectivity
   pnpm db:test
   ```

2. **Data Integrity**:
   - Verify all tables were created
   - Test data insertion and retrieval
   - Check foreign key constraints

## Troubleshooting

### Common Issues and Solutions

#### Build Failures

**Issue**: "Module not found" errors during build
```
Solution:
1. Ensure all dependencies are in package.json
2. Check workspace configuration
3. Verify import paths are correct
4. Clear Vercel build cache
```

**Issue**: Prisma client generation fails
```
Solution:
1. Ensure DATABASE_URL is set correctly
2. Check Prisma schema syntax
3. Verify database connectivity
4. Run: pnpm db:generate locally first
```

#### Authentication Issues

**Issue**: "Invalid JWT" errors
```
Solution:
1. Verify SUPABASE_JWT_SECRET matches Supabase settings
2. Check NEXTAUTH_SECRET is set correctly
3. Ensure NEXTAUTH_URL matches your domain
4. Clear browser cookies and try again
```

**Issue**: OAuth redirects fail
```
Solution:
1. Check redirect URLs in OAuth provider settings
2. Verify Supabase Auth redirect URLs
3. Ensure NEXTAUTH_URL is correctly set
4. Check for HTTPS vs HTTP mismatches
```

#### Database Connection Issues

**Issue**: "Connection refused" database errors
```
Solution:
1. Verify DATABASE_URL format is correct
2. Check Supabase project is running
3. Verify IP allowlist settings (if configured)
4. Test connection from local environment
```

**Issue**: RLS policy denies access
```
Solution:
1. Review RLS policies in Supabase
2. Check user authentication context
3. Verify workspace membership data
4. Test policies in Supabase SQL editor
```

#### Environment Variable Issues

**Issue**: "Environment variable not found"
```
Solution:
1. Check variable names match exactly
2. Verify variables are set in Vercel dashboard
3. Restart deployment after adding variables
4. Check variable scoping (Production/Preview/Development)
```

### Getting Help

1. **Vercel Documentation**: [vercel.com/docs](https://vercel.com/docs)
2. **Supabase Documentation**: [supabase.com/docs](https://supabase.com/docs)
3. **Next.js Documentation**: [nextjs.org/docs](https://nextjs.org/docs)
4. **Application Logs**: Check Vercel function logs and Supabase logs

### Best Practices

1. **Security**:
   - Regularly rotate secrets
   - Monitor security logs
   - Keep dependencies updated
   - Use environment-specific configurations

2. **Performance**:
   - Enable Vercel Edge Functions where appropriate
   - Optimize database queries
   - Use proper caching strategies
   - Monitor Core Web Vitals

3. **Maintenance**:
   - Set up automated backups
   - Monitor application health
   - Plan for scaling requirements
   - Document configuration changes

This guide should provide everything needed for a successful deployment of the Affilitics.co application to Vercel. Remember to test thoroughly in a staging environment before deploying to production.