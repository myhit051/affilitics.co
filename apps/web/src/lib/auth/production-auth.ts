import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

/**
 * PRODUCTION-READY AUTHENTICATION MODULE
 * 
 * This module provides secure authentication for production use:
 * - No mock data fallbacks
 * - Proper JWT token handling
 * - Multi-tenant workspace isolation
 * - Comprehensive error handling
 */

export interface AuthContext {
  user: {
    id: string
    email: string
    name: string | null
  }
  workspaceId: string
  userRole: string
  supabase: ReturnType<typeof createClient>
}

export interface AuthError {
  type: 'UNAUTHORIZED' | 'FORBIDDEN' | 'WORKSPACE_NOT_FOUND' | 'INVALID_TOKEN'
  message: string
  statusCode: number
}

/**
 * Get authenticated user context with workspace validation
 * This is the PRIMARY method for server-side authentication
 * 
 * @throws {Response} HTTP error response for authentication failures
 * @returns {Promise<AuthContext>} Authenticated user context
 */
export async function getProductionAuthContext(): Promise<AuthContext> {
  const supabase = createClient()
  
  try {
    // Step 1: Verify user authentication via Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      throw createAuthError('UNAUTHORIZED', 'Valid authentication required', 401)
    }

    // Step 2: Get workspace context from middleware-validated headers
    const h = headers()
    const workspaceId = h.get('x-workspace-id')
    const userRole = h.get('x-user-role')
    
    if (!workspaceId) {
      throw createAuthError('WORKSPACE_NOT_FOUND', 'Workspace context is required', 400)
    }

    if (!userRole) {
      throw createAuthError('FORBIDDEN', 'User role not determined', 403)
    }

    // Step 3: Validate workspace ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(workspaceId)) {
      throw createAuthError('WORKSPACE_NOT_FOUND', 'Invalid workspace ID format', 400)
    }

    // Step 4: Double-check workspace membership via RLS
    const { data: membership, error: membershipError } = await supabase
      .from('members')
      .select('id, role')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .single()

    if (membershipError || !membership) {
      throw createAuthError('FORBIDDEN', 'Access denied to this workspace', 403)
    }

    // Step 5: Verify role consistency
    if (membership.role !== userRole) {
      console.warn('Role mismatch detected:', { 
        headerRole: userRole, 
        dbRole: membership.role,
        userId: user.id,
        workspaceId 
      })
      throw createAuthError('FORBIDDEN', 'Role verification failed', 403)
    }

    return {
      user: {
        id: user.id,
        email: user.email || '',
        name: user.user_metadata?.name || null
      },
      workspaceId,
      userRole: membership.role,
      supabase
    }
  } catch (error) {
    // Re-throw auth errors as-is
    if (error instanceof Response) {
      throw error
    }
    
    // Log unexpected errors for monitoring
    console.error('Authentication context error:', error)
    throw createAuthError('UNAUTHORIZED', 'Authentication verification failed', 500)
  }
}

/**
 * Lightweight auth check for API routes that only need user validation
 * Use this when you don't need workspace context
 */
export async function getUserAuthContext() {
  const supabase = createClient()
  
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    throw createAuthError('UNAUTHORIZED', 'User authentication required', 401)
  }

  return {
    user: {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.name || null
    },
    supabase
  }
}

/**
 * Validate workspace access for a specific user
 * Used in middleware and for additional security checks
 */
export async function validateWorkspaceAccess(
  userId: string, 
  workspaceId: string
): Promise<{ role: string } | null> {
  const supabase = createClient()
  
  try {
    const { data: membership, error } = await supabase
      .from('members')
      .select('role')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .single()

    if (error || !membership) {
      return null
    }

    return { role: membership.role }
  } catch (error) {
    console.error('Workspace access validation error:', error)
    return null
  }
}

/**
 * Check if user has specific role in workspace
 */
export function hasWorkspaceRole(
  userRole: string, 
  requiredRoles: string[]
): boolean {
  return requiredRoles.includes(userRole)
}

/**
 * Create standardized auth error responses
 */
function createAuthError(
  type: AuthError['type'], 
  message: string, 
  statusCode: number
): Response {
  const error: AuthError = { type, message, statusCode }
  
  return new Response(JSON.stringify({ 
    error: error.type,
    message: error.message,
    statusCode: error.statusCode
  }), { 
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    }
  })
}

/**
 * Higher-order function to protect API routes with authentication
 * Usage: export const GET = withAuth(async (request, { user, workspaceId }) => { ... })
 */
export function withAuth<T extends any[]>(
  handler: (request: NextRequest, authContext: AuthContext, ...args: T) => Promise<Response>
) {
  return async (request: NextRequest, ...args: T): Promise<Response> => {
    try {
      const authContext = await getProductionAuthContext()
      return await handler(request, authContext, ...args)
    } catch (error) {
      // Auth errors are already Response objects
      if (error instanceof Response) {
        return error
      }
      
      // Unexpected errors
      console.error('Auth wrapper error:', error)
      return createAuthError('UNAUTHORIZED', 'Authentication failed', 500)
    }
  }
}

/**
 * Role-based access control wrapper
 * Usage: export const DELETE = withRole(['admin', 'owner'], async (request, { user }) => { ... })
 */
export function withRole<T extends any[]>(
  requiredRoles: string[],
  handler: (request: NextRequest, authContext: AuthContext, ...args: T) => Promise<Response>
) {
  return withAuth(async (request: NextRequest, authContext: AuthContext, ...args: T) => {
    if (!hasWorkspaceRole(authContext.userRole, requiredRoles)) {
      throw createAuthError(
        'FORBIDDEN', 
        `Access denied. Required roles: ${requiredRoles.join(', ')}`, 
        403
      )
    }
    
    return await handler(request, authContext, ...args)
  })
}

// Legacy compatibility - replace all calls to this function
export const getAuthContext = getProductionAuthContext