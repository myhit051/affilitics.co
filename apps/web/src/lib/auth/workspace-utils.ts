/**
 * SECURE WORKSPACE ACCESS UTILITIES
 * 
 * This module provides utilities for workspace access validation,
 * permission checking, and secure workspace operations.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createClientClient } from '@/lib/supabase/client'
import { 
  Workspace, 
  WorkspaceMember, 
  WorkspaceRole, 
  AuthUser,
  Permission,
  ValidationResult,
  ServiceResponse 
} from './types'
import { getSecurityMonitor } from './security-monitoring'

// Role hierarchy for permission inheritance
export const ROLE_HIERARCHY: Record<WorkspaceRole, WorkspaceRole[]> = {
  'owner': ['owner', 'admin', 'member', 'viewer'],
  'admin': ['admin', 'member', 'viewer'],
  'member': ['member', 'viewer'],
  'viewer': ['viewer']
}

// Permission definitions by role
export const ROLE_PERMISSIONS: Record<WorkspaceRole, string[]> = {
  'owner': ['*'], // All permissions
  'admin': [
    'workspace:read',
    'workspace:write',
    'workspace:settings',
    'users:read',
    'users:write',
    'users:invite',
    'data:read',
    'data:write',
    'data:delete',
    'analytics:read',
    'analytics:export',
    'imports:read',
    'imports:write',
    'imports:manage'
  ],
  'member': [
    'workspace:read',
    'users:read',
    'data:read',
    'data:write',
    'analytics:read',
    'imports:read',
    'imports:write'
  ],
  'viewer': [
    'workspace:read',
    'users:read',
    'data:read',
    'analytics:read'
  ]
}

// Workspace validation options
export interface WorkspaceValidationOptions {
  requireMembership?: boolean
  requiredRole?: WorkspaceRole | WorkspaceRole[]
  requiredPermissions?: string[]
  checkStatus?: boolean
  logAccess?: boolean
}

/**
 * Validate workspace access for a user
 */
export async function validateWorkspaceAccess(
  userId: string,
  workspaceId: string,
  options: WorkspaceValidationOptions = {}
): Promise<ServiceResponse<{
  workspace: Workspace
  membership: WorkspaceMember
  hasAccess: boolean
  permissions: string[]
}>> {
  const {
    requireMembership = true,
    requiredRole,
    requiredPermissions,
    checkStatus = true,
    logAccess = true
  } = options

  try {
    const supabase = createClient()
    const securityMonitor = getSecurityMonitor()

    // Validate workspace ID format
    if (!isValidUUID(workspaceId)) {
      if (logAccess) {
        securityMonitor.logEvent('workspace_access_denied', null, {
          reason: 'invalid_workspace_id',
          workspaceId,
          userId
        })
      }
      
      return {
        data: null,
        error: new Error('Invalid workspace ID format'),
        success: false
      }
    }

    // Get workspace details
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single()

    if (workspaceError || !workspace) {
      if (logAccess) {
        securityMonitor.logEvent('workspace_access_denied', null, {
          reason: 'workspace_not_found',
          workspaceId,
          userId
        })
      }

      return {
        data: null,
        error: new Error('Workspace not found'),
        success: false
      }
    }

    let membership: WorkspaceMember | null = null

    // Check membership if required
    if (requireMembership) {
      const { data: membershipData, error: membershipError } = await supabase
        .from('members')
        .select(`
          *,
          workspace:workspaces!inner(id, name, plan)
        `)
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .single()

      if (membershipError || !membershipData) {
        if (logAccess) {
          securityMonitor.logEvent('workspace_access_denied', null, {
            reason: 'no_membership',
            workspaceId,
            userId
          })
        }

        return {
          data: null,
          error: new Error('User is not a member of this workspace'),
          success: false
        }
      }

      membership = membershipData as WorkspaceMember

      // Check membership status
      if (checkStatus && membership.status !== 'active') {
        if (logAccess) {
          securityMonitor.logEvent('workspace_access_denied', null, {
            reason: 'inactive_membership',
            workspaceId,
            userId,
            status: membership.status
          })
        }

        return {
          data: null,
          error: new Error(`Membership is ${membership.status}`),
          success: false
        }
      }

      // Check role requirements
      if (requiredRole) {
        const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
        if (!roles.includes(membership.role)) {
          if (logAccess) {
            securityMonitor.logEvent('workspace_access_denied', null, {
              reason: 'insufficient_role',
              workspaceId,
              userId,
              userRole: membership.role,
              requiredRoles: roles
            })
          }

          return {
            data: null,
            error: new Error(`Insufficient role. Required: ${roles.join(' or ')}, Current: ${membership.role}`),
            success: false
          }
        }
      }

      // Get user permissions
      const permissions = getRolePermissions(membership.role)

      // Check permission requirements
      if (requiredPermissions && requiredPermissions.length > 0) {
        const hasAllPermissions = requiredPermissions.every(permission =>
          permissions.includes('*') || permissions.includes(permission)
        )

        if (!hasAllPermissions) {
          if (logAccess) {
            securityMonitor.logEvent('workspace_access_denied', null, {
              reason: 'insufficient_permissions',
              workspaceId,
              userId,
              userPermissions: permissions,
              requiredPermissions
            })
          }

          return {
            data: null,
            error: new Error('Insufficient permissions'),
            success: false
          }
        }
      }

      // Log successful access
      if (logAccess) {
        securityMonitor.logEvent('auth_success', null, {
          type: 'workspace_access',
          workspaceId,
          userRole: membership.role
        }, userId, workspaceId)
      }

      return {
        data: {
          workspace,
          membership,
          hasAccess: true,
          permissions
        },
        error: null,
        success: true
      }
    }

    // If membership not required, just return workspace info
    return {
      data: {
        workspace,
        membership: membership!,
        hasAccess: true,
        permissions: []
      },
      error: null,
      success: true
    }

  } catch (error) {
    console.error('Workspace access validation error:', error)
    
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
      success: false
    }
  }
}

/**
 * Get user's workspaces with role and access information
 */
export async function getUserWorkspaces(
  userId: string
): Promise<ServiceResponse<WorkspaceMember[]>> {
  try {
    const supabase = createClient()

    const { data: memberships, error } = await supabase
      .from('members')
      .select(`
        *,
        workspace:workspaces!inner(
          id,
          name,
          plan,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (error) {
      return {
        data: null,
        error: new Error(error.message),
        success: false
      }
    }

    return {
      data: memberships || [],
      error: null,
      success: true
    }

  } catch (error) {
    console.error('Error getting user workspaces:', error)
    
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
      success: false
    }
  }
}

/**
 * Create a new workspace with the user as owner
 */
export async function createWorkspace(
  userId: string,
  workspaceData: {
    name: string
    plan?: string
    settings?: any
  }
): Promise<ServiceResponse<{ workspace: Workspace; membership: WorkspaceMember }>> {
  try {
    const supabase = createClient()
    const securityMonitor = getSecurityMonitor()

    // Validate workspace name
    const nameValidation = validateWorkspaceName(workspaceData.name)
    if (!nameValidation.isValid) {
      return {
        data: null,
        error: new Error(nameValidation.errors[0]?.message || 'Invalid workspace name'),
        success: false
      }
    }

    // Check if user already has a workspace with this name
    const { data: existingWorkspace } = await supabase
      .from('members')
      .select(`
        workspace:workspaces!inner(name)
      `)
      .eq('user_id', userId)
      .eq('workspaces.name', workspaceData.name)
      .single()

    if (existingWorkspace) {
      return {
        data: null,
        error: new Error('You already have a workspace with this name'),
        success: false
      }
    }

    // Create workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        name: workspaceData.name,
        plan: workspaceData.plan || 'free',
        settings: workspaceData.settings || {}
      })
      .select()
      .single()

    if (workspaceError || !workspace) {
      return {
        data: null,
        error: new Error('Failed to create workspace'),
        success: false
      }
    }

    // Add user as owner
    const { data: membership, error: membershipError } = await supabase
      .from('members')
      .insert({
        user_id: userId,
        workspace_id: workspace.id,
        role: 'owner',
        status: 'active'
      })
      .select(`
        *,
        workspace:workspaces!inner(id, name, plan)
      `)
      .single()

    if (membershipError || !membership) {
      // Cleanup workspace if membership creation fails
      await supabase.from('workspaces').delete().eq('id', workspace.id)
      
      return {
        data: null,
        error: new Error('Failed to create workspace membership'),
        success: false
      }
    }

    // Log workspace creation
    securityMonitor.logEvent('admin_action', null, {
      action: 'workspace_created',
      workspaceId: workspace.id,
      workspaceName: workspace.name
    }, userId, workspace.id)

    return {
      data: {
        workspace,
        membership: membership as WorkspaceMember
      },
      error: null,
      success: true
    }

  } catch (error) {
    console.error('Error creating workspace:', error)
    
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
      success: false
    }
  }
}

/**
 * Invite a user to a workspace
 */
export async function inviteUserToWorkspace(
  inviterId: string,
  workspaceId: string,
  email: string,
  role: WorkspaceRole = 'member'
): Promise<ServiceResponse<WorkspaceMember>> {
  try {
    const supabase = createClient()
    const securityMonitor = getSecurityMonitor()

    // Validate inviter's permissions
    const inviterAccess = await validateWorkspaceAccess(inviterId, workspaceId, {
      requiredPermissions: ['users:invite']
    })

    if (!inviterAccess.success || !inviterAccess.data?.hasAccess) {
      return {
        data: null,
        error: new Error('Insufficient permissions to invite users'),
        success: false
      }
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return {
        data: null,
        error: new Error('Invalid email address'),
        success: false
      }
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('members')
      .select('id, status')
      .eq('workspace_id', workspaceId)
      .eq('user_id', email) // This would need to be resolved to user ID
      .single()

    if (existingMember) {
      return {
        data: null,
        error: new Error('User is already a member of this workspace'),
        success: false
      }
    }

    // Create invitation (this would typically involve sending an email)
    const { data: invitation, error: invitationError } = await supabase
      .from('workspace_invitations')
      .insert({
        workspace_id: workspaceId,
        email,
        role,
        invited_by: inviterId,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
      .select(`
        *,
        workspace:workspaces!inner(id, name, plan)
      `)
      .single()

    if (invitationError) {
      return {
        data: null,
        error: new Error('Failed to create invitation'),
        success: false
      }
    }

    // Log invitation
    securityMonitor.logEvent('admin_action', null, {
      action: 'user_invited',
      invitedEmail: email,
      role,
      workspaceId
    }, inviterId, workspaceId)

    // TODO: Send invitation email

    return {
      data: invitation as WorkspaceMember,
      error: null,
      success: true
    }

  } catch (error) {
    console.error('Error inviting user to workspace:', error)
    
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
      success: false
    }
  }
}

/**
 * Update a member's role in a workspace
 */
export async function updateMemberRole(
  actorId: string,
  workspaceId: string,
  memberId: string,
  newRole: WorkspaceRole
): Promise<ServiceResponse<WorkspaceMember>> {
  try {
    const supabase = createClient()
    const securityMonitor = getSecurityMonitor()

    // Validate actor's permissions
    const actorAccess = await validateWorkspaceAccess(actorId, workspaceId, {
      requiredPermissions: ['users:write']
    })

    if (!actorAccess.success || !actorAccess.data?.hasAccess) {
      return {
        data: null,
        error: new Error('Insufficient permissions to update member roles'),
        success: false
      }
    }

    const actorRole = actorAccess.data.membership.role

    // Get current member info
    const { data: currentMember, error: memberError } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .eq('workspace_id', workspaceId)
      .single()

    if (memberError || !currentMember) {
      return {
        data: null,
        error: new Error('Member not found'),
        success: false
      }
    }

    // Prevent demoting the last owner
    if (currentMember.role === 'owner' && newRole !== 'owner') {
      const { count: ownerCount } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('role', 'owner')
        .eq('status', 'active')

      if (ownerCount === 1) {
        return {
          data: null,
          error: new Error('Cannot remove the last owner of the workspace'),
          success: false
        }
      }
    }

    // Check if actor can assign this role
    if (!canAssignRole(actorRole, newRole)) {
      return {
        data: null,
        error: new Error(`You cannot assign the role: ${newRole}`),
        success: false
      }
    }

    // Update member role
    const { data: updatedMember, error: updateError } = await supabase
      .from('members')
      .update({ role: newRole })
      .eq('id', memberId)
      .select(`
        *,
        workspace:workspaces!inner(id, name, plan)
      `)
      .single()

    if (updateError || !updatedMember) {
      return {
        data: null,
        error: new Error('Failed to update member role'),
        success: false
      }
    }

    // Log role change
    securityMonitor.logEvent('admin_action', null, {
      action: 'role_changed',
      memberId,
      fromRole: currentMember.role,
      toRole: newRole,
      workspaceId
    }, actorId, workspaceId)

    return {
      data: updatedMember as WorkspaceMember,
      error: null,
      success: true
    }

  } catch (error) {
    console.error('Error updating member role:', error)
    
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
      success: false
    }
  }
}

/**
 * Remove a member from a workspace
 */
export async function removeMemberFromWorkspace(
  actorId: string,
  workspaceId: string,
  memberId: string
): Promise<ServiceResponse<boolean>> {
  try {
    const supabase = createClient()
    const securityMonitor = getSecurityMonitor()

    // Validate actor's permissions
    const actorAccess = await validateWorkspaceAccess(actorId, workspaceId, {
      requiredPermissions: ['users:write']
    })

    if (!actorAccess.success || !actorAccess.data?.hasAccess) {
      return {
        data: null,
        error: new Error('Insufficient permissions to remove members'),
        success: false
      }
    }

    // Get member info
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .eq('workspace_id', workspaceId)
      .single()

    if (memberError || !member) {
      return {
        data: null,
        error: new Error('Member not found'),
        success: false
      }
    }

    // Prevent removing the last owner
    if (member.role === 'owner') {
      const { count: ownerCount } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('role', 'owner')
        .eq('status', 'active')

      if (ownerCount === 1) {
        return {
          data: null,
          error: new Error('Cannot remove the last owner of the workspace'),
          success: false
        }
      }
    }

    // Remove member
    const { error: removeError } = await supabase
      .from('members')
      .delete()
      .eq('id', memberId)

    if (removeError) {
      return {
        data: null,
        error: new Error('Failed to remove member'),
        success: false
      }
    }

    // Log member removal
    securityMonitor.logEvent('admin_action', null, {
      action: 'member_removed',
      removedUserId: member.user_id,
      memberRole: member.role,
      workspaceId
    }, actorId, workspaceId)

    return {
      data: true,
      error: null,
      success: true
    }

  } catch (error) {
    console.error('Error removing member from workspace:', error)
    
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Unknown error'),
      success: false
    }
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if user has specific permission in workspace
 */
export function hasPermission(userRole: WorkspaceRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[userRole] || []
  return permissions.includes('*') || permissions.includes(permission)
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: WorkspaceRole): string[] {
  return ROLE_PERMISSIONS[role] || []
}

/**
 * Check if a role can assign another role
 */
export function canAssignRole(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
  // Only owners can assign owner role
  if (targetRole === 'owner') {
    return actorRole === 'owner'
  }
  
  // Admins and owners can assign admin, member, viewer
  if (targetRole === 'admin') {
    return ['owner', 'admin'].includes(actorRole)
  }
  
  // Admin+ can assign member and viewer roles
  return ['owner', 'admin'].includes(actorRole)
}

/**
 * Validate workspace name
 */
export function validateWorkspaceName(name: string): ValidationResult {
  const errors = []

  if (!name || name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Workspace name is required',
      code: 'REQUIRED'
    })
  }

  if (name.length < 2) {
    errors.push({
      field: 'name',
      message: 'Workspace name must be at least 2 characters',
      code: 'MIN_LENGTH'
    })
  }

  if (name.length > 50) {
    errors.push({
      field: 'name',
      message: 'Workspace name must be less than 50 characters',
      code: 'MAX_LENGTH'
    })
  }

  if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
    errors.push({
      field: 'name',
      message: 'Workspace name can only contain letters, numbers, spaces, hyphens, and underscores',
      code: 'INVALID_CHARACTERS'
    })
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  return emailRegex.test(email) && email.length <= 254
}

/**
 * Client-side utilities for browser usage
 */
export const WorkspaceClientUtils = {
  /**
   * Switch workspace context on client
   */
  async switchWorkspace(workspaceId: string): Promise<boolean> {
    try {
      const supabase = createClientClient()
      
      // Update user metadata with current workspace
      const { error } = await supabase.auth.updateUser({
        data: { current_workspace_id: workspaceId }
      })

      if (error) {
        console.error('Error switching workspace:', error)
        return false
      }

      // Store in localStorage for persistence
      localStorage.setItem('current-workspace-id', workspaceId)
      
      return true
    } catch (error) {
      console.error('Error switching workspace:', error)
      return false
    }
  },

  /**
   * Get current workspace from localStorage
   */
  getCurrentWorkspaceId(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('current-workspace-id')
  },

  /**
   * Clear workspace context
   */
  clearWorkspaceContext(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem('current-workspace-id')
  }
}

export default {
  validateWorkspaceAccess,
  getUserWorkspaces,
  createWorkspace,
  inviteUserToWorkspace,
  updateMemberRole,
  removeMemberFromWorkspace,
  hasPermission,
  getRolePermissions,
  canAssignRole,
  validateWorkspaceName,
  isValidUUID,
  isValidEmail,
  WorkspaceClientUtils,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS
}