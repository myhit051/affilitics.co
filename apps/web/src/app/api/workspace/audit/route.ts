/**
 * Workspace Audit Logging API
 * 
 * Security: Provides secure audit logging for all workspace operations
 * to maintain compliance and enable security monitoring.
 */

import { NextRequest } from 'next/server'
import { withWorkspaceValidation } from '@/lib/auth/workspace-middleware'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface AuditLogEntry {
  action: string
  workspaceId: string
  userId: string
  details: Record<string, any>
  timestamp: string
  userAgent: string
  ipAddress: string
}

/**
 * Security: Log workspace actions for audit trail
 */
export const POST = withWorkspaceValidation(
  async (request: NextRequest, context) => {
    const { user, workspaceId, supabase } = context
    
    try {
      const body: AuditLogEntry = await request.json()
      
      // Security: Validate required fields
      if (!body.action || !body.timestamp) {
        return new Response(JSON.stringify({
          error: 'Invalid audit log entry',
          details: 'action and timestamp are required'
        }), { status: 400 })
      }
      
      // Security: Override sensitive fields with server-side values
      const clientIP = getClientIP(request)
      const userAgent = request.headers.get('user-agent') || 'unknown'
      
      const auditEntry = {
        workspace_id: workspaceId, // Use validated workspace ID
        user_id: user.id, // Use authenticated user ID
        action: body.action,
        details: body.details || {},
        ip_address: clientIP,
        user_agent: userAgent,
        timestamp: new Date().toISOString(), // Use server timestamp
        created_at: new Date().toISOString()
      }
      
      // Security: Store audit log in secure table
      const { error: insertError } = await supabase
        .from('audit_logs')
        .insert([auditEntry])
      
      if (insertError) {
        console.error('Failed to insert audit log:', insertError)
        return new Response(JSON.stringify({
          error: 'Failed to log action',
          details: 'Could not save audit log entry'
        }), { status: 500 })
      }
      
      return new Response(JSON.stringify({
        success: true,
        logged: true,
        timestamp: auditEntry.timestamp
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      
    } catch (error) {
      console.error('Audit logging error:', error)
      return new Response(JSON.stringify({
        error: 'Audit logging failed',
        details: 'An error occurred while logging the action'
      }), { status: 500 })
    }
  },
  {
    logAction: 'audit_log_request',
    // All authenticated users can log actions
    allowedRoles: ['owner', 'admin', 'member', 'viewer']
  }
)

/**
 * Security: Retrieve audit logs (admin/owner only)
 */
export const GET = withWorkspaceValidation(
  async (request: NextRequest, context) => {
    const { workspaceId, supabase } = context
    const { searchParams } = request.nextUrl
    
    try {
      // Security: Parse query parameters with defaults
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
      const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0)
      const action = searchParams.get('action')
      const userId = searchParams.get('userId')
      const fromDate = searchParams.get('fromDate')
      const toDate = searchParams.get('toDate')
      
      // Security: Build secure query
      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1)
      
      // Security: Apply filters
      if (action) {
        query = query.eq('action', action)
      }
      
      if (userId) {
        query = query.eq('user_id', userId)
      }
      
      if (fromDate) {
        query = query.gte('timestamp', fromDate)
      }
      
      if (toDate) {
        query = query.lte('timestamp', toDate)
      }
      
      const { data: auditLogs, error: queryError } = await query
      
      if (queryError) {
        console.error('Failed to query audit logs:', queryError)
        return new Response(JSON.stringify({
          error: 'Failed to retrieve audit logs',
          details: queryError.message
        }), { status: 500 })
      }
      
      // Security: Sanitize sensitive information from logs
      const sanitizedLogs = auditLogs?.map(log => ({
        id: log.id,
        action: log.action,
        user_id: log.user_id,
        timestamp: log.timestamp,
        details: log.details,
        // Security: Optionally hide IP addresses for privacy
        ip_address: log.ip_address?.replace(/\.\d+$/, '.xxx'),
        user_agent: log.user_agent
      })) || []
      
      return new Response(JSON.stringify({
        success: true,
        logs: sanitizedLogs,
        pagination: {
          offset,
          limit,
          total: sanitizedLogs.length
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      
    } catch (error) {
      console.error('Get audit logs error:', error)
      return new Response(JSON.stringify({
        error: 'Failed to retrieve audit logs'
      }), { status: 500 })
    }
  },
  {
    logAction: 'audit_logs_accessed',
    // Only admins and owners can view audit logs
    allowedRoles: ['owner', 'admin']
  }
)

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