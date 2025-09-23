/**
 * Secure Workspace Validation Middleware
 * 
 * This middleware provides server-side workspace validation for API routes
 * with comprehensive security checks and audit logging.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { User } from '@supabase/supabase-js'

export interface ValidatedWorkspaceContext {
  user: User
  workspaceId: string
  userRole: string
  permissions: string[]
  supabase: ReturnType<typeof createClient>
}

export interface WorkspaceValidationOptions {
  requirePermissions?: string[]
  allowedRoles?: string[]
  logAction?: string
  skipValidation?: boolean
}

// Security: Define role hierarchy for permission inheritance
const ROLE_HIERARCHY = {
  'owner': ['owner', 'admin', 'member', 'viewer'],
  'admin': ['admin', 'member', 'viewer'],
  'member': ['member', 'viewer'],
  'viewer': ['viewer']
} as const

// Security: Permission definitions
const ROLE_PERMISSIONS = {
  'owner': ['*'], // All permissions
  'admin': [
    'read_data', 'write_data', 'delete_data',
    'import_files', 'manage_imports',
    'invite_members', 'change_settings',
    'view_analytics', 'export_data'
  ],
  'member': [
    'read_data', 'write_data',
    'import_files', 'view_analytics', 'export_data'
  ],
  'viewer': ['read_data', 'view_analytics']
} as const

/**
 * Security: Validate workspace access with comprehensive checks
 */
export async function validateWorkspaceAccess(
  request: NextRequest,
  options: WorkspaceValidationOptions = {}
): Promise<ValidatedWorkspaceContext> {
  
  if (options.skipValidation) {
    // Security: Still return basic context even when skipping validation
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      throw new Response(JSON.stringify({
        error: 'Unauthorized',
        details: 'Authentication required'
      }), { status: 401 })
    }
    
    const workspaceId = request.headers.get('x-workspace-id') || 'default'
    
    return {
      user,
      workspaceId,
      userRole: 'member',
      permissions: [...ROLE_PERMISSIONS.member],
      supabase
    }
  }

  const supabase = createClient()
  
  // Security: Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    await logSecurityEvent(request, 'auth_failed', { 
      error: authError?.message || 'No user found' 
    })
    
    throw new Response(JSON.stringify({
      error: 'Unauthorized',
      details: 'Valid authentication required'
    }), { status: 401 })
  }

  // Security: Extract workspace ID from multiple sources with priority
  const workspaceId = extractWorkspaceId(request)
  
  if (!workspaceId) {
    await logSecurityEvent(request, 'missing_workspace_id', { userId: user.id })
    
    throw new Response(JSON.stringify({
      error: 'Missing workspace context',
      details: 'Workspace ID is required for this operation'
    }), { status: 400 })
  }

  // Security: Validate workspace ID format (UUID)
  if (!isValidUUID(workspaceId)) {
    await logSecurityEvent(request, 'invalid_workspace_format', { 
      userId: user.id, 
      workspaceId 
    })
    
    throw new Response(JSON.stringify({
      error: 'Invalid workspace ID',
      details: 'Workspace ID must be a valid UUID'
    }), { status: 400 })
  }

  // Security: Check workspace membership with role validation
  const { data: membership, error: membershipError } = await supabase
    .from('members')
    .select(`
      id,
      role,
      workspace:workspaces!inner(
        id,
        name,
        plan,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .single()

  if (membershipError || !membership) {
    await logSecurityEvent(request, 'workspace_access_denied', {
      userId: user.id,
      workspaceId,
      error: membershipError?.message || 'No membership found'
    })
    
    throw new Response(JSON.stringify({
      error: 'Access denied',
      details: 'You do not have access to this workspace'
    }), { status: 403 })
  }

  const userRole = membership.role as keyof typeof ROLE_PERMISSIONS
  const userPermissions = ROLE_PERMISSIONS[userRole] || []

  // Security: Check role requirements
  if (options.allowedRoles && !options.allowedRoles.includes(userRole)) {
    await logSecurityEvent(request, 'insufficient_role', {
      userId: user.id,
      workspaceId,
      userRole,
      requiredRoles: options.allowedRoles
    })
    
    throw new Response(JSON.stringify({
      error: 'Insufficient privileges',
      details: `This operation requires one of: ${options.allowedRoles.join(', ')}`
    }), { status: 403 })
  }

  // Security: Check specific permission requirements
  if (options.requirePermissions) {
    const hasAllPermissions = options.requirePermissions.every(permission => 
      (userPermissions as unknown as string[]).includes('*') || (userPermissions as unknown as string[]).includes(permission)
    )
    
    if (!hasAllPermissions) {
      await logSecurityEvent(request, 'insufficient_permissions', {
        userId: user.id,
        workspaceId,
        userRole,
        requiredPermissions: options.requirePermissions,
        userPermissions
      })
      
      throw new Response(JSON.stringify({
        error: 'Insufficient permissions',
        details: 'You do not have the required permissions for this operation'
      }), { status: 403 })
    }
  }

  // Security: Update JWT with workspace context for Supabase RLS
  try {
    await supabase.auth.updateUser({
      data: { 
        current_workspace_id: workspaceId,
        workspace_role: userRole
      }
    })
  } catch (error) {
    console.error('Failed to update JWT context:', error)
    // Continue execution as this is not critical for immediate operation
  }

  // Security: Log successful access
  if (options.logAction) {
    await logSecurityEvent(request, options.logAction, {
      userId: user.id,
      workspaceId,
      userRole,
      success: true
    })
  }

  return {
    user,
    workspaceId,
    userRole,
    permissions: [...userPermissions],
    supabase
  }
}

/**
 * Security: Extract workspace ID with priority order
 */
function extractWorkspaceId(request: NextRequest): string | null {
  // Priority 1: URL path parameter (most secure)
  const pathMatch = request.nextUrl.pathname.match(/\/workspace\/([a-f0-9\-]{36})/)
  if (pathMatch) {
    return pathMatch[1]
  }
  
  // Priority 2: Header (controlled by middleware)
  const headerWorkspaceId = request.headers.get('x-workspace-id')
  if (headerWorkspaceId && headerWorkspaceId !== 'current-workspace-id') {
    return headerWorkspaceId
  }
  
  // Priority 3: Query parameter (least secure, validate carefully)
  const queryWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
  if (queryWorkspaceId) {
    return queryWorkspaceId
  }
  
  return null
}

/**
 * Security: Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Security: Log security events for audit and monitoring
 */
async function logSecurityEvent(
  request: NextRequest,
  event: string,
  details: Record<string, any>
): Promise<void> {
  try {
    const clientIP = getClientIP(request)
    const userAgent = request.headers.get('user-agent') || 'unknown'
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      ip: clientIP,
      userAgent,
      path: request.nextUrl.pathname,
      method: request.method,
      details,
      // Security: Add request fingerprint for tracking
      fingerprint: generateRequestFingerprint(request)
    }
    
    // Security: In production, send to secure logging service
    console.warn('Security Event:', JSON.stringify(logEntry))
    
    // TODO: Implement secure logging to external service
    // await sendToSecurityLog(logEntry)
    
  } catch (error) {
    console.error('Failed to log security event:', error)
    // Don't throw here to avoid breaking the main operation
  }
}

/**
 * Security: Get real client IP address
 */
function getClientIP(request: NextRequest): string {
  const xForwardedFor = request.headers.get('x-forwarded-for')
  const xRealIp = request.headers.get('x-real-ip')
  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim()
  }
  
  if (xRealIp) {
    return xRealIp
  }
  
  if (cfConnectingIp) {
    return cfConnectingIp
  }
  
  return request.ip || 'unknown'
}

/**
 * Security: Generate request fingerprint for tracking
 */
function generateRequestFingerprint(request: NextRequest): string {
  const components = [
    getClientIP(request),
    request.headers.get('user-agent') || '',
    request.headers.get('accept-language') || '',
    request.headers.get('accept-encoding') || ''
  ]
  
  // Simple hash for fingerprinting (in production, use crypto.subtle)
  return btoa(components.join('|')).substring(0, 16)
}

/**
 * Security: Higher-order function for protecting API routes
 */
export function withWorkspaceValidation(
  handler: (
    request: NextRequest,
    context: ValidatedWorkspaceContext
  ) => Promise<Response>,
  options: WorkspaceValidationOptions = {}
) {
  return async (request: NextRequest): Promise<Response> => {
    try {
      const context = await validateWorkspaceAccess(request, options)
      return await handler(request, context)
    } catch (error) {
      if (error instanceof Response) {
        return error
      }
      
      console.error('Workspace validation error:', error)
      return new Response(JSON.stringify({
        error: 'Internal server error',
        details: 'An error occurred during workspace validation'
      }), { status: 500 })
    }
  }
}

/**
 * Security: Check if user has specific permission
 */
export function hasPermission(
  userRole: string,
  permission: string
): boolean {
  const permissions = ROLE_PERMISSIONS[userRole as keyof typeof ROLE_PERMISSIONS]
  return (permissions as unknown as string[])?.includes('*') || (permissions as unknown as string[])?.includes(permission) || false
}

/**
 * Security: Get all permissions for a role
 */
export function getRolePermissions(role: string): string[] {
  return [...(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] || [])]
}