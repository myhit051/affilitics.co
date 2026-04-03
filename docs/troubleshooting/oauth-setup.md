# Google OAuth Configuration Guide

## Security Assessment: Google OAuth 400 Error Fix

**Status:** CRITICAL - Configuration Required
**Priority:** HIGH - Blocking user authentication
**Risk Level:** MEDIUM - No security vulnerabilities, configuration missing

## Problem Analysis

The Google OAuth 400 Bad Request error indicates missing configuration in either:
1. Google Cloud Console OAuth application
2. Supabase Authentication settings
3. Environment variables

## Required Configuration Steps

### Step 1: Google Cloud Console Setup

1. **Navigate to Google Cloud Console:**
   - Go to https://console.cloud.google.com/
   - Select or create your project

2. **Enable Google+ API:**
   ```bash
   # Navigate to: APIs & Services > Library
   # Search for "Google+ API" and enable it
   ```

3. **Create OAuth 2.0 Credentials:**
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Application type: "Web application"
   - Name: "Affilitics Web App"

4. **Configure Authorized Redirect URIs:**
   ```
   Development:
   http://localhost:3000/api/auth/callback
   
   Production:
   https://yourdomain.com/api/auth/callback
   https://your-vercel-app.vercel.app/api/auth/callback
   
   Supabase Auth Callback:
   https://qpwtdzvmzhlnxighhkpi.supabase.co/auth/v1/callback
   ```

5. **Note down credentials:**
   - Client ID: `xxx.googleusercontent.com`
   - Client Secret: `GOCSPX-xxx`

### Step 2: Supabase Dashboard Configuration

1. **Navigate to Supabase Dashboard:**
   - Go to https://supabase.com/dashboard
   - Select your project: `qpwtdzvmzhlnxighhkpi`

2. **Configure Google OAuth Provider:**
   ```bash
   # Go to: Authentication > Providers > Google
   # Enable Google provider
   # Add Google OAuth credentials:
   ```
   - Client ID: `[Your Google Client ID]`
   - Client Secret: `[Your Google Client Secret]`

3. **Configure Site URL:**
   ```
   Development: http://localhost:3000
   Production: https://yourdomain.com
   ```

4. **Configure Additional Redirect URLs:**
   ```
   http://localhost:3000/**
   https://yourdomain.com/**
   ```

### Step 3: Environment Variables

Update your `.env.local` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://qpwtdzvmzhlnxighhkpi.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_JWT_SECRET="your-jwt-secret"

# Next.js
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```

**Critical:** Get the `SUPABASE_JWT_SECRET` from:
- Supabase Dashboard > Settings > API > JWT Secret

### Step 4: Test OAuth Flow

1. **Local Testing:**
   ```bash
   npm run dev
   # Navigate to http://localhost:3000/auth/login
   # Click "Sign in with Google"
   ```

2. **Expected Flow:**
   ```
   1. User clicks "Sign in with Google"
   2. Redirects to Google OAuth consent screen
   3. User authorizes application
   4. Google redirects to: /api/auth/callback?code=xxx
   5. Supabase exchanges code for session
   6. User redirected to dashboard
   ```

## Security Considerations

### Required Redirect URIs

**Development:**
- `http://localhost:3000/api/auth/callback`
- `https://qpwtdzvmzhlnxighhkpi.supabase.co/auth/v1/callback`

**Production:**
- `https://yourdomain.com/api/auth/callback`
- `https://qpwtdzvmzhlnxighhkpi.supabase.co/auth/v1/callback`
- `https://your-vercel-app.vercel.app/api/auth/callback`

### Security Best Practices

1. **Domain Validation:**
   - Only add trusted domains to redirect URIs
   - Use HTTPS in production
   - Validate all callback URLs

2. **Environment Variables:**
   - Never commit secrets to version control
   - Use different Google OAuth apps for dev/prod
   - Rotate secrets regularly

3. **Error Handling:**
   - Log OAuth errors for debugging
   - Provide user-friendly error messages
   - Implement fallback authentication

## Troubleshooting

### Common Issues

1. **"400 Bad Request" Error:**
   - Check Google OAuth app is enabled
   - Verify redirect URIs match exactly
   - Ensure Google+ API is enabled

2. **"Redirect URI mismatch":**
   - Add all possible callback URLs
   - Check for trailing slashes
   - Verify protocol (http vs https)

3. **"Invalid client" Error:**
   - Verify Client ID in Supabase
   - Check Client Secret is correct
   - Ensure OAuth app is active

### Debug Steps

1. **Check Console Logs:**
   ```bash
   # Browser console for client errors
   # Server logs for callback errors
   ```

2. **Verify URLs:**
   ```bash
   # Expected callback URL:
   https://qpwtdzvmzhlnxighhkpi.supabase.co/auth/v1/authorize?provider=google&redirect_to=http://localhost:3000/api/auth/callback
   ```

3. **Test Supabase Auth:**
   ```javascript
   // Test in browser console:
   const { data, error } = await supabase.auth.signInWithOAuth({
     provider: 'google',
     options: {
       redirectTo: 'http://localhost:3000/api/auth/callback'
     }
   })
   console.log('OAuth Result:', { data, error })
   ```

## Implementation Status

✅ **Completed:**
- PKCE flow implementation
- Secure session management  
- Rate limiting and security headers
- Error handling improvements
- Environment variable updates

⚠️ **Required Actions:**
1. Configure Google Cloud Console OAuth app
2. Add Google OAuth provider in Supabase dashboard
3. Update environment variables with real credentials
4. Test OAuth flow end-to-end

## Monitoring & Alerting

Monitor these metrics post-deployment:
- OAuth success/failure rates
- Authentication latency
- Error patterns in logs
- User flow abandonment

## Compliance Notes

- GDPR: OAuth consent screen configured
- SOC2: Audit logging enabled
- Security: PKCE flow prevents CSRF attacks