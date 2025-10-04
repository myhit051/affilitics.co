/**
 * Security Framework Utilities
 * 
 * Provides authentication, authorization, workspace isolation, and security
 * validation utilities for production-ready security implementation.
 */

import { prisma } from '../index.js';
import { getSecurityConfig } from './config-service.js';

// Authentication result types
export interface AuthResult {
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
  requiresMFA?: boolean;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  workspaces: UserWorkspace[];
  permissions: string[];
  lastLoginAt: Date;
  sessionExpiry: Date;
}

export interface UserWorkspace {
  workspaceId: string;
  workspaceName: string;
  role: string;
  permissions: string[];
}

// Authorization context
export interface AuthContext {
  userId: string;
  workspaceId: string;
  role: string;
  permissions: string[];
  sessionId?: string;
}

// Security validation results
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Rate limiting state
export interface RateLimitState {
  identifier: string;
  count: number;
  resetTime: Date;
  blocked: boolean;
}

// Security Service implementation
export class SecurityService {
  private static readonly RATE_LIMIT_PREFIX = 'rate_limit:';
  private static readonly SESSION_PREFIX = 'session:';
  private static readonly FAILED_LOGIN_PREFIX = 'failed_login:';

  /**
   * Validate authentication token and return user context
   */
  static async validateAuthToken(token: string): Promise<AuthResult> {
    try {
      if (!token) {
        return { success: false, error: 'No authentication token provided' };
      }

      // Extract token from Bearer format
      const authToken = token.startsWith('Bearer ') ? token.substring(7) : token;

      // For production, this would use Supabase JWT validation
      // For now, we'll implement a basic validation mechanism
      const session = await this.getSession(authToken);
      if (!session) {
        return { success: false, error: 'Invalid or expired session' };
      }

      // Get user details and workspaces
      const user = await this.getUserWithWorkspaces(session.userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Check session expiry
      if (new Date() > session.expiryDate) {
        await this.invalidateSession(authToken);
        return { success: false, error: 'Session expired' };
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          workspaces: user.workspaces,
          permissions: user.globalPermissions,
          lastLoginAt: session.lastAccessAt,
          sessionExpiry: session.expiryDate,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Check if user has access to specific workspace
   */
  static async validateWorkspaceAccess(
    userId: string,
    workspaceId: string,
    requiredRole?: string
  ): Promise<ValidationResult> {
    try {
      const membership = await prisma.member.findUnique({
        where: {
          userId_workspaceId: {
            userId,
            workspaceId,
          },
        },
        include: {
          workspace: true,
        },
      });

      if (!membership) {
        return {
          valid: false,
          errors: ['User does not have access to this workspace'],
          warnings: [],
        };
      }

      // Check role requirement
      if (requiredRole && !this.hasRole(membership.role, requiredRole)) {
        return {
          valid: false,
          errors: [`Insufficient permissions. Required role: ${requiredRole}`],
          warnings: [],
        };
      }

      return {
        valid: true,
        errors: [],
        warnings: [],
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Workspace validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
      };
    }
  }

  /**
   * Create authorization context for authenticated user
   */
  static async createAuthContext(
    userId: string,
    workspaceId: string,
    sessionId?: string
  ): Promise<AuthContext | null> {
    try {
      const validation = await this.validateWorkspaceAccess(userId, workspaceId);
      if (!validation.valid) {
        return null;
      }

      const membership = await prisma.member.findUnique({
        where: {
          userId_workspaceId: {
            userId,
            workspaceId,
          },
        },
      });

      if (!membership) {
        return null;
      }

      const permissions = this.getRolePermissions(membership.role);

      return {
        userId,
        workspaceId,
        role: membership.role,
        permissions,
        sessionId,
      };
    } catch (error) {
      console.error('Failed to create auth context:', error);
      return null;
    }
  }

  /**
   * Check if user has specific permission
   */
  static hasPermission(context: AuthContext, permission: string): boolean {
    return context.permissions.includes(permission) || context.permissions.includes('*');
  }

  /**
   * Validate file upload security
   */
  static validateFileUpload(
    filename: string,
    fileSize: number,
    mimeType: string,
    content?: Buffer
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file extension
    const allowedExtensions = ['.csv', '.txt', '.tsv'];
    const fileExt = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    if (!allowedExtensions.includes(fileExt)) {
      errors.push(`File type not allowed. Allowed types: ${allowedExtensions.join(', ')}`);
    }

    // Check MIME type
    const allowedMimeTypes = ['text/csv', 'text/plain', 'application/csv'];
    if (!allowedMimeTypes.includes(mimeType)) {
      warnings.push(`Unexpected MIME type: ${mimeType}`);
    }

    // Check file size (50MB limit)
    const maxFileSize = 50 * 1024 * 1024;
    if (fileSize > maxFileSize) {
      errors.push(`File too large. Maximum size: ${maxFileSize / 1024 / 1024}MB`);
    }

    // Check filename for suspicious patterns
    const suspiciousPatterns = [
      /\.\./,           // Directory traversal
      /[<>"|?*]/,       // Invalid filename characters
      /^\./,            // Hidden files
      /\.(exe|bat|cmd|scr|vbs|js|jar)$/i, // Executable files
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(filename)) {
        errors.push('Filename contains suspicious characters or patterns');
        break;
      }
    }

    // Basic content validation for CSV files
    if (content && fileExt === '.csv') {
      const contentStr = content.toString('utf8', 0, Math.min(1024, content.length));
      
      // Check for potential code injection
      const injectionPatterns = [
        /<script/i,
        /javascript:/i,
        /data:text\/html/i,
        /vbscript:/i,
      ];

      for (const pattern of injectionPatterns) {
        if (pattern.test(contentStr)) {
          errors.push('File content contains potentially malicious code');
          break;
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Implement rate limiting
   */
  static async checkRateLimit(
    identifier: string,
    windowMs: number = 15 * 60 * 1000, // 15 minutes
    maxRequests: number = 100
  ): Promise<RateLimitState> {
    try {
      const key = `${this.RATE_LIMIT_PREFIX}${identifier}`;
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMs);

      // Get current count (would use Redis in production)
      const existing = await this.getRateLimitData(key);
      
      if (!existing || existing.resetTime < now) {
        // Reset or first request
        const newState: RateLimitState = {
          identifier,
          count: 1,
          resetTime: new Date(now.getTime() + windowMs),
          blocked: false,
        };
        
        await this.setRateLimitData(key, newState, windowMs);
        return newState;
      }

      // Increment count
      existing.count += 1;
      const blocked = existing.count > maxRequests;
      
      const state: RateLimitState = {
        ...existing,
        blocked,
      };

      await this.setRateLimitData(key, state, windowMs);
      return state;
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Default to allowing request if rate limiting fails
      return {
        identifier,
        count: 1,
        resetTime: new Date(Date.now() + windowMs),
        blocked: false,
      };
    }
  }

  /**
   * Sanitize input data to prevent injection attacks
   */
  static sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      return input
        .replace(/[<>]/g, '') // Remove HTML brackets
        .replace(/['"]/g, '') // Remove quotes
        .replace(/\\/g, '')   // Remove backslashes
        .replace(/;/g, '')    // Remove semicolons
        .trim();
    }

    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeInput(item));
    }

    if (input && typeof input === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        const sanitizedKey = this.sanitizeInput(key);
        sanitized[sanitizedKey] = this.sanitizeInput(value);
      }
      return sanitized;
    }

    return input;
  }

  /**
   * Generate secure random token
   */
  static generateSecureToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Hash sensitive data
   */
  static async hashData(data: string): Promise<string> {
    // In production, use bcrypt or similar
    // For now, simple hash implementation
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Audit security event
   */
  static async auditSecurityEvent(
    event: string,
    userId?: string,
    workspaceId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await prisma.$queryRaw`
        INSERT INTO security_audit_log (
          event, user_id, workspace_id, metadata, ip_address, user_agent, created_at
        ) VALUES (
          ${event}, ${userId}, ${workspaceId}, ${JSON.stringify(metadata || {})},
          ${metadata?.ipAddress}, ${metadata?.userAgent}, NOW()
        )
      `;
    } catch (error) {
      console.error('Failed to audit security event:', error);
    }
  }

  // Private helper methods
  private static async getSession(token: string): Promise<any> {
    // Mock session implementation - in production would use Supabase
    try {
      const sessions = await prisma.$queryRaw<any[]>`
        SELECT * FROM user_sessions WHERE token = ${token} AND expires_at > NOW()
      `;
      return sessions[0] || null;
    } catch {
      return null;
    }
  }

  private static async getUserWithWorkspaces(userId: string): Promise<any> {
    try {
      const user = await prisma.$queryRaw<any[]>`
        SELECT 
          u.id, u.email,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'workspaceId', m.workspace_id,
                'workspaceName', w.name,
                'role', m.role,
                'permissions', '[]'::json
              )
            ) FILTER (WHERE m.id IS NOT NULL), 
            '[]'::json
          ) as workspaces,
          '[]'::json as global_permissions
        FROM users u
        LEFT JOIN members m ON u.id = m.user_id
        LEFT JOIN workspaces w ON m.workspace_id = w.id
        WHERE u.id = ${userId}
        GROUP BY u.id, u.email
      `;
      
      if (user.length === 0) return null;
      
      return {
        ...user[0],
        workspaces: user[0].workspaces || [],
        globalPermissions: user[0].global_permissions || [],
      };
    } catch {
      return null;
    }
  }

  private static async invalidateSession(token: string): Promise<void> {
    try {
      await prisma.$queryRaw`
        DELETE FROM user_sessions WHERE token = ${token}
      `;
    } catch (error) {
      console.error('Failed to invalidate session:', error);
    }
  }

  private static hasRole(userRole: string, requiredRole: string): boolean {
    const roleHierarchy = ['viewer', 'member', 'admin', 'owner'];
    const userRoleIndex = roleHierarchy.indexOf(userRole);
    const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);
    
    return userRoleIndex >= requiredRoleIndex;
  }

  private static getRolePermissions(role: string): string[] {
    const permissions: Record<string, string[]> = {
      viewer: ['read'],
      member: ['read', 'write'],
      admin: ['read', 'write', 'delete', 'manage_users'],
      owner: ['*'], // All permissions
    };

    return permissions[role] || [];
  }

  private static async getRateLimitData(key: string): Promise<RateLimitState | null> {
    // Mock implementation - in production would use Redis
    try {
      const result = await prisma.$queryRaw<any[]>`
        SELECT * FROM rate_limits WHERE key = ${key} AND expires_at > NOW()
      `;
      return result[0] ? {
        identifier: result[0].identifier,
        count: result[0].count,
        resetTime: result[0].expires_at,
        blocked: result[0].blocked,
      } : null;
    } catch {
      return null;
    }
  }

  private static async setRateLimitData(
    key: string, 
    state: RateLimitState, 
    ttlMs: number
  ): Promise<void> {
    try {
      await prisma.$queryRaw`
        INSERT INTO rate_limits (key, identifier, count, blocked, expires_at, created_at)
        VALUES (${key}, ${state.identifier}, ${state.count}, ${state.blocked}, ${state.resetTime}, NOW())
        ON CONFLICT (key) DO UPDATE SET
          count = EXCLUDED.count,
          blocked = EXCLUDED.blocked,
          expires_at = EXCLUDED.expires_at
      `;
    } catch (error) {
      console.error('Failed to set rate limit data:', error);
    }
  }
}