/**
 * COMPREHENSIVE AUTHENTICATION TYPE DEFINITIONS
 * 
 * This module provides all TypeScript types and interfaces
 * for the authentication and authorization system.
 */

import { User, Session, AuthError } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

// =============================================================================
// CORE AUTHENTICATION TYPES
// =============================================================================

export interface AuthUser {
  id: string
  email: string
  name?: string | null
  role?: string
  aud: string
  exp: number
  emailVerified?: boolean
  lastSignIn?: string
  metadata?: Record<string, any>
}

export interface AuthSession {
  user: AuthUser
  accessToken: string
  refreshToken: string
  expiresAt: number
  isValid: boolean
}

export interface AuthContext {
  user: AuthUser | null
  session: Session | null
  workspaceId: string | null
  role: string | null
  permissions: string[]
  isLoading: boolean
  isAuthenticated: boolean
  hasWorkspace: boolean
}

// =============================================================================
// WORKSPACE TYPES
// =============================================================================

export interface Workspace {
  id: string
  name: string
  plan: string
  createdAt: string
  updatedAt: string
  settings?: WorkspaceSettings
  metadata?: Record<string, any>
}

export interface WorkspaceSettings {
  features: string[]
  limits: {
    maxUsers: number
    maxProjects: number
    storageLimit: number
  }
  security: {
    requireMFA: boolean
    passwordPolicy: PasswordPolicy
    sessionTimeout: number
    ipWhitelist?: string[]
  }
  notifications: {
    email: boolean
    slack?: string
    webhook?: string
  }
}

export interface WorkspaceMember {
  id: string
  userId: string
  workspaceId: string
  role: WorkspaceRole
  status: MemberStatus
  invitedBy?: string
  invitedAt?: string
  joinedAt?: string
  lastActive?: string
  permissions?: string[]
  workspace: {
    id: string
    name: string
    plan: string
  }
}

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'
export type MemberStatus = 'active' | 'invited' | 'suspended' | 'left'

// =============================================================================
// PERMISSION TYPES
// =============================================================================

export interface Permission {
  id: string
  name: string
  description: string
  category: PermissionCategory
  scope: PermissionScope
}

export type PermissionCategory = 
  | 'workspace'
  | 'users'
  | 'data'
  | 'analytics'
  | 'settings'
  | 'billing'
  | 'admin'

export type PermissionScope = 'read' | 'write' | 'delete' | 'admin'

export interface RolePermissions {
  role: WorkspaceRole
  permissions: string[]
  inherits?: WorkspaceRole[]
}

// =============================================================================
// AUTHENTICATION FLOW TYPES
// =============================================================================

export interface LoginCredentials {
  email: string
  password: string
  rememberMe?: boolean
  captcha?: string
}

export interface RegisterCredentials {
  email: string
  password: string
  fullName?: string
  terms: boolean
  newsletter?: boolean
  referralCode?: string
}

export interface ResetPasswordRequest {
  email: string
  captcha?: string
}

export interface UpdatePasswordRequest {
  currentPassword?: string
  newPassword: string
  confirmPassword: string
}

export interface AuthResponse<T = any> {
  success: boolean
  data?: T
  error?: AuthError
  message?: string
  requiresVerification?: boolean
  redirectTo?: string
}

// =============================================================================
// SECURITY TYPES
// =============================================================================

export interface SecurityConfig {
  enableMFA: boolean
  requireEmailVerification: boolean
  passwordPolicy: PasswordPolicy
  sessionConfig: SessionConfig
  rateLimiting: RateLimitConfig
  csrfProtection: CSRFConfig
}

export interface PasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
  prohibitCommonPasswords: boolean
  maxAge?: number // days
  preventReuse?: number // last N passwords
}

export interface SessionConfig {
  maxAge: number // seconds
  refreshThreshold: number // seconds before expiry
  autoRefresh: boolean
  secureCookies: boolean
  sameSite: 'strict' | 'lax' | 'none'
  domain?: string
}

export interface RateLimitConfig {
  enabled: boolean
  requests: number
  windowMs: number
  skipSuccessfulRequests: boolean
  skipFailedRequests: boolean
  keyGenerator?: (request: NextRequest) => string
}

export interface CSRFConfig {
  enabled: boolean
  tokenExpiry: number
  cookieName: string
  headerName: string
  enableDoubleSubmit: boolean
  enableOriginValidation: boolean
}

// =============================================================================
// API MIDDLEWARE TYPES
// =============================================================================

export interface ApiMiddlewareOptions {
  requireAuth?: boolean
  requireWorkspace?: boolean
  requireCSRF?: boolean
  allowedMethods?: string[]
  allowedRoles?: WorkspaceRole[]
  requiredPermissions?: string[]
  rateLimit?: {
    requests: number
    windowMs: number
    keyGenerator?: (request: NextRequest) => string
  }
  corsOptions?: CorsOptions
  logRequests?: boolean
  enableMetrics?: boolean
  enableSecurity?: boolean
}

export interface CorsOptions {
  origin?: string | string[] | boolean
  credentials?: boolean
  methods?: string[]
  allowedHeaders?: string[]
  exposedHeaders?: string[]
  maxAge?: number
  preflightContinue?: boolean
  optionsSuccessStatus?: number
}

export interface ApiContext {
  user: User | null
  workspaceId: string | null
  userRole: WorkspaceRole | null
  permissions: string[]
  request: NextRequest
  supabase: any // Supabase client
  requestId: string
  startTime: number
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
    statusCode?: number
  }
  metadata?: {
    timestamp: string
    requestId: string
    processingTime?: number
    version?: string
  }
  pagination?: {
    page: number
    limit: number
    total: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public code: string = 'AUTH_ERROR',
    public statusCode: number = 401,
    public details?: any
  ) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public code: string = 'AUTHZ_ERROR',
    public statusCode: number = 403,
    public details?: any
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public code: string = 'VALIDATION_ERROR',
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export type AuthEventType = 
  | 'sign_in'
  | 'sign_out'
  | 'sign_up'
  | 'password_reset'
  | 'password_change'
  | 'email_verification'
  | 'mfa_enable'
  | 'mfa_disable'
  | 'session_refresh'
  | 'account_lock'
  | 'account_unlock'

export interface AuthEvent {
  type: AuthEventType
  userId?: string
  workspaceId?: string
  timestamp: string
  ip?: string
  userAgent?: string
  success: boolean
  error?: string
  metadata?: Record<string, any>
}

export type WorkspaceEventType = 
  | 'workspace_created'
  | 'workspace_updated'
  | 'workspace_deleted'
  | 'member_invited'
  | 'member_joined'
  | 'member_removed'
  | 'role_changed'
  | 'settings_updated'

export interface WorkspaceEvent {
  type: WorkspaceEventType
  workspaceId: string
  userId?: string
  actorId: string
  timestamp: string
  changes?: Record<string, { from: any; to: any }>
  metadata?: Record<string, any>
}

// =============================================================================
// VALIDATION TYPES
// =============================================================================

export interface ValidationRule {
  field: string
  rules: ValidationRuleType[]
  message?: string
}

export type ValidationRuleType = 
  | { type: 'required' }
  | { type: 'email' }
  | { type: 'min'; value: number }
  | { type: 'max'; value: number }
  | { type: 'pattern'; value: RegExp }
  | { type: 'custom'; validator: (value: any) => boolean | string }

export interface ValidationResult {
  isValid: boolean
  errors: ValidationFieldError[]
}

export interface ValidationFieldError {
  field: string
  message: string
  code: string
}

// =============================================================================
// HOOK TYPES
// =============================================================================

export interface UseAuthReturn {
  user: AuthUser | null
  session: Session | null
  workspaceId: string | null
  role: WorkspaceRole | null
  isLoading: boolean
  isAuthenticated: boolean
  hasWorkspace: boolean
  signIn: (credentials: LoginCredentials) => Promise<AuthResponse>
  signUp: (credentials: RegisterCredentials) => Promise<AuthResponse>
  signOut: () => Promise<AuthResponse>
  resetPassword: (request: ResetPasswordRequest) => Promise<AuthResponse>
  updatePassword: (request: UpdatePasswordRequest) => Promise<AuthResponse>
  refreshSession: () => Promise<void>
  setWorkspace: (workspace: WorkspaceMember) => void
  clearWorkspace: () => void
}

export interface UseWorkspaceReturn {
  workspace: Workspace | null
  members: WorkspaceMember[]
  currentMember: WorkspaceMember | null
  isLoading: boolean
  hasAccess: boolean
  userRole: WorkspaceRole | null
  permissions: string[]
  canInvite: boolean
  canManage: boolean
  switchWorkspace: (workspaceId: string) => Promise<void>
  inviteMember: (email: string, role: WorkspaceRole) => Promise<void>
  updateMemberRole: (memberId: string, role: WorkspaceRole) => Promise<void>
  removeMember: (memberId: string) => Promise<void>
}

// =============================================================================
// COMPONENT PROP TYPES
// =============================================================================

export interface AuthGuardProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  loadingComponent?: React.ReactNode
  errorComponent?: React.ReactNode
  redirectTo?: string
  requireAuth?: boolean
  requireWorkspace?: boolean
  requiredRole?: WorkspaceRole | WorkspaceRole[]
  requiredPermissions?: string[]
  showFallback?: boolean
  onAccessDenied?: (reason: string) => void
  onAuthenticated?: () => void
}

export interface ProtectedRouteProps {
  children: React.ReactNode
  requireAuth?: boolean
  requireWorkspace?: boolean
  requiredRole?: WorkspaceRole | WorkspaceRole[]
  requiredPermissions?: string[]
  redirectTo?: string
  fallback?: React.ReactNode
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type Nullable<T> = T | null
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

// Generic response wrapper
export type ServiceResponse<T> = Promise<{
  data: T | null
  error: Error | null
  success: boolean
}>

// Configuration types
export interface AuthModuleConfig {
  security: SecurityConfig
  features: {
    enableMFA: boolean
    enableOAuth: boolean
    enableSSO: boolean
    enablePasswordless: boolean
  }
  ui: {
    theme: 'light' | 'dark' | 'auto'
    branding: {
      logo?: string
      primaryColor?: string
      companyName?: string
    }
  }
  integrations: {
    email?: {
      provider: string
      config: Record<string, any>
    }
    sms?: {
      provider: string
      config: Record<string, any>
    }
    analytics?: {
      provider: string
      config: Record<string, any>
    }
  }
}

// Export utility type helpers
export type AuthProviderState = UseAuthReturn
export type WorkspaceContextState = UseWorkspaceReturn

// Re-export Supabase types for convenience
export type { User, Session, AuthError } from '@supabase/supabase-js'