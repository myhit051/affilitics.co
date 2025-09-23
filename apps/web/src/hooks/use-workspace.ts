/**
 * Secure Workspace Hook
 * 
 * This hook provides a simplified interface for workspace operations
 * with built-in security checks and error handling.
 */

import { useCallback } from 'react'
import { useWorkspace, WORKSPACE_PERMISSIONS, WorkspacePermission } from '@/contexts/workspace-context'

export interface UseWorkspaceResult {
  // Current workspace information
  workspaceId: string | null
  workspaceName: string | null
  userRole: string | null
  
  // Permission checking
  canRead: boolean
  canWrite: boolean
  canImport: boolean
  canManage: boolean
  canInvite: boolean
  hasPermission: (permission: WorkspacePermission) => boolean
  
  // Workspace operations
  switchWorkspace: (workspaceId: string) => Promise<boolean>
  refreshWorkspaces: () => Promise<void>
  
  // Error handling
  error: string | null
  clearError: () => void
  isLoading: boolean
  
  // Utility functions
  getHeaders: () => Record<string, string>
  validateAccess: (workspaceId?: string) => Promise<boolean>
}

/**
 * Main workspace hook with security-first design
 */
export function useWorkspaceSecure(): UseWorkspaceResult {
  const {
    currentWorkspace,
    user,
    isLoading,
    error,
    clearError,
    switchWorkspace,
    refreshWorkspaces,
    hasPermission,
    validateWorkspaceAccess
  } = useWorkspace()

  // Security: Pre-computed permission checks for common operations
  const canRead = hasPermission(WORKSPACE_PERMISSIONS.READ_DATA)
  const canWrite = hasPermission(WORKSPACE_PERMISSIONS.WRITE_DATA)
  const canImport = hasPermission(WORKSPACE_PERMISSIONS.IMPORT_FILES)
  const canManage = hasPermission(WORKSPACE_PERMISSIONS.MANAGE_IMPORTS)
  const canInvite = hasPermission(WORKSPACE_PERMISSIONS.INVITE_MEMBERS)

  // Security: Generate secure headers for API calls
  const getHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    // Security: Only add workspace header if we have a validated workspace
    if (currentWorkspace?.id && user?.id) {
      headers['x-workspace-id'] = currentWorkspace.id
      headers['x-user-id'] = user.id
      headers['x-user-role'] = currentWorkspace.role
    }
    
    return headers
  }, [currentWorkspace, user])

  // Security: Validate workspace access
  const validateAccess = useCallback(async (workspaceId?: string): Promise<boolean> => {
    const targetWorkspaceId = workspaceId || currentWorkspace?.id
    if (!targetWorkspaceId) return false
    
    return await validateWorkspaceAccess(targetWorkspaceId)
  }, [currentWorkspace, validateWorkspaceAccess])

  return {
    // Current workspace information
    workspaceId: currentWorkspace?.id || null,
    workspaceName: currentWorkspace?.name || null,
    userRole: currentWorkspace?.role || null,
    
    // Permission checking
    canRead,
    canWrite,
    canImport,
    canManage,
    canInvite,
    hasPermission,
    
    // Workspace operations
    switchWorkspace,
    refreshWorkspaces,
    
    // Error handling
    error,
    clearError,
    isLoading,
    
    // Utility functions
    getHeaders,
    validateAccess
  }
}

/**
 * Hook for API calls with automatic workspace context
 */
export function useWorkspaceAPI() {
  const { getHeaders, workspaceId, validateAccess, error } = useWorkspaceSecure()
  
  const fetchWithWorkspace = useCallback(async (
    url: string, 
    options: RequestInit = {}
  ): Promise<Response> => {
    // Security: Validate workspace access before making API calls
    if (!workspaceId) {
      throw new Error('No workspace selected')
    }
    
    const hasAccess = await validateAccess()
    if (!hasAccess) {
      throw new Error('Access denied to current workspace')
    }
    
    // Security: Merge secure headers
    const secureHeaders = getHeaders()
    const mergedOptions: RequestInit = {
      ...options,
      headers: {
        ...secureHeaders,
        ...options.headers
      }
    }
    
    return fetch(url, mergedOptions)
  }, [getHeaders, workspaceId, validateAccess])
  
  return {
    fetchWithWorkspace,
    workspaceId,
    error
  }
}

/**
 * Hook for workspace-specific data fetching with SWR-like interface
 */
export function useWorkspaceData<T>(
  endpoint: string,
  options?: {
    enabled?: boolean
    refreshInterval?: number
    onError?: (error: Error) => void
  }
) {
  const { fetchWithWorkspace, workspaceId } = useWorkspaceAPI()
  const { hasPermission } = useWorkspaceSecure()
  
  // Security: Check read permission before fetching
  const canRead = hasPermission(WORKSPACE_PERMISSIONS.READ_DATA)
  
  const fetchData = useCallback(async (): Promise<T | null> => {
    if (!canRead || !workspaceId || options?.enabled === false) {
      return null
    }
    
    try {
      const response = await fetchWithWorkspace(endpoint)
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      options?.onError?.(error instanceof Error ? error : new Error('Unknown error'))
      throw error
    }
  }, [endpoint, fetchWithWorkspace, canRead, workspaceId, options])
  
  return {
    fetchData,
    canRead,
    workspaceId
  }
}

/**
 * Hook for workspace mutation operations
 */
export function useWorkspaceMutation() {
  const { fetchWithWorkspace } = useWorkspaceAPI()
  const { hasPermission } = useWorkspaceSecure()
  
  const mutate = useCallback(async <T>(
    endpoint: string,
    data: any,
    requiredPermission: WorkspacePermission,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST'
  ): Promise<T> => {
    // Security: Check required permission before mutation
    if (!hasPermission(requiredPermission)) {
      throw new Error('Insufficient permissions for this operation')
    }
    
    const response = await fetchWithWorkspace(endpoint, {
      method,
      body: method !== 'DELETE' ? JSON.stringify(data) : undefined
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `API Error: ${response.status}`)
    }
    
    return await response.json()
  }, [fetchWithWorkspace, hasPermission])
  
  return {
    mutate,
    hasPermission
  }
}

// Re-export the main hook as default
export { useWorkspaceSecure as useWorkspace }
export default useWorkspaceSecure