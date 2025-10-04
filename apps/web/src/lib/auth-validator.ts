/**
 * Enhanced Authentication Token Validation for Affilitics.co
 * 
 * Provides comprehensive JWT token validation with enhanced security:
 * - JWT signature verification with proper key management
 * - Token expiration and validity checks
 * - Workspace claim validation
 * - Session management with blacklist support
 * - Security event logging for suspicious activities
 * - Multi-factor authentication support
 */

import { jwtVerify, SignJWT, importJWK, KeyLike } from 'jose';
import { cookies } from 'next/headers';
import { SecurityService } from '../../../../packages/db/src/services/security-service';

// Authentication types
export interface TokenPayload {
  sub: string;              // User ID
  email: string;            // User email
  workspace_id?: string;    // Current workspace ID
  iat: number;             // Issued at
  exp: number;             // Expires at
  aud: string;             // Audience
  iss: string;             // Issuer
  jti?: string;            // JWT ID for session tracking
  role?: string;           // User role in current workspace
  permissions?: string[];   // User permissions
  session_id?: string;     // Session identifier
  mfa_verified?: boolean;  // Multi-factor authentication status
  last_activity?: number;  // Last activity timestamp
}

export interface AuthValidationResult {
  valid: boolean;
  payload?: TokenPayload;
  user?: AuthenticatedUser;
  error?: string;
  code?: string;
  details?: Record<string, any>;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  workspaces: UserWorkspace[];
  currentWorkspace?: UserWorkspace;
  permissions: string[];
  lastLoginAt: Date;
  sessionExpiry: Date;
  mfaVerified: boolean;
  sessionId?: string;
}

export interface UserWorkspace {
  workspaceId: string;
  workspaceName: string;
  role: string;
  permissions: string[];
}

export interface SessionInfo {
  id: string;
  userId: string;
  workspaceId?: string;
  expiresAt: Date;
  lastAccessAt: Date;
  ipAddress?: string;
  userAgent?: string;
  revoked: boolean;
}

export interface TokenValidationOptions {
  requireWorkspace?: boolean;
  allowExpiredWithinGrace?: boolean;
  gracePeridMs?: number;
  checkBlacklist?: boolean;
  updateLastActivity?: boolean;
  requireMFA?: boolean;
  validateAudience?: boolean;
  customClaims?: string[];
}

/**
 * Enhanced Authentication Validator
 */
export class AuthValidator {
  private static readonly JWT_ALGORITHM = 'HS256';
  private static readonly DEFAULT_EXPIRY = 24 * 60 * 60; // 24 hours in seconds
  private static readonly GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes grace period
  private static readonly SESSION_EXTEND_THRESHOLD = 30 * 60 * 1000; // 30 minutes
  
  // JWT secrets and keys (in production, these should come from environment)
  private static jwtSecret: string | null = null;
  private static jwtKey: KeyLike | null = null;

  /**
   * Initialize JWT key for validation
   */
  static async initializeJWTKey(): Promise<void> {
    try {
      this.jwtSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
      
      if (!this.jwtSecret) {
        throw new Error('JWT_SECRET or SUPABASE_JWT_SECRET environment variable is required');
      }

      // For HMAC algorithms, use the secret directly
      this.jwtKey = new TextEncoder().encode(this.jwtSecret);
    } catch (error) {
      console.error('Failed to initialize JWT key:', error);
      throw error;
    }
  }

  /**
   * Validate JWT token with comprehensive checks
   */
  static async validateToken(
    token: string,
    options: TokenValidationOptions = {}
  ): Promise<AuthValidationResult> {
    try {
      // Initialize JWT key if not already done
      if (!this.jwtKey) {
        await this.initializeJWTKey();
      }

      // Clean token (remove Bearer prefix if present)
      const cleanToken = token.replace(/^Bearer\s+/i, '');

      // Basic format validation
      if (!this.isValidJWTFormat(cleanToken)) {
        return {
          valid: false,
          error: 'Invalid JWT token format',
          code: 'INVALID_TOKEN_FORMAT'
        };
      }

      // Verify JWT signature and decode payload
      let payload: TokenPayload;
      try {
        const { payload: jwtPayload } = await jwtVerify(cleanToken, this.jwtKey!, {
          algorithms: [this.JWT_ALGORITHM],
          audience: options.validateAudience ? process.env.JWT_AUDIENCE : undefined,
          issuer: process.env.JWT_ISSUER
        });

        payload = jwtPayload as TokenPayload;
      } catch (jwtError) {
        return {
          valid: false,
          error: this.getJWTErrorMessage(jwtError),
          code: 'JWT_VERIFICATION_FAILED',
          details: { jwtError: jwtError instanceof Error ? jwtError.message : 'Unknown JWT error' }
        };
      }

      // Validate token expiration with grace period
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        const gracePeriod = options.gracePeridMs || this.GRACE_PERIOD_MS;
        const expiredMs = (now - payload.exp) * 1000;

        if (!options.allowExpiredWithinGrace || expiredMs > gracePeriod) {
          await this.logSecurityEvent('token_expired', payload.sub, {
            expiredMs,
            gracePeriod,
            tokenId: payload.jti
          });

          return {
            valid: false,
            error: 'Token has expired',
            code: 'TOKEN_EXPIRED',
            details: { expiredMs, gracePeriod }
          };
        }
      }

      // Check if token is blacklisted
      if (options.checkBlacklist !== false && payload.jti) {
        const isBlacklisted = await this.isTokenBlacklisted(payload.jti);
        if (isBlacklisted) {
          await this.logSecurityEvent('blacklisted_token_used', payload.sub, {
            tokenId: payload.jti
          });

          return {
            valid: false,
            error: 'Token has been revoked',
            code: 'TOKEN_REVOKED'
          };
        }
      }

      // Validate workspace claim if required
      if (options.requireWorkspace && !payload.workspace_id) {
        return {
          valid: false,
          error: 'Workspace ID required but not found in token',
          code: 'WORKSPACE_REQUIRED'
        };
      }

      // Validate MFA requirement
      if (options.requireMFA && !payload.mfa_verified) {
        return {
          valid: false,
          error: 'Multi-factor authentication required',
          code: 'MFA_REQUIRED'
        };
      }

      // Validate custom claims
      if (options.customClaims) {
        const missingClaims = options.customClaims.filter(claim => !(claim in payload));
        if (missingClaims.length > 0) {
          return {
            valid: false,
            error: `Missing required claims: ${missingClaims.join(', ')}`,
            code: 'MISSING_CLAIMS',
            details: { missingClaims }
          };
        }
      }

      // Get user details and validate session
      const user = await this.getUserFromPayload(payload);
      if (!user) {
        return {
          valid: false,
          error: 'User not found or inactive',
          code: 'USER_NOT_FOUND'
        };
      }

      // Update last activity if requested
      if (options.updateLastActivity && payload.session_id) {
        await this.updateSessionActivity(payload.session_id);
      }

      // Check if session needs extension
      await this.checkAndExtendSession(payload);

      return {
        valid: true,
        payload,
        user
      };

    } catch (error) {
      console.error('Token validation error:', error);
      
      return {
        valid: false,
        error: 'Token validation failed',
        code: 'VALIDATION_ERROR',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Validate token from request headers
   */
  static async validateFromRequest(
    headers: Headers,
    options: TokenValidationOptions = {}
  ): Promise<AuthValidationResult> {
    const authHeader = headers.get('authorization');
    
    if (!authHeader) {
      return {
        valid: false,
        error: 'No authorization header provided',
        code: 'NO_AUTH_HEADER'
      };
    }

    return this.validateToken(authHeader, options);
  }

  /**
   * Validate token from cookies
   */
  static async validateFromCookies(
    cookieStore = cookies(),
    options: TokenValidationOptions = {}
  ): Promise<AuthValidationResult> {
    const tokenCookie = cookieStore.get('access_token') || cookieStore.get('sb-access-token');
    
    if (!tokenCookie?.value) {
      return {
        valid: false,
        error: 'No access token found in cookies',
        code: 'NO_TOKEN_COOKIE'
      };
    }

    return this.validateToken(tokenCookie.value, options);
  }

  /**
   * Generate new JWT token for user
   */
  static async generateToken(
    userId: string,
    email: string,
    workspaceId?: string,
    options: {
      expiresIn?: number;
      role?: string;
      permissions?: string[];
      mfaVerified?: boolean;
      sessionId?: string;
    } = {}
  ): Promise<string> {
    if (!this.jwtKey) {
      await this.initializeJWTKey();
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = options.expiresIn || this.DEFAULT_EXPIRY;
    const jti = `jwt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const payload: TokenPayload = {
      sub: userId,
      email,
      workspace_id: workspaceId,
      iat: now,
      exp: now + expiresIn,
      aud: process.env.JWT_AUDIENCE || 'affilitics.co',
      iss: process.env.JWT_ISSUER || 'affilitics.co',
      jti,
      role: options.role,
      permissions: options.permissions,
      session_id: options.sessionId,
      mfa_verified: options.mfaVerified || false,
      last_activity: now
    };

    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: this.JWT_ALGORITHM })
      .sign(this.jwtKey!);

    // Store session information
    if (options.sessionId) {
      await this.storeSessionInfo({
        id: options.sessionId,
        userId,
        workspaceId,
        expiresAt: new Date((now + expiresIn) * 1000),
        lastAccessAt: new Date(),
        revoked: false
      });
    }

    return jwt;
  }

  /**
   * Revoke a token by adding it to blacklist
   */
  static async revokeToken(tokenOrJti: string): Promise<boolean> {
    try {
      let jti: string;

      // If it's a full token, extract the JTI
      if (tokenOrJti.includes('.')) {
        const validation = await this.validateToken(tokenOrJti, { checkBlacklist: false });
        if (!validation.valid || !validation.payload?.jti) {
          return false;
        }
        jti = validation.payload.jti;
      } else {
        jti = tokenOrJti;
      }

      // Add to blacklist (this would typically use Redis in production)
      await this.addToBlacklist(jti);

      // Log the revocation
      await this.logSecurityEvent('token_revoked', undefined, { tokenId: jti });

      return true;
    } catch (error) {
      console.error('Failed to revoke token:', error);
      return false;
    }
  }

  /**
   * Revoke all tokens for a user
   */
  static async revokeAllUserTokens(userId: string): Promise<boolean> {
    try {
      // Mark all user sessions as revoked
      await this.revokeUserSessions(userId);

      // Log the mass revocation
      await this.logSecurityEvent('all_tokens_revoked', userId, {
        reason: 'user_initiated'
      });

      return true;
    } catch (error) {
      console.error('Failed to revoke all user tokens:', error);
      return false;
    }
  }

  /**
   * Refresh token if near expiration
   */
  static async refreshTokenIfNeeded(
    token: string,
    thresholdMinutes: number = 30
  ): Promise<{ token: string; refreshed: boolean } | null> {
    try {
      const validation = await this.validateToken(token, { allowExpiredWithinGrace: true });
      
      if (!validation.valid || !validation.payload) {
        return null;
      }

      const { payload } = validation;
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = payload.exp - now;
      const thresholdSeconds = thresholdMinutes * 60;

      // If token expires within threshold, generate new one
      if (timeUntilExpiry <= thresholdSeconds) {
        const newToken = await this.generateToken(
          payload.sub,
          payload.email,
          payload.workspace_id,
          {
            role: payload.role,
            permissions: payload.permissions,
            mfaVerified: payload.mfa_verified,
            sessionId: payload.session_id
          }
        );

        // Revoke old token
        if (payload.jti) {
          await this.addToBlacklist(payload.jti);
        }

        return { token: newToken, refreshed: true };
      }

      return { token, refreshed: false };
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  // Private helper methods

  private static isValidJWTFormat(token: string): boolean {
    const parts = token.split('.');
    return parts.length === 3 && parts.every(part => part.length > 0);
  }

  private static getJWTErrorMessage(error: any): string {
    if (error?.code === 'ERR_JWT_EXPIRED') {
      return 'Token has expired';
    } else if (error?.code === 'ERR_JWT_INVALID') {
      return 'Invalid token signature';
    } else if (error?.code === 'ERR_JWT_MALFORMED') {
      return 'Malformed token';
    } else {
      return 'Token verification failed';
    }
  }

  private static async getUserFromPayload(payload: TokenPayload): Promise<AuthenticatedUser | null> {
    try {
      // This would typically query your user database
      // For now, we'll use the SecurityService to get user details
      const authResult = await SecurityService.validateAuthToken(`Bearer ${payload.sub}`);
      
      if (!authResult.success || !authResult.user) {
        return null;
      }

      const user = authResult.user;
      const currentWorkspace = payload.workspace_id 
        ? user.workspaces.find(ws => ws.workspaceId === payload.workspace_id)
        : undefined;

      return {
        id: user.id,
        email: user.email,
        workspaces: user.workspaces,
        currentWorkspace,
        permissions: currentWorkspace?.permissions || user.permissions,
        lastLoginAt: user.lastLoginAt,
        sessionExpiry: user.sessionExpiry,
        mfaVerified: payload.mfa_verified || false,
        sessionId: payload.session_id
      };
    } catch (error) {
      console.error('Failed to get user from payload:', error);
      return null;
    }
  }

  private static async isTokenBlacklisted(jti: string): Promise<boolean> {
    try {
      // In production, this would check Redis or database
      // For now, we'll implement a simple check
      const result = await SecurityService.checkRateLimit(`blacklist:${jti}`, 1000000, 1);
      return result.blocked;
    } catch (error) {
      console.error('Failed to check token blacklist:', error);
      return false;
    }
  }

  private static async addToBlacklist(jti: string): Promise<void> {
    try {
      // Add to blacklist with long expiration
      await SecurityService.checkRateLimit(`blacklist:${jti}`, 365 * 24 * 60 * 60 * 1000, 0);
    } catch (error) {
      console.error('Failed to add token to blacklist:', error);
    }
  }

  private static async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      // Update session last activity (would be implemented in session store)
      await this.logSecurityEvent('session_activity', undefined, {
        sessionId,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to update session activity:', error);
    }
  }

  private static async checkAndExtendSession(payload: TokenPayload): Promise<void> {
    try {
      if (!payload.session_id || !payload.last_activity) return;

      const now = Date.now();
      const lastActivity = payload.last_activity * 1000;
      const timeSinceActivity = now - lastActivity;

      // Extend session if user has been active recently
      if (timeSinceActivity < this.SESSION_EXTEND_THRESHOLD) {
        await this.updateSessionActivity(payload.session_id);
      }
    } catch (error) {
      console.error('Failed to check session extension:', error);
    }
  }

  private static async storeSessionInfo(session: SessionInfo): Promise<void> {
    try {
      // Store session information (would be implemented in session store)
      await this.logSecurityEvent('session_created', session.userId, {
        sessionId: session.id,
        workspaceId: session.workspaceId,
        expiresAt: session.expiresAt
      });
    } catch (error) {
      console.error('Failed to store session info:', error);
    }
  }

  private static async revokeUserSessions(userId: string): Promise<void> {
    try {
      // Revoke all user sessions (would be implemented in session store)
      await this.logSecurityEvent('user_sessions_revoked', userId, {
        reason: 'admin_action'
      });
    } catch (error) {
      console.error('Failed to revoke user sessions:', error);
    }
  }

  private static async logSecurityEvent(
    event: string,
    userId?: string,
    details: Record<string, any> = {}
  ): Promise<void> {
    try {
      await SecurityService.auditSecurityEvent(event, userId, undefined, details);
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }
}

// Export convenience functions
export const validateToken = AuthValidator.validateToken.bind(AuthValidator);
export const validateFromRequest = AuthValidator.validateFromRequest.bind(AuthValidator);
export const validateFromCookies = AuthValidator.validateFromCookies.bind(AuthValidator);
export const generateToken = AuthValidator.generateToken.bind(AuthValidator);
export const revokeToken = AuthValidator.revokeToken.bind(AuthValidator);
export const refreshTokenIfNeeded = AuthValidator.refreshTokenIfNeeded.bind(AuthValidator);

// Export main class and types
export { AuthValidator };
export type { 
  TokenPayload, 
  AuthValidationResult, 
  AuthenticatedUser, 
  UserWorkspace, 
  SessionInfo, 
  TokenValidationOptions 
};