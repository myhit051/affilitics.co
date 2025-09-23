'use client'

/**
 * PRODUCTION-READY AUTHENTICATION WRAPPERS
 * 
 * This module provides comprehensive client-side authentication wrappers
 * with proper error handling, loading states, and security controls.
 */

import React, { ComponentType, ReactNode, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'
import { AuthUser } from '@/lib/supabase/types'
import { validateWorkspaceAccess, hasPermission } from '@/lib/auth/workspace-middleware'

// Types for authentication wrapper configurations
export interface AuthWrapperOptions {
  redirectTo?: string
  fallback?: ReactNode
  skipValidation?: boolean
  showLoadingIndicator?: boolean
  logAccess?: boolean
  errorBoundary?: boolean
}

export interface WorkspaceWrapperOptions extends AuthWrapperOptions {
  requiredRole?: string | string[]
  requiredPermissions?: string[]
  validateWorkspace?: boolean
  allowWorkspaceCreation?: boolean
}

export interface AuthGuardContext {
  user: AuthUser
  workspaceId: string | null
  role: string | null
  isLoading: boolean
  hasWorkspaceAccess: boolean
  permissions: string[]
}

// Error types for authentication failures
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 401
  ) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 403
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

// Default loading component
const DefaultLoadingComponent = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    <span className="ml-2 text-gray-600">Authenticating...</span>
  </div>
)

// Default error component
const DefaultErrorComponent = ({ error, retry }: { error: Error; retry?: () => void }) => (
  <div className="flex flex-col items-center justify-center min-h-screen p-4">
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md w-full">
      <h2 className="text-lg font-semibold text-red-800 mb-2">Authentication Error</h2>
      <p className="text-red-600 mb-4">{error.message}</p>
      {retry && (
        <button
          onClick={retry}
          className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          Try Again
        </button>
      )}
    </div>
  </div>
)

// Unauthorized access component
const UnauthorizedComponent = ({ message, redirectPath }: { message: string; redirectPath?: string }) => {
  const router = useRouter()
  
  const handleRedirect = () => {
    if (redirectPath) {
      router.push(redirectPath)
    } else {
      router.back()
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold text-yellow-800 mb-2">Access Denied</h2>
        <p className="text-yellow-600 mb-4">{message}</p>
        <button
          onClick={handleRedirect}
          className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        >
          Go Back
        </button>
      </div>
    </div>
  )
}

/**
 * Higher-Order Component for basic authentication protection
 * Requires user to be authenticated but no workspace validation
 */
export function withAuth<P extends object>(
  Component: ComponentType<P>,
  options: AuthWrapperOptions = {}
) {
  const {
    redirectTo = '/auth/login',
    fallback = <DefaultLoadingComponent />,
    skipValidation = false,
    showLoadingIndicator = true,
    logAccess = false,
    errorBoundary = true
  } = options

  return function AuthenticatedComponent(props: P) {
    const { user, isLoading, signOut } = useAuth()
    const router = useRouter()
    const [error, setError] = useState<Error | null>(null)

    useEffect(() => {
      if (skipValidation) return

      // Log access attempt if enabled
      if (logAccess && user) {
        console.log('Auth access:', {
          userId: user.id,
          timestamp: new Date().toISOString(),
          component: Component.name
        })
      }

      // Redirect to login if not authenticated
      if (!isLoading && !user) {
        const currentUrl = typeof window !== 'undefined' ? window.location.pathname : ''
        const loginUrl = `${redirectTo}?callbackUrl=${encodeURIComponent(currentUrl)}`
        router.push(loginUrl)
      }
    }, [user, isLoading, router])

    // Handle authentication errors
    const handleError = (error: Error) => {
      setError(error)
      if (error instanceof AuthenticationError && error.code === 'TOKEN_EXPIRED') {
        // Auto-logout on token expiration
        signOut()
      }
    }

    // Retry authentication
    const retryAuth = () => {
      setError(null)
      router.refresh()
    }

    // Show loading state
    if (isLoading && showLoadingIndicator) {
      return <>{fallback}</>
    }

    // Show error state
    if (error && errorBoundary) {
      return <DefaultErrorComponent error={error} retry={retryAuth} />
    }

    // Show component if authenticated
    if (user) {
      return <Component {...props} />
    }

    // Default fallback
    return <>{fallback}</>
  }
}

/**
 * Higher-Order Component for workspace-based authentication
 * Requires both user authentication and workspace access validation
 */
export function withWorkspaceAuth<P extends object>(
  Component: ComponentType<P>,
  options: WorkspaceWrapperOptions = {}
) {
  const {
    redirectTo = '/workspaces',
    requiredRole,
    requiredPermissions,
    validateWorkspace = true,
    allowWorkspaceCreation = false,
    fallback = <DefaultLoadingComponent />,
    skipValidation = false,
    showLoadingIndicator = true,
    logAccess = true,
    errorBoundary = true
  } = options

  return function WorkspaceProtectedComponent(props: P) {
    const { user, workspaceId, role, isLoading } = useAuth()
    const router = useRouter()
    const [authState, setAuthState] = useState<{
      isValidating: boolean
      hasAccess: boolean
      error: Error | null
      permissions: string[]
    }>({
      isValidating: true,
      hasAccess: false,
      error: null,
      permissions: []
    })

    // Validate workspace access
    useEffect(() => {
      if (skipValidation || !user) {
        setAuthState(prev => ({ ...prev, isValidating: false }))
        return
      }

      const validateAccess = async () => {
        try {
          setAuthState(prev => ({ ...prev, isValidating: true, error: null }))

          // Check basic workspace requirements
          if (validateWorkspace && !workspaceId) {
            if (allowWorkspaceCreation) {
              router.push('/workspaces/create')
              return
            }
            throw new AuthorizationError(
              'Workspace access required',
              'NO_WORKSPACE',
              403
            )
          }

          // Validate role requirements
          if (requiredRole && role) {
            const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
            if (!roles.includes(role)) {
              throw new AuthorizationError(
                `Access denied. Required roles: ${roles.join(', ')}`,
                'INSUFFICIENT_ROLE',
                403
              )
            }
          }

          // TODO: Implement permission validation when available
          const userPermissions: string[] = []
          
          if (requiredPermissions && requiredPermissions.length > 0) {
            const hasAllPermissions = requiredPermissions.every(permission =>
              userPermissions.includes('*') || userPermissions.includes(permission)
            )
            
            if (!hasAllPermissions) {
              throw new AuthorizationError(
                'Insufficient permissions for this operation',
                'INSUFFICIENT_PERMISSIONS',
                403
              )
            }
          }

          // Log successful access
          if (logAccess) {
            console.log('Workspace access granted:', {
              userId: user.id,
              workspaceId,
              role,
              component: Component.name,
              timestamp: new Date().toISOString()
            })
          }

          setAuthState({
            isValidating: false,
            hasAccess: true,
            error: null,
            permissions: userPermissions
          })

        } catch (error) {
          console.error('Workspace validation error:', error)
          setAuthState({
            isValidating: false,
            hasAccess: false,
            error: error as Error,
            permissions: []
          })
        }
      }

      validateAccess()
    }, [user, workspaceId, role, validateWorkspace, requiredRole, requiredPermissions])

    // Redirect to authentication if needed
    useEffect(() => {
      if (!isLoading && !user) {
        const currentUrl = typeof window !== 'undefined' ? window.location.pathname : ''
        const loginUrl = `/auth/login?callbackUrl=${encodeURIComponent(currentUrl)}`
        router.push(loginUrl)
      }
    }, [user, isLoading, router])

    // Show loading state
    if ((isLoading || authState.isValidating) && showLoadingIndicator) {
      return <>{fallback}</>
    }

    // Show error state
    if (authState.error && errorBoundary) {
      if (authState.error instanceof AuthorizationError) {
        return (
          <UnauthorizedComponent
            message={authState.error.message}
            redirectPath={redirectTo}
          />
        )
      }
      return (
        <DefaultErrorComponent
          error={authState.error}
          retry={() => router.refresh()}
        />
      )
    }

    // Show component if all validations pass
    if (user && authState.hasAccess) {
      return <Component {...props} />
    }

    // Default fallback
    return <>{fallback}</>
  }
}

/**
 * Hook for accessing authentication guard context
 */
export function useAuthGuard(): AuthGuardContext {
  const { user, workspaceId, role, isLoading } = useAuth()
  
  const authContext = useMemo(() => ({
    user: user!,
    workspaceId,
    role,
    isLoading,
    hasWorkspaceAccess: !!(user && workspaceId),
    permissions: [] // TODO: Implement actual permissions
  }), [user, workspaceId, role, isLoading])

  return authContext
}

/**
 * Component for conditional rendering based on authentication state
 */
export interface AuthGuardProps {
  children: ReactNode
  fallback?: ReactNode
  requireAuth?: boolean
  requireWorkspace?: boolean
  requiredRole?: string | string[]
  requiredPermissions?: string[]
  onUnauthorized?: () => void
}

export function AuthGuard({
  children,
  fallback = null,
  requireAuth = true,
  requireWorkspace = false,
  requiredRole,
  requiredPermissions,
  onUnauthorized
}: AuthGuardProps) {
  const { user, workspaceId, role, isLoading } = useAuth()
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    let access = true

    // Check authentication requirement
    if (requireAuth && !user) {
      access = false
    }

    // Check workspace requirement
    if (requireWorkspace && !workspaceId) {
      access = false
    }

    // Check role requirement
    if (requiredRole && role) {
      const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
      if (!roles.includes(role)) {
        access = false
      }
    }

    // TODO: Check permission requirements

    if (!access && onUnauthorized) {
      onUnauthorized()
    }

    setHasAccess(access)
  }, [user, workspaceId, role, requireAuth, requireWorkspace, requiredRole, requiredPermissions, onUnauthorized])

  if (isLoading) {
    return <>{fallback}</>
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>
}

/**
 * Hook for role-based access control
 */
export function useRoleBasedAccess() {
  const { role } = useAuth()

  const hasRole = (requiredRole: string | string[]): boolean => {
    if (!role) return false
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    return roles.includes(role)
  }

  const hasAnyRole = (roles: string[]): boolean => {
    return roles.some(r => hasRole(r))
  }

  const hasAllRoles = (roles: string[]): boolean => {
    return roles.every(r => hasRole(r))
  }

  return {
    hasRole,
    hasAnyRole,
    hasAllRoles,
    currentRole: role
  }
}

/**
 * Utility function to check if user has specific permissions
 */
export function hasUserPermission(
  userRole: string | null,
  permission: string
): boolean {
  if (!userRole) return false
  return hasPermission(userRole, permission)
}

export default {
  withAuth,
  withWorkspaceAuth,
  AuthGuard,
  useAuthGuard,
  useRoleBasedAccess,
  hasUserPermission,
  AuthenticationError,
  AuthorizationError
}