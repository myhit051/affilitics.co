import { createClient, createServiceClient } from '@/lib/supabase/server'
import { AuthUser, WorkspaceMember } from '@/lib/supabase/types'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import jwt from 'jsonwebtoken'

// Security: Rate limiting storage (in production, use Redis)
const authAttempts = new Map<string, { count: number; lastAttempt: number }>()

export class AuthSecurityError extends Error {
  constructor(message: string, public code: string, public statusCode: number = 401) {
    super(message)
    this.name = 'AuthSecurityError'
  }
}

// Security: Rate limiting for authentication attempts
export function checkRateLimit(identifier: string, maxAttempts = 5, windowMs = 15 * 60 * 1000): void {
  const now = Date.now()
  const attempts = authAttempts.get(identifier) || { count: 0, lastAttempt: now }

  // Reset attempts if window has passed
  if (now - attempts.lastAttempt > windowMs) {
    attempts.count = 0
    attempts.lastAttempt = now
  }

  if (attempts.count >= maxAttempts) {
    const timeLeft = Math.ceil((windowMs - (now - attempts.lastAttempt)) / 1000 / 60)
    throw new AuthSecurityError(
      `Too many authentication attempts. Try again in ${timeLeft} minutes.`,
      'RATE_LIMITED',
      429
    )
  }

  attempts.count++
  attempts.lastAttempt = now
  authAttempts.set(identifier, attempts)
}

// Security: Validate and verify JWT token with proper cryptographic verification
export function validateJWTToken(token: string): AuthUser {
  try {
    // Get JWT secret from environment (this should be the same secret used by Supabase)
    const jwtSecret = process.env.SUPABASE_JWT_SECRET || process.env.NEXTAUTH_SECRET
    
    if (!jwtSecret) {
      throw new AuthSecurityError('JWT secret not configured', 'CONFIG_ERROR', 500)
    }

    // Security: Use jwt.verify() instead of jwt.decode() to prevent token tampering
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'], // Explicitly specify allowed algorithms
      issuer: 'supabase', // Validate issuer
      complete: false // Return payload only
    }) as any
    
    if (!decoded || typeof decoded !== 'object') {
      throw new AuthSecurityError('Invalid token format', 'INVALID_TOKEN')
    }

    // Security: Token expiration is automatically checked by jwt.verify()
    // But we can add additional checks if needed
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      throw new AuthSecurityError('Token expired', 'TOKEN_EXPIRED')
    }

    // Security: Validate required fields
    if (!decoded.sub || !decoded.email || !decoded.aud) {
      throw new AuthSecurityError('Missing required token claims', 'INVALID_CLAIMS')
    }

    // Security: Validate audience claim
    if (!decoded.aud.includes('authenticated')) {
      throw new AuthSecurityError('Invalid token audience', 'INVALID_AUDIENCE')
    }

    return {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role || 'user',
      aud: decoded.aud,
      exp: decoded.exp
    }
  } catch (error) {
    if (error instanceof AuthSecurityError) {
      throw error
    }
    
    // Handle specific JWT errors
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthSecurityError('Invalid token signature', 'INVALID_SIGNATURE')
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthSecurityError('Token expired', 'TOKEN_EXPIRED')
    }
    if (error instanceof jwt.NotBeforeError) {
      throw new AuthSecurityError('Token not active yet', 'TOKEN_NOT_ACTIVE')
    }
    
    throw new AuthSecurityError('Token validation failed', 'TOKEN_INVALID')
  }
}

// Security: Get authenticated user with proper validation
export async function getAuthenticatedUser(): Promise<AuthUser> {
  const supabase = createClient()
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      throw new AuthSecurityError('Authentication required', 'UNAUTHENTICATED')
    }

    return {
      id: user.id,
      email: user.email!,
      role: user.user_metadata?.role,
      aud: user.aud,
      exp: (user as any).exp || 0
    }
  } catch (error) {
    if (error instanceof AuthSecurityError) {
      throw error
    }
    throw new AuthSecurityError('Failed to get authenticated user', 'AUTH_ERROR')
  }
}

// Security: Get workspace membership with authorization check
export async function getWorkspaceMembership(userId: string, workspaceId: string): Promise<WorkspaceMember> {
  const supabase = createServiceClient()
  
  try {
    const { data, error } = await supabase
      .from('members')
      .select(`
        id,
        user_id,
        workspace_id,
        role,
        workspace:workspaces(id, name, plan)
      `)
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .single()

    if (error || !data) {
      throw new AuthSecurityError('Access denied to workspace', 'WORKSPACE_ACCESS_DENIED', 403)
    }

    return data as unknown as WorkspaceMember
  } catch (error) {
    if (error instanceof AuthSecurityError) {
      throw error
    }
    throw new AuthSecurityError('Failed to verify workspace access', 'WORKSPACE_ERROR')
  }
}

// Security: Comprehensive auth context with workspace validation
export async function getAuthContext(): Promise<{
  user: AuthUser
  workspace: WorkspaceMember
  workspaceId: string
}> {
  const headersList = headers()
  const workspaceId = headersList.get('x-workspace-id')

  if (!workspaceId) {
    throw new AuthSecurityError('Workspace ID required', 'MISSING_WORKSPACE_ID', 400)
  }

  const user = await getAuthenticatedUser()
  const workspace = await getWorkspaceMembership(user.id, workspaceId)

  return {
    user,
    workspace,
    workspaceId
  }
}

// Security: Role-based access control
export function requireRole(userRole: string, requiredRoles: string[]): void {
  if (!requiredRoles.includes(userRole)) {
    throw new AuthSecurityError(
      `Insufficient permissions. Required: ${requiredRoles.join(' or ')}`,
      'INSUFFICIENT_PERMISSIONS',
      403
    )
  }
}

// Security: Input sanitization for auth-related inputs
export function sanitizeAuthInput(input: string): string {
  if (typeof input !== 'string') {
    throw new AuthSecurityError('Invalid input type', 'INVALID_INPUT', 400)
  }

  // Remove potentially harmful characters
  return input
    .trim()
    .replace(/[<>'"&]/g, '') // Basic XSS protection
    .slice(0, 255) // Limit length
}

// Security: Validate email format with strict regex
export function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  return emailRegex.test(email) && email.length <= 254
}

// Security: Validate password strength
export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long')
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character')
  }

  // Security: Check for common weak passwords
  const commonPasswords = ['password', '123456', 'password123', 'admin', 'qwerty']
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    errors.push('Password contains common weak patterns')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

// Security: Session management utilities
export async function invalidateUserSessions(userId: string): Promise<void> {
  const supabase = createServiceClient()
  
  try {
    // This would typically involve invalidating all sessions for the user
    // Implementation depends on your session management strategy
    await supabase.auth.admin.signOut(userId, 'global')
  } catch (error) {
    // Log error but don't throw to avoid breaking the calling flow
    console.error('Failed to invalidate user sessions:', error)
  }
}

// Security: Redirect helpers with proper validation
export function redirectToLogin(callbackUrl?: string): never {
  const params = new URLSearchParams()
  if (callbackUrl) {
    // Security: Validate callback URL to prevent open redirects
    const url = new URL(callbackUrl, process.env.NEXTAUTH_URL || 'http://localhost:3000')
    if (url.origin === (process.env.NEXTAUTH_URL || 'http://localhost:3000')) {
      params.set('callbackUrl', callbackUrl)
    }
  }

  const loginUrl = `/auth/login${params.toString() ? `?${params.toString()}` : ''}`
  redirect(loginUrl)
}

export function redirectToDashboard(workspaceId?: string): never {
  const dashboardUrl = workspaceId ? `/workspace/${workspaceId}` : '/workspaces'
  redirect(dashboardUrl)
}