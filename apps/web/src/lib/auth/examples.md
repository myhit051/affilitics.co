# Authentication System Usage Examples

This document provides comprehensive examples of how to use the production-ready authentication system.

## Table of Contents

1. [Basic Authentication Setup](#basic-authentication-setup)
2. [API Route Protection](#api-route-protection)
3. [Component Guards](#component-guards)
4. [Workspace Management](#workspace-management)
5. [Security Monitoring](#security-monitoring)
6. [Session Management](#session-management)
7. [Advanced Usage](#advanced-usage)

## Basic Authentication Setup

### 1. Setting up the Auth Provider

First, wrap your app with the authentication provider:

```tsx
// app/layout.tsx or pages/_app.tsx
import { AuthProvider } from '@/components/auth/auth-provider'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
```

### 2. Using Authentication in Components

```tsx
// components/user-profile.tsx
import { useAuth } from '@/components/auth/auth-provider'
import { AuthGuard } from '@/lib/auth'

export default function UserProfile() {
  const { user, workspaceId, role, signOut } = useAuth()

  return (
    <AuthGuard requireAuth>
      <div>
        <h1>Welcome, {user?.email}</h1>
        <p>Current workspace: {workspaceId}</p>
        <p>Your role: {role}</p>
        <button onClick={() => signOut()}>Sign Out</button>
      </div>
    </AuthGuard>
  )
}
```

## API Route Protection

### 1. Basic API Route Protection

```typescript
// app/api/profile/route.ts
import { withApiAuth, createSuccessResponse } from '@/lib/auth'

export const GET = withApiAuth(async (request, { user }) => {
  // User is guaranteed to be authenticated here
  const profile = {
    id: user.id,
    email: user.email,
    lastLogin: new Date().toISOString()
  }
  
  return createSuccessResponse(profile)
})
```

### 2. Workspace-Protected API Route

```typescript
// app/api/workspace/[id]/analytics/route.ts
import { withApiWorkspaceAuth, createSuccessResponse, createErrorResponse } from '@/lib/auth'

export const GET = withApiWorkspaceAuth(async (request, { user, workspaceId, userRole, permissions }) => {
  // User is authenticated and has workspace access
  
  if (!permissions.includes('analytics:read') && !permissions.includes('*')) {
    return createErrorResponse('Insufficient permissions', 403, 'PERMISSION_DENIED')
  }

  const analytics = await getAnalyticsData(workspaceId)
  
  return createSuccessResponse(analytics, 200, {
    workspace: workspaceId,
    accessedBy: user.id
  })
}, {
  requiredPermissions: ['analytics:read'],
  requireCSRF: true
})
```

### 3. Admin-Only API Route

```typescript
// app/api/admin/users/route.ts
import { withAdminAuth, createSuccessResponse } from '@/lib/auth'

export const GET = withAdminAuth(async (request, { user, workspaceId }) => {
  // Only workspace admins and owners can access this
  const users = await getWorkspaceUsers(workspaceId)
  
  return createSuccessResponse(users)
})

export const DELETE = withAdminAuth(async (request, { user, workspaceId }) => {
  const { userId } = await request.json()
  
  // Additional security: prevent self-deletion
  if (userId === user.id) {
    return createErrorResponse('Cannot delete your own account', 400)
  }
  
  await deleteUser(userId, workspaceId)
  
  return createSuccessResponse({ deleted: true })
})
```

### 4. Custom API Protection

```typescript
// app/api/sensitive-operation/route.ts
import { withApiProtection, createSuccessResponse } from '@/lib/auth'

export const POST = withApiProtection(async (request, { user, workspaceId, userRole }) => {
  const data = await request.json()
  
  // Custom business logic
  const result = await performSensitiveOperation(data, user.id, workspaceId)
  
  return createSuccessResponse(result)
}, {
  requireAuth: true,
  requireWorkspace: true,
  requireCSRF: true,
  allowedRoles: ['admin', 'owner'],
  rateLimit: {
    requests: 10,
    windowMs: 60 * 1000 // 1 minute
  },
  logRequests: true,
  enableMetrics: true
})
```

## Component Guards

### 1. Page-Level Protection

```tsx
// app/dashboard/page.tsx
import { withPageAuth } from '@/lib/auth'
import DashboardContent from './dashboard-content'

function DashboardPage() {
  return <DashboardContent />
}

export default withPageAuth(DashboardPage, {
  requireAuth: true,
  requireWorkspace: true,
  redirectTo: '/workspaces'
})
```

### 2. Conditional Content Rendering

```tsx
// components/admin-panel.tsx
import { ProtectedContent, useAccessControl } from '@/lib/auth'

export default function AdminPanel() {
  const { hasRole, canAccess } = useAccessControl()

  return (
    <div>
      <h1>Dashboard</h1>
      
      {/* Show to all authenticated users */}
      <ProtectedContent>
        <p>Welcome to your dashboard!</p>
      </ProtectedContent>
      
      {/* Show only to admins and owners */}
      <ProtectedContent roles={['admin', 'owner']}>
        <button>Manage Users</button>
      </ProtectedContent>
      
      {/* Show only to owners */}
      <ProtectedContent 
        roles="owner"
        fallback={<p>Owner access required</p>}
      >
        <button>Delete Workspace</button>
      </ProtectedContent>
      
      {/* Programmatic access control */}
      {canAccess({ requiredRole: 'admin' }) && (
        <div>Admin-only content</div>
      )}
    </div>
  )
}
```

### 3. Workspace-Specific Guards

```tsx
// components/workspace-settings.tsx
import { WorkspaceGuard, useAuth } from '@/lib/auth'

export default function WorkspaceSettings() {
  const { workspaceId } = useAuth()

  return (
    <WorkspaceGuard
      workspaceId={workspaceId}
      requiredRole={['admin', 'owner']}
      fallback={<div>You need admin access to view settings</div>}
    >
      <div>
        <h1>Workspace Settings</h1>
        {/* Settings content */}
      </div>
    </WorkspaceGuard>
  )
}
```

### 4. Higher-Order Component Protection

```tsx
// components/protected-feature.tsx
import { withAuth, withWorkspaceAuth } from '@/lib/auth'

// Basic auth protection
const ProtectedComponent = withAuth(({ data }) => {
  return <div>Protected content: {data}</div>
})

// Workspace auth protection
const WorkspaceProtectedComponent = withWorkspaceAuth(({ data }) => {
  return <div>Workspace content: {data}</div>
}, {
  requiredRole: 'member',
  requireWorkspace: true
})

export { ProtectedComponent, WorkspaceProtectedComponent }
```

## Workspace Management

### 1. Creating and Managing Workspaces

```typescript
// services/workspace-service.ts
import { 
  createWorkspace, 
  getUserWorkspaces, 
  inviteUserToWorkspace,
  updateMemberRole,
  removeMemberFromWorkspace 
} from '@/lib/auth'

export class WorkspaceService {
  async createNewWorkspace(userId: string, name: string) {
    const result = await createWorkspace(userId, {
      name,
      plan: 'free'
    })
    
    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to create workspace')
    }
    
    return result.data
  }
  
  async getMyWorkspaces(userId: string) {
    const result = await getUserWorkspaces(userId)
    
    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to get workspaces')
    }
    
    return result.data || []
  }
  
  async inviteMember(inviterId: string, workspaceId: string, email: string, role: 'admin' | 'member' | 'viewer') {
    const result = await inviteUserToWorkspace(inviterId, workspaceId, email, role)
    
    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to invite user')
    }
    
    return result.data
  }
}
```

### 2. Workspace Context Hook

```tsx
// hooks/use-workspace.ts
import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { getUserWorkspaces, validateWorkspaceAccess } from '@/lib/auth'

export function useWorkspace() {
  const { user, workspaceId } = useAuth()
  const [workspaces, setWorkspaces] = useState([])
  const [currentWorkspace, setCurrentWorkspace] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const loadWorkspaces = async () => {
      try {
        const result = await getUserWorkspaces(user.id)
        if (result.success) {
          setWorkspaces(result.data || [])
        }
      } catch (error) {
        console.error('Error loading workspaces:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadWorkspaces()
  }, [user])

  useEffect(() => {
    if (!workspaceId || !user) return

    const validateAccess = async () => {
      try {
        const result = await validateWorkspaceAccess(user.id, workspaceId)
        if (result.success) {
          setCurrentWorkspace(result.data?.workspace || null)
        }
      } catch (error) {
        console.error('Error validating workspace access:', error)
      }
    }

    validateAccess()
  }, [user, workspaceId])

  return {
    workspaces,
    currentWorkspace,
    isLoading,
    hasWorkspaceAccess: !!currentWorkspace
  }
}
```

## Security Monitoring

### 1. Setting up Security Monitoring

```typescript
// lib/security-setup.ts
import { getSecurityMonitor, SecurityLogger } from '@/lib/auth'

export function initializeSecurity() {
  const monitor = getSecurityMonitor()
  
  // Set up alert handlers
  monitor.onAlert((alert) => {
    console.warn('Security Alert:', alert)
    
    // Send to external monitoring service
    if (alert.level === 'critical' || alert.level === 'high') {
      sendToSlack(alert)
      sendToEmail(alert)
    }
  })
  
  // Enable monitoring
  monitor.setEnabled(true)
}

async function sendToSlack(alert) {
  // Implementation for Slack notifications
}

async function sendToEmail(alert) {
  // Implementation for email notifications
}
```

### 2. Custom Security Logging

```typescript
// middleware/security-middleware.ts
import { NextRequest } from 'next/server'
import { SecurityLogger } from '@/lib/auth'

export function logSecurityEvents(request: NextRequest, userId?: string) {
  // Log authentication attempts
  if (request.nextUrl.pathname.startsWith('/auth/')) {
    SecurityLogger.logAuthSuccess(request, userId || 'anonymous')
  }
  
  // Log suspicious activity
  const userAgent = request.headers.get('user-agent') || ''
  if (userAgent.includes('bot') || userAgent.includes('crawler')) {
    SecurityLogger.logSuspiciousActivity(request, 'bot_detected', userId)
  }
  
  // Log admin actions
  if (request.nextUrl.pathname.startsWith('/api/admin/')) {
    SecurityLogger.logAdminAction(request, 'api_access', userId || 'unknown')
  }
}
```

## Session Management

### 1. Custom Session Configuration

```typescript
// lib/session-config.ts
import { getSessionManager } from '@/lib/auth'

// Initialize session manager with custom config
const sessionManager = getSessionManager({
  autoRefresh: true,
  refreshThreshold: 5, // Refresh 5 minutes before expiry
  maxRetries: 3,
  enableLogging: true,
  onSessionExpired: () => {
    // Redirect to login
    window.location.href = '/auth/login'
  },
  onSessionRefreshed: (session) => {
    console.log('Session refreshed successfully')
  }
})

export { sessionManager }
```

### 2. Session Monitoring Component

```tsx
// components/session-monitor.tsx
import { useEffect, useState } from 'react'
import { useSessionManager } from '@/lib/auth'

export default function SessionMonitor() {
  const { sessionContext, validateSession, getMetrics } = useSessionManager()
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    const interval = setInterval(async () => {
      const isValid = await validateSession()
      if (!isValid) {
        console.warn('Session validation failed')
      }
      
      // Update metrics
      setMetrics(getMetrics())
    }, 60000) // Check every minute

    return () => clearInterval(interval)
  }, [validateSession, getMetrics])

  if (!sessionContext?.isValid) {
    return <div className="text-red-600">Session expired</div>
  }

  return (
    <div className="text-sm text-gray-500">
      Session expires: {new Date(sessionContext.expiresAt || 0).toLocaleString()}
    </div>
  )
}
```

## Advanced Usage

### 1. Custom Authentication Flow

```typescript
// services/custom-auth-service.ts
import { 
  validateEmail, 
  validatePassword, 
  checkRateLimit,
  sanitizeAuthInput,
  getSecurityMonitor 
} from '@/lib/auth'

export class CustomAuthService {
  async customSignIn(email: string, password: string, clientInfo: any) {
    const monitor = getSecurityMonitor()
    
    try {
      // Rate limiting
      checkRateLimit(clientInfo.ip, 5, 15 * 60 * 1000)
      
      // Input validation
      const cleanEmail = sanitizeAuthInput(email)
      
      if (!validateEmail(cleanEmail)) {
        throw new Error('Invalid email format')
      }
      
      const passwordValidation = validatePassword(password)
      if (!passwordValidation.isValid) {
        throw new Error('Password does not meet requirements')
      }
      
      // Attempt authentication
      const result = await performAuthentication(cleanEmail, password)
      
      if (result.success) {
        monitor.logEvent('auth_success', null, {
          method: 'email_password',
          ip: clientInfo.ip
        }, result.user.id)
      } else {
        monitor.logEvent('auth_failure', null, {
          method: 'email_password',
          reason: result.error,
          attempted_email: cleanEmail,
          ip: clientInfo.ip
        })
      }
      
      return result
      
    } catch (error) {
      monitor.logEvent('auth_failure', null, {
        method: 'email_password',
        error: error.message,
        ip: clientInfo.ip
      })
      
      throw error
    }
  }
}
```

### 2. Multi-Tenant Workspace Switching

```tsx
// components/workspace-switcher.tsx
import { useState } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { getUserWorkspaces, WorkspaceClientUtils } from '@/lib/auth'

export default function WorkspaceSwitcher() {
  const { user, workspaceId, setWorkspace, clearWorkspace } = useAuth()
  const [workspaces, setWorkspaces] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const loadWorkspaces = async () => {
    if (!user) return
    
    setIsLoading(true)
    try {
      const result = await getUserWorkspaces(user.id)
      if (result.success) {
        setWorkspaces(result.data || [])
      }
    } catch (error) {
      console.error('Error loading workspaces:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const switchWorkspace = async (workspace) => {
    try {
      // Update client context
      setWorkspace(workspace)
      
      // Update browser storage
      await WorkspaceClientUtils.switchWorkspace(workspace.workspace_id)
      
      // Refresh page to update server context
      window.location.reload()
    } catch (error) {
      console.error('Error switching workspace:', error)
    }
  }

  return (
    <div className="relative">
      <button onClick={loadWorkspaces}>
        {workspaceId || 'Select Workspace'}
      </button>
      
      {workspaces.length > 0 && (
        <div className="absolute top-full left-0 bg-white border rounded shadow-lg">
          {workspaces.map((ws) => (
            <button
              key={ws.workspace_id}
              onClick={() => switchWorkspace(ws)}
              className={`block w-full text-left px-4 py-2 hover:bg-gray-100 ${
                ws.workspace_id === workspaceId ? 'bg-blue-50' : ''
              }`}
            >
              {ws.workspace.name} ({ws.role})
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

### 3. Error Boundary with Auth Context

```tsx
// components/auth-error-boundary.tsx
import React from 'react'
import { useAuth } from '@/components/auth/auth-provider'

interface Props {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>
}

interface State {
  hasError: boolean
  error: Error | null
}

export class AuthErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to security monitoring
    console.error('Auth Error Boundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const Fallback = this.props.fallback || DefaultAuthErrorFallback
      return (
        <Fallback
          error={this.state.error!}
          retry={() => this.setState({ hasError: false, error: null })}
        />
      )
    }

    return this.props.children
  }
}

function DefaultAuthErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">
          Authentication Error
        </h1>
        <p className="text-gray-600 mb-4">{error.message}</p>
        <div className="space-x-4">
          <button onClick={retry} className="btn btn-primary">
            Try Again
          </button>
          <button onClick={() => signOut()} className="btn btn-secondary">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
```

## Best Practices

1. **Always use the appropriate wrapper**: Use `withApiAuth` for API routes, `withClientAuth` for components, and `withPageAuth` for pages.

2. **Implement proper error handling**: Use error boundaries and handle authentication failures gracefully.

3. **Monitor security events**: Set up alerts for suspicious activities and review security logs regularly.

4. **Use principle of least privilege**: Grant users only the minimum permissions they need.

5. **Validate input**: Always sanitize and validate user input, especially in authentication flows.

6. **Implement rate limiting**: Protect against brute force attacks with proper rate limiting.

7. **Log security events**: Keep detailed logs of authentication events for audit purposes.

8. **Use CSRF protection**: Enable CSRF protection for state-changing operations.

9. **Regular security reviews**: Periodically review access controls and security configurations.

10. **Keep sessions secure**: Use proper session management with automatic refresh and secure cookies.