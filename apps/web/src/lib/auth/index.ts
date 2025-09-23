/**
 * COMPREHENSIVE AUTHENTICATION SYSTEM
 * 
 * This is the main entry point for the authentication system.
 * It exports all components, utilities, and types for clean imports.
 */

// Core authentication utilities
// export * from './utils'
// export * from './validation'
// export * from './production-auth'
// export * from './client-utils'

// Explicit exports to avoid naming conflicts
export { 
  getAuthContext
} from './utils'

export {
  validateFormData,
  generateCSRFToken
} from './validation'

// Authentication wrappers and guards
// export * from './auth-wrappers'

// API middleware and protection  
// export * from './api-middleware'
// export * from './workspace-middleware'

// Session management
// export * from './session-management'

// Security monitoring and audit
// export * from './security-monitoring'

// Workspace utilities
// export * from './workspace-utils'

// Type definitions
// export * from './types'

// Re-export types from Supabase for convenience
export type { 
  AuthUser, 
  AuthContext, 
  WorkspaceMember,
  Workspace,
  WorkspaceRole
} from './types'

// Default exports for common use cases
export { default as AuthWrappers } from './auth-wrappers'
export { default as ApiMiddleware } from './api-middleware'
export { default as WorkspaceUtils } from './workspace-utils'
export { default as SecurityMonitor, getSecurityMonitor, SecurityLogger } from './security-monitoring'
export { getSessionManager, SessionUtils } from './session-management'

// Common authentication utilities for easy access
export {
  // Production auth functions
  getProductionAuthContext,
  getUserAuthContext,
  hasWorkspaceRole
} from './production-auth'

export {
  // API middleware functions
  withApiProtection,
  withAuth as withApiAuth,
  withWorkspaceAuth as withApiWorkspaceAuth,
  withAdminAuth,
  createSuccessResponse,
  createErrorResponse
} from './api-middleware'

// export {
//   // Client authentication guards
//   withAuth as withClientAuth,
//   withWorkspaceAuth as withClientWorkspaceAuth,
//   AuthGuard,
//   ProtectedContent,
//   WorkspaceGuard,
//   useAccessControl,
//   useAuthGuard,
//   useRoleBasedAccess,
//   withPageAuth
// } from './auth-wrappers'

// export {
//   // Workspace utilities
//   validateWorkspaceAccess,
//   getUserWorkspaces,
//   createWorkspace,
//   inviteUserToWorkspace,
//   updateMemberRole,
//   removeMemberFromWorkspace,
//   hasPermission,
//   getRolePermissions,
//   canAssignRole,
//   ROLE_HIERARCHY,
//   ROLE_PERMISSIONS
// } from './workspace-utils'

// export {
//   // Client security utilities
//   checkRateLimit,
//   sanitizeAuthInput,
//   validateEmail,
//   validatePassword
// } from './client-utils'