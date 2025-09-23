/**
 * Workspace Validation API Endpoint
 * 
 * Security: Provides server-side workspace access validation
 * for client-side workspace switching operations.
 */

import { NextRequest } from 'next/server'
import { withWorkspaceValidation } from '@/lib/auth/workspace-middleware'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Security: Validate user access to a specific workspace
 */
export const GET = withWorkspaceValidation(
  async (request: NextRequest, context) => {
    const { user, workspaceId, userRole, permissions } = context
    
    // Extract workspace ID from URL
    const urlParts = request.nextUrl.pathname.split('/')
    const requestedWorkspaceId = urlParts[urlParts.indexOf('workspace') + 1]
    
    // Security: Verify the requested workspace matches the validated workspace
    if (requestedWorkspaceId !== workspaceId) {
      return new Response(JSON.stringify({
        hasAccess: false,
        error: 'Workspace ID mismatch',
        details: 'The requested workspace does not match your current context'
      }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Security: Return validation result with minimal information
    return new Response(JSON.stringify({
      hasAccess: true,
      workspaceId,
      userRole,
      permissions: permissions.includes('*') ? ['all'] : permissions,
      validatedAt: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  },
  {
    logAction: 'workspace_validation_request',
    // Allow all roles since this is just validation
    allowedRoles: ['owner', 'admin', 'member', 'viewer']
  }
)