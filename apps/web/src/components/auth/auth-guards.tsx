'use client'

/**
 * CLIENT-SIDE AUTHENTICATION GUARDS
 * 
 * This module provides reusable authentication guard components
 * for protecting UI elements and pages on the client side.
 */

import React, { ReactNode, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'
import { Loader2, Shield, AlertTriangle, Lock } from 'lucide-react'

// Types for guard configurations
export interface AuthGuardProps {
  children: ReactNode
  fallback?: ReactNode
  loadingComponent?: ReactNode
  errorComponent?: ReactNode
  redirectTo?: string
  requireAuth?: boolean
  requireWorkspace?: boolean
  requiredRole?: string | string[]
  requiredPermissions?: string[]
  showFallback?: boolean
  onAccessDenied?: (reason: string) => void
  onAuthenticated?: () => void
}

export interface ProtectedContentProps {
  children: ReactNode
  roles?: string | string[]
  permissions?: string[]
  fallback?: ReactNode
  hideOnDenied?: boolean
  showReason?: boolean
}

export interface WorkspaceGuardProps {
  children: ReactNode
  workspaceId?: string
  requiredRole?: string | string[]
  fallback?: ReactNode
  redirectTo?: string
  validateAccess?: boolean
}

// Access denial reasons
export type AccessDenialReason = 
  | 'not_authenticated'
  | 'no_workspace'
  | 'insufficient_role'
  | 'insufficient_permissions'
  | 'workspace_not_found'
  | 'loading'
  | 'error'

// Default components
const DefaultLoadingComponent = () => (
  <div className="flex items-center justify-center p-8">
    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
    <span className="ml-2 text-gray-600">Verifying access...</span>
  </div>
)

const DefaultErrorComponent = ({ message, retry }: { message: string; retry?: () => void }) => (
  <div className="flex flex-col items-center justify-center p-8 bg-red-50 border border-red-200 rounded-lg">
    <AlertTriangle className="h-8 w-8 text-red-600 mb-2" />
    <h3 className="text-lg font-semibold text-red-800 mb-1">Authentication Error</h3>
    <p className="text-red-600 text-center mb-4">{message}</p>
    {retry && (
      <button
        onClick={retry}
        className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
      >
        Try Again
      </button>
    )}
  </div>
)

const DefaultAccessDeniedComponent = ({ 
  reason, 
  message, 
  showLogin = true 
}: { 
  reason: AccessDenialReason
  message: string
  showLogin?: boolean 
}) => {
  const router = useRouter()

  const handleAction = () => {
    switch (reason) {
      case 'not_authenticated':
        if (showLogin) {
          const currentUrl = typeof window !== 'undefined' ? window.location.pathname : ''
          router.push(`/auth/login?callbackUrl=${encodeURIComponent(currentUrl)}`)
        }
        break
      case 'no_workspace':
        router.push('/workspaces')
        break
      default:
        router.back()
        break
    }
  }

  const getIcon = () => {
    switch (reason) {
      case 'not_authenticated':
        return <Shield className="h-8 w-8 text-amber-600" />
      case 'insufficient_role':
      case 'insufficient_permissions':
        return <Lock className="h-8 w-8 text-red-600" />
      default:
        return <AlertTriangle className="h-8 w-8 text-gray-600" />
    }
  }

  const getActionText = () => {
    switch (reason) {
      case 'not_authenticated':
        return 'Sign In'
      case 'no_workspace':
        return 'Select Workspace'
      default:
        return 'Go Back'
    }
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-amber-50 border border-amber-200 rounded-lg">
      {getIcon()}
      <h3 className="text-lg font-semibold text-gray-800 mb-1 mt-2">Access Denied</h3>
      <p className="text-gray-600 text-center mb-4">{message}</p>
      <button
        onClick={handleAction}
        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {getActionText()}
      </button>
    </div>
  )
}

/**
 * Main authentication guard component
 */
export function AuthGuard({
  children,
  fallback,
  loadingComponent = <DefaultLoadingComponent />,
  errorComponent,
  redirectTo,
  requireAuth = true,
  requireWorkspace = false,
  requiredRole,
  requiredPermissions,
  showFallback = true,
  onAccessDenied,
  onAuthenticated
}: AuthGuardProps) {
  const { user, workspaceId, role, isLoading } = useAuth()
  const router = useRouter()
  const [hasAccess, setHasAccess] = useState(false)
  const [denialReason, setDenialReason] = useState<AccessDenialReason | null>(null)
  const [denialMessage, setDenialMessage] = useState('')

  // Memoized access validation
  const accessValidation = useMemo(() => {
    if (isLoading) {
      return { hasAccess: false, reason: 'loading' as AccessDenialReason, message: 'Checking authentication...' }
    }

    // Check authentication requirement
    if (requireAuth && !user) {
      return { 
        hasAccess: false, 
        reason: 'not_authenticated' as AccessDenialReason, 
        message: 'You must be signed in to access this content.' 
      }
    }

    // Check workspace requirement
    if (requireWorkspace && !workspaceId) {
      return { 
        hasAccess: false, 
        reason: 'no_workspace' as AccessDenialReason, 
        message: 'You must select a workspace to access this content.' 
      }
    }

    // Check role requirement
    if (requiredRole && role) {
      const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
      if (!roles.includes(role)) {
        return { 
          hasAccess: false, 
          reason: 'insufficient_role' as AccessDenialReason, 
          message: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${role}` 
        }
      }
    }

    // TODO: Check permission requirements when permission system is implemented
    if (requiredPermissions && requiredPermissions.length > 0) {
      // For now, assume permissions are checked elsewhere
      // In future, implement actual permission checking
    }

    return { hasAccess: true, reason: null, message: '' }
  }, [user, workspaceId, role, isLoading, requireAuth, requireWorkspace, requiredRole, requiredPermissions])

  // Update state based on validation
  useEffect(() => {
    setHasAccess(accessValidation.hasAccess)
    setDenialReason(accessValidation.reason)
    setDenialMessage(accessValidation.message)

    if (accessValidation.hasAccess && onAuthenticated) {
      onAuthenticated()
    } else if (!accessValidation.hasAccess && accessValidation.reason !== 'loading' && onAccessDenied) {
      onAccessDenied(accessValidation.message)
    }
  }, [accessValidation, onAuthenticated, onAccessDenied])

  // Handle redirects
  useEffect(() => {
    if (!hasAccess && denialReason && redirectTo && denialReason !== 'loading') {
      const currentUrl = typeof window !== 'undefined' ? window.location.pathname : ''
      const redirectUrl = denialReason === 'not_authenticated' 
        ? `${redirectTo}?callbackUrl=${encodeURIComponent(currentUrl)}`
        : redirectTo
      
      router.push(redirectUrl)
    }
  }, [hasAccess, denialReason, redirectTo, router])

  // Render loading state
  if (denialReason === 'loading') {
    return <>{loadingComponent}</>
  }

  // Render access denied state
  if (!hasAccess && denialReason) {
    if (!showFallback) {
      return null
    }

    if (fallback) {
      return <>{fallback}</>
    }

    if (errorComponent) {
      return <>{errorComponent}</>
    }

    return (
      <DefaultAccessDeniedComponent
        reason={denialReason}
        message={denialMessage}
        showLogin={!redirectTo}
      />
    )
  }

  // Render protected content
  return hasAccess ? <>{children}</> : null
}

/**
 * Component for conditional content based on roles/permissions
 */
export function ProtectedContent({
  children,
  roles,
  permissions,
  fallback = null,
  hideOnDenied = false,
  showReason = false
}: ProtectedContentProps) {
  const { user, role } = useAuth()
  const [hasAccess, setHasAccess] = useState(false)
  const [denialReason, setDenialReason] = useState('')

  useEffect(() => {
    let access = true
    let reason = ''

    // Check if user is authenticated
    if (!user) {
      access = false
      reason = 'Authentication required'
    }

    // Check role requirements
    if (roles && role) {
      const requiredRoles = Array.isArray(roles) ? roles : [roles]
      if (!requiredRoles.includes(role)) {
        access = false
        reason = `Required role: ${requiredRoles.join(' or ')}`
      }
    }

    // TODO: Check permission requirements
    if (permissions && permissions.length > 0) {
      // Implement permission checking when system is available
    }

    setHasAccess(access)
    setDenialReason(reason)
  }, [user, role, roles, permissions])

  if (!hasAccess) {
    if (hideOnDenied) {
      return null
    }

    if (fallback) {
      return <>{fallback}</>
    }

    if (showReason) {
      return (
        <div className="text-sm text-gray-500 italic">
          {denialReason || 'Access denied'}
        </div>
      )
    }

    return null
  }

  return <>{children}</>
}

/**
 * Workspace-specific guard component
 */
export function WorkspaceGuard({
  children,
  workspaceId: requiredWorkspaceId,
  requiredRole,
  fallback,
  redirectTo = '/workspaces',
  validateAccess = true
}: WorkspaceGuardProps) {
  const { user, workspaceId, role } = useAuth()
  const router = useRouter()
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    if (!validateAccess) {
      setHasAccess(true)
      return
    }

    let access = true

    // Check authentication
    if (!user) {
      access = false
    }

    // Check workspace ID if specified
    if (requiredWorkspaceId && workspaceId !== requiredWorkspaceId) {
      access = false
    }

    // Check general workspace access
    if (!requiredWorkspaceId && !workspaceId) {
      access = false
    }

    // Check role requirements
    if (requiredRole && role) {
      const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
      if (!roles.includes(role)) {
        access = false
      }
    }

    setHasAccess(access)

    // Redirect if no access
    if (!access && user) {
      router.push(redirectTo)
    }
  }, [user, workspaceId, role, requiredWorkspaceId, requiredRole, validateAccess, router, redirectTo])

  if (!hasAccess) {
    return fallback ? <>{fallback}</> : null
  }

  return <>{children}</>
}

/**
 * Hook for programmatic access checking
 */
export function useAccessControl() {
  const { user, workspaceId, role } = useAuth()

  const hasRole = (requiredRole: string | string[]): boolean => {
    if (!role) return false
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    return roles.includes(role)
  }

  const hasWorkspaceAccess = (targetWorkspaceId?: string): boolean => {
    if (!user) return false
    if (targetWorkspaceId && workspaceId !== targetWorkspaceId) return false
    return !!workspaceId
  }

  const hasPermission = (permission: string): boolean => {
    // TODO: Implement actual permission checking
    return true // Placeholder
  }

  const canAccess = (requirements: {
    requireAuth?: boolean
    requireWorkspace?: boolean
    requiredRole?: string | string[]
    requiredPermissions?: string[]
    workspaceId?: string
  }): boolean => {
    const {
      requireAuth = false,
      requireWorkspace = false,
      requiredRole,
      requiredPermissions,
      workspaceId: targetWorkspaceId
    } = requirements

    if (requireAuth && !user) return false
    if (requireWorkspace && !hasWorkspaceAccess(targetWorkspaceId)) return false
    if (requiredRole && !hasRole(requiredRole)) return false
    if (requiredPermissions && !requiredPermissions.every(hasPermission)) return false

    return true
  }

  return {
    user,
    workspaceId,
    role,
    hasRole,
    hasWorkspaceAccess,
    hasPermission,
    canAccess,
    isAuthenticated: !!user,
    hasWorkspace: !!workspaceId
  }
}

/**
 * HOC for protecting entire pages
 */
export function withPageAuth<P extends object>(
  Component: React.ComponentType<P>,
  guardProps: Omit<AuthGuardProps, 'children'>
) {
  return function ProtectedPage(props: P) {
    return (
      <AuthGuard {...guardProps}>
        <Component {...props} />
      </AuthGuard>
    )
  }
}

export default {
  AuthGuard,
  ProtectedContent,
  WorkspaceGuard,
  useAccessControl,
  withPageAuth
}