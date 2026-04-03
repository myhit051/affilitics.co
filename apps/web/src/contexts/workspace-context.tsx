"use client"

/**
 * Secure Workspace Context Provider
 * 
 * Security Features:
 * - Server-side workspace validation
 * - JWT-based authentication
 * - Role-based access control
 * - Audit logging for workspace operations
 * - Protection against workspace switching attacks
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

// Security: Define workspace roles with explicit permissions
export const WORKSPACE_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin', 
  MEMBER: 'member',
  VIEWER: 'viewer'
} as const

export type WorkspaceRole = typeof WORKSPACE_ROLES[keyof typeof WORKSPACE_ROLES]

// Security: Define granular permissions for each role
export const WORKSPACE_PERMISSIONS = {
  // Data access permissions
  READ_DATA: 'read_data',
  WRITE_DATA: 'write_data',
  DELETE_DATA: 'delete_data',
  
  // Import permissions
  IMPORT_FILES: 'import_files',
  MANAGE_IMPORTS: 'manage_imports',
  
  // Workspace management
  INVITE_MEMBERS: 'invite_members',
  REMOVE_MEMBERS: 'remove_members',
  CHANGE_SETTINGS: 'change_settings',
  DELETE_WORKSPACE: 'delete_workspace',
  
  // Analytics permissions
  VIEW_ANALYTICS: 'view_analytics',
  EXPORT_DATA: 'export_data'
} as const

export type WorkspacePermission = typeof WORKSPACE_PERMISSIONS[keyof typeof WORKSPACE_PERMISSIONS]

// Security: Role-based permission matrix
const ROLE_PERMISSIONS: Record<WorkspaceRole, WorkspacePermission[]> = {
  [WORKSPACE_ROLES.OWNER]: Object.values(WORKSPACE_PERMISSIONS),
  [WORKSPACE_ROLES.ADMIN]: [
    WORKSPACE_PERMISSIONS.READ_DATA,
    WORKSPACE_PERMISSIONS.WRITE_DATA,
    WORKSPACE_PERMISSIONS.DELETE_DATA,
    WORKSPACE_PERMISSIONS.IMPORT_FILES,
    WORKSPACE_PERMISSIONS.MANAGE_IMPORTS,
    WORKSPACE_PERMISSIONS.INVITE_MEMBERS,
    WORKSPACE_PERMISSIONS.CHANGE_SETTINGS,
    WORKSPACE_PERMISSIONS.VIEW_ANALYTICS,
    WORKSPACE_PERMISSIONS.EXPORT_DATA
  ],
  [WORKSPACE_ROLES.MEMBER]: [
    WORKSPACE_PERMISSIONS.READ_DATA,
    WORKSPACE_PERMISSIONS.WRITE_DATA,
    WORKSPACE_PERMISSIONS.IMPORT_FILES,
    WORKSPACE_PERMISSIONS.VIEW_ANALYTICS,
    WORKSPACE_PERMISSIONS.EXPORT_DATA
  ],
  [WORKSPACE_ROLES.VIEWER]: [
    WORKSPACE_PERMISSIONS.READ_DATA,
    WORKSPACE_PERMISSIONS.VIEW_ANALYTICS
  ]
}

export interface WorkspaceInfo {
  id: string
  name: string
  plan: string
  role: WorkspaceRole
  permissions: WorkspacePermission[]
  memberCount?: number
  createdAt: string
  updatedAt: string
}

export interface WorkspaceContextValue {
  // Current workspace state
  currentWorkspace: WorkspaceInfo | null
  workspaces: WorkspaceInfo[]
  
  // User authentication
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  
  // Security operations
  switchWorkspace: (workspaceId: string) => Promise<boolean>
  refreshWorkspaces: () => Promise<void>
  validateWorkspaceAccess: (workspaceId: string) => Promise<boolean>
  hasPermission: (permission: WorkspacePermission) => boolean
  
  // Error handling
  error: string | null
  clearError: () => void
  
  // Audit logging
  logWorkspaceAction: (action: string, details?: Record<string, any>) => Promise<void>
}

// Security: Create context with null default to force provider usage
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

interface WorkspaceProviderProps {
  children: ReactNode
  initialWorkspaceId?: string
}

export function WorkspaceProvider({ children, initialWorkspaceId }: WorkspaceProviderProps) {
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceInfo | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const supabase = createClient()

  // Security: Clear error state
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Security: Audit logging function
  const logWorkspaceAction = useCallback(async (action: string, details?: Record<string, any>) => {
    if (!user || !currentWorkspace) return
    
    try {
      // Security: Log workspace actions for audit trail
      await fetch('/api/workspace/audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          workspaceId: currentWorkspace.id,
          userId: user.id,
          details: details || {},
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          ipAddress: 'client-side' // Will be replaced server-side
        })
      })
    } catch (error) {
      console.error('Failed to log workspace action:', error)
      // Security: Don't throw here to avoid breaking user operations
    }
  }, [user, currentWorkspace])

  // Security: Validate workspace access with server-side verification
  const validateWorkspaceAccess = useCallback(async (workspaceId: string): Promise<boolean> => {
    if (!user) return false
    
    try {
      const response = await fetch(`/api/workspace/${workspaceId}/validate`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (!response.ok) {
        return false
      }
      
      const data = await response.json()
      return data.hasAccess === true
      
    } catch (error) {
      console.error('Workspace validation error:', error)
      return false
    }
  }, [user])

  // Security: Fetch user workspaces with proper authentication
  const fetchWorkspaces = useCallback(async (): Promise<WorkspaceInfo[]> => {
    if (!user) return []
    
    try {
      // Security: Use Supabase RLS policies for secure data fetching
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select(`
          id,
          role,
          workspace:workspaces!inner(
            id,
            name,
            plan,
            created_at,
            updated_at
          )
        `)
        .eq('user_id', user.id)
      
      if (memberError) {
        console.error('Failed to fetch workspaces:', memberError.message)
        throw new Error(`Failed to fetch workspaces: ${memberError.message}`)
      }
      
      if (!memberData) return []
      
      // Security: Transform data and add permissions based on role
      const workspacesList: WorkspaceInfo[] = memberData.map((member: any) => ({
        id: member.workspace.id,
        name: member.workspace.name,
        plan: member.workspace.plan,
        role: member.role as WorkspaceRole,
        permissions: ROLE_PERMISSIONS[member.role as WorkspaceRole] || [],
        createdAt: member.workspace.created_at,
        updatedAt: member.workspace.updated_at
      }))
      
      return workspacesList
      
    } catch (error) {
      console.error('Error fetching workspaces:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch workspaces')
      return []
    }
  }, [user, supabase])

  // Security: Refresh workspaces list
  const refreshWorkspaces = useCallback(async () => {
    setIsLoading(true)
    try {
      const fetchedWorkspaces = await fetchWorkspaces()
      setWorkspaces(fetchedWorkspaces)
      
      // Security: Validate current workspace is still accessible
      if (currentWorkspace && !fetchedWorkspaces.find(w => w.id === currentWorkspace.id)) {
        setCurrentWorkspace(null)
        await logWorkspaceAction('workspace_access_revoked', { 
          previousWorkspaceId: currentWorkspace.id 
        })
      }
      
    } catch (error) {
      console.error('Error refreshing workspaces:', error)
      setError('Failed to refresh workspace list')
    } finally {
      setIsLoading(false)
    }
  }, [fetchWorkspaces, currentWorkspace, logWorkspaceAction])

  // Security: Secure workspace switching with validation
  const switchWorkspace = useCallback(async (workspaceId: string): Promise<boolean> => {
    if (!user || !workspaceId) return false
    
    try {
      setIsLoading(true)
      setError(null)
      
      // Security: Validate access before switching
      const hasAccess = await validateWorkspaceAccess(workspaceId)
      if (!hasAccess) {
        setError('Access denied to the requested workspace')
        await logWorkspaceAction('workspace_switch_denied', { 
          attemptedWorkspaceId: workspaceId 
        })
        return false
      }
      
      // Security: Find workspace in user's accessible list
      const targetWorkspace = workspaces.find(w => w.id === workspaceId)
      if (!targetWorkspace) {
        setError('Workspace not found in your accessible workspaces')
        return false
      }
      
      // Security: Update JWT token with new workspace context
      const { data, error: tokenError } = await supabase.auth.updateUser({
        data: { 
          current_workspace_id: workspaceId,
          workspace_role: targetWorkspace.role
        }
      })
      
      if (tokenError) {
        setError('Failed to update workspace context')
        return false
      }
      
      // Security: Set new current workspace
      setCurrentWorkspace(targetWorkspace)
      
      // Security: Log successful workspace switch
      await logWorkspaceAction('workspace_switched', {
        previousWorkspaceId: currentWorkspace?.id,
        newWorkspaceId: workspaceId,
        newRole: targetWorkspace.role
      })
      
      return true
      
    } catch (error) {
      console.error('Error switching workspace:', error)
      setError('Failed to switch workspace')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [user, workspaces, validateWorkspaceAccess, supabase, currentWorkspace, logWorkspaceAction])

  // Security: Check if user has specific permission
  const hasPermission = useCallback((permission: WorkspacePermission): boolean => {
    if (!currentWorkspace) return false
    return currentWorkspace.permissions.includes(permission)
  }, [currentWorkspace])

  // Security: Initialize authentication and workspace context
  useEffect(() => {
    let mounted = true
    
    const initializeAuth = async () => {
      try {
        // Security: Get current user session
        const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
        
        if (userError || !currentUser) {
          if (mounted) {
            setUser(null)
            setIsLoading(false)
          }
          return
        }
        
        if (mounted) {
          setUser(currentUser)
        }
        
        // Security: Fetch user workspaces
        const userWorkspaces = await fetchWorkspaces()
        if (mounted) {
          setWorkspaces(userWorkspaces)
        }
        
        // Security: Set initial workspace from JWT or first available workspace
        const workspaceFromJWT = currentUser.user_metadata?.current_workspace_id
        const targetWorkspaceId = initialWorkspaceId || workspaceFromJWT
        
        if (targetWorkspaceId && userWorkspaces.some(w => w.id === targetWorkspaceId)) {
          const workspace = userWorkspaces.find(w => w.id === targetWorkspaceId)
          if (workspace && mounted) {
            setCurrentWorkspace(workspace)
          }
        } else if (userWorkspaces.length > 0 && mounted) {
          // Security: Default to first accessible workspace if no specific workspace is set
          setCurrentWorkspace(userWorkspaces[0])
        }
        
      } catch (error) {
        console.error('Auth initialization error:', error)
        if (mounted) {
          setError('Failed to initialize authentication')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }
    
    initializeAuth()
    
    // Security: Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        
        if (event === 'SIGNED_OUT' || !session?.user) {
          setUser(null)
          setCurrentWorkspace(null)
          setWorkspaces([])
          setError(null)
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setUser(session.user)
          // Refresh workspaces when auth state changes
          const userWorkspaces = await fetchWorkspaces()
          setWorkspaces(userWorkspaces)
        }
      }
    )
    
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [initialWorkspaceId, supabase, fetchWorkspaces])

  const contextValue: WorkspaceContextValue = {
    currentWorkspace,
    workspaces,
    user,
    isLoading,
    isAuthenticated: !!user,
    switchWorkspace,
    refreshWorkspaces,
    validateWorkspaceAccess,
    hasPermission,
    error,
    clearError,
    logWorkspaceAction
  }

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  )
}

/**
 * Security: Custom hook to access workspace context
 * Throws error if used outside provider to prevent unsafe usage
 */
export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext)
  
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider')
  }
  
  return context
}

/**
 * Security: Hook for checking specific permissions
 */
export function useWorkspacePermission(permission: WorkspacePermission): boolean {
  const { hasPermission } = useWorkspace()
  return hasPermission(permission)
}

/**
 * Security: Hook for workspace-specific operations with automatic error handling
 */
export function useWorkspaceOperation() {
  const { currentWorkspace, logWorkspaceAction, error, clearError } = useWorkspace()
  
  const executeWithLogging = useCallback(async (
    operation: () => Promise<any>,
    actionName: string,
    details?: Record<string, any>
  ): Promise<any> => {
    if (!currentWorkspace) {
      throw new Error('No workspace selected')
    }
    
    try {
      clearError()
      const result = await operation()
      await logWorkspaceAction(actionName, { ...details, success: true })
      return result
    } catch (error) {
      await logWorkspaceAction(actionName, { 
        ...details, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
      throw error
    }
  }, [currentWorkspace, logWorkspaceAction, clearError])
  
  return {
    executeWithLogging,
    workspaceId: currentWorkspace?.id,
    error,
    clearError
  }
}