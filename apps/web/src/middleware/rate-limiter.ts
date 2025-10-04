/**
 * API Rate Limiting Middleware for Affilitics.co
 * 
 * Provides comprehensive rate limiting to prevent abuse and DoS attacks:
 * - Per-workspace rate limiting with configurable limits
 * - Different limits for different endpoint types and user tiers
 * - Redis-compatible storage for production scalability
 * - Comprehensive logging and monitoring
 * - IP-based and user-based rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { SecurityService } from '../../../../packages/db/src/services/security-service';

// Rate limiting configuration types
export interface RateLimitConfig {
  windowMs: number;          // Time window in milliseconds
  maxRequests: number;       // Maximum requests per window
  keyGenerator?: (req: NextRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
  headers?: boolean;
  onLimitReached?: (req: NextRequest, identifier: string) => Promise<void>;
  whitelist?: string[];      // IPs or users to whitelist
  customRules?: RateLimitRule[];
}

export interface RateLimitRule {
  pattern: RegExp;
  windowMs: number;
  maxRequests: number;
  description: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  blocked: boolean;
  identifier: string;
  rule?: string;
}

export interface RateLimitResponse {
  success: boolean;
  info: RateLimitInfo;
  error?: string;
}

/**
 * Advanced Rate Limiter Class
 */
export class RateLimiter {
  private static readonly DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly DEFAULT_MAX_REQUESTS = 100;
  
  // Pre-defined rate limit configurations for different use cases
  private static readonly CONFIGURATIONS = {
    // General API endpoints
    api: {
      windowMs: 15 * 60 * 1000,  // 15 minutes
      maxRequests: 1000,         // 1000 requests per 15 minutes
    },
    
    // Authentication endpoints (stricter)
    auth: {
      windowMs: 15 * 60 * 1000,  // 15 minutes
      maxRequests: 5,            // 5 login attempts per 15 minutes
    },
    
    // File upload endpoints
    upload: {
      windowMs: 60 * 60 * 1000,  // 1 hour
      maxRequests: 10,           // 10 uploads per hour
    },
    
    // Data export endpoints
    export: {
      windowMs: 60 * 60 * 1000,  // 1 hour
      maxRequests: 5,            // 5 exports per hour
    },
    
    // Report generation
    reports: {
      windowMs: 10 * 60 * 1000,  // 10 minutes
      maxRequests: 20,           // 20 reports per 10 minutes
    },
    
    // Workspace management
    workspace: {
      windowMs: 60 * 60 * 1000,  // 1 hour
      maxRequests: 100,          // 100 workspace operations per hour
    },
    
    // Public endpoints (most lenient)
    public: {
      windowMs: 1 * 60 * 1000,   // 1 minute
      maxRequests: 60,           // 60 requests per minute
    }
  };

  /**
   * Create rate limiting middleware with configuration
   */
  static create(config: Partial<RateLimitConfig> = {}) {
    const finalConfig: RateLimitConfig = {
      windowMs: RateLimiter.DEFAULT_WINDOW_MS,
      maxRequests: RateLimiter.DEFAULT_MAX_REQUESTS,
      keyGenerator: RateLimiter.defaultKeyGenerator,
      headers: true,
      message: 'Too many requests, please try again later',
      ...config
    };

    return async (request: NextRequest): Promise<NextResponse | void> => {
      try {
        return await RateLimiter.handleRequest(request, finalConfig);
      } catch (error) {
        console.error('Rate limiter error:', error);
        
        // In case of error, allow the request but log the issue
        await RateLimiter.logSecurityEvent(
          'rate_limiter_error',
          request,
          { error: error instanceof Error ? error.message : 'Unknown error' }
        );
        
        return; // Continue to next middleware
      }
    };
  }

  /**
   * Pre-configured rate limiters for common use cases
   */
  static api() {
    return RateLimiter.create({
      ...RateLimiter.CONFIGURATIONS.api,
      customRules: [
        {
          pattern: /^\/api\/auth/,
          windowMs: 15 * 60 * 1000,
          maxRequests: 5,
          description: 'Authentication endpoints'
        },
        {
          pattern: /^\/api\/upload/,
          windowMs: 60 * 60 * 1000,
          maxRequests: 10,
          description: 'File upload endpoints'
        },
        {
          pattern: /^\/api\/export/,
          windowMs: 60 * 60 * 1000,
          maxRequests: 5,
          description: 'Data export endpoints'
        }
      ]
    });
  }

  static auth() {
    return RateLimiter.create({
      ...RateLimiter.CONFIGURATIONS.auth,
      keyGenerator: (req) => `auth:${RateLimiter.getClientIP(req)}`,
      onLimitReached: async (req, identifier) => {
        await RateLimiter.logSecurityEvent(
          'auth_rate_limit_exceeded',
          req,
          { identifier, severity: 'high' }
        );
      }
    });
  }

  static upload() {
    return RateLimiter.create({
      ...RateLimiter.CONFIGURATIONS.upload,
      keyGenerator: (req) => `upload:${RateLimiter.getUserWorkspaceKey(req)}`,
    });
  }

  static workspace() {
    return RateLimiter.create({
      ...RateLimiter.CONFIGURATIONS.workspace,
      keyGenerator: (req) => `workspace:${RateLimiter.getUserWorkspaceKey(req)}`,
    });
  }

  static public() {
    return RateLimiter.create({
      ...RateLimiter.CONFIGURATIONS.public,
      keyGenerator: (req) => `public:${RateLimiter.getClientIP(req)}`,
    });
  }

  /**
   * Handle rate limiting for a request
   */
  private static async handleRequest(
    request: NextRequest,
    config: RateLimitConfig
  ): Promise<NextResponse | void> {
    const identifier = config.keyGenerator!(request);
    const pathname = request.nextUrl.pathname;

    // Check whitelist
    if (config.whitelist && RateLimiter.isWhitelisted(request, config.whitelist)) {
      return; // Skip rate limiting for whitelisted requests
    }

    // Determine applicable rate limit rule
    const rule = RateLimiter.getApplicableRule(pathname, config);
    const windowMs = rule?.windowMs || config.windowMs;
    const maxRequests = rule?.maxRequests || config.maxRequests;

    // Check rate limit
    const rateLimitResult = await SecurityService.checkRateLimit(
      identifier,
      windowMs,
      maxRequests
    );

    // Create rate limit info
    const info: RateLimitInfo = {
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - rateLimitResult.count),
      reset: rateLimitResult.resetTime,
      blocked: rateLimitResult.blocked,
      identifier,
      rule: rule?.description
    };

    // Add rate limit headers if enabled
    const response = NextResponse.next();
    if (config.headers) {
      RateLimiter.addRateLimitHeaders(response, info);
    }

    // Handle rate limit exceeded
    if (rateLimitResult.blocked) {
      // Log rate limit violation
      await RateLimiter.logSecurityEvent(
        'rate_limit_exceeded',
        request,
        {
          identifier,
          limit: maxRequests,
          count: rateLimitResult.count,
          windowMs,
          rule: rule?.description
        }
      );

      // Call onLimitReached callback if provided
      if (config.onLimitReached) {
        await config.onLimitReached(request, identifier);
      }

      // Return rate limit error response
      return new NextResponse(
        JSON.stringify({
          error: config.message,
          code: 'RATE_LIMIT_EXCEEDED',
          limit: maxRequests,
          remaining: 0,
          reset: rateLimitResult.resetTime.toISOString(),
          retryAfter: Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000)
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
            'X-RateLimit-Policy': rule?.description || 'default'
          }
        }
      );
    }

    return response;
  }

  /**
   * Get applicable rate limit rule for a pathname
   */
  private static getApplicableRule(pathname: string, config: RateLimitConfig): RateLimitRule | null {
    if (!config.customRules) return null;

    for (const rule of config.customRules) {
      if (rule.pattern.test(pathname)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Default key generator (IP-based)
   */
  private static defaultKeyGenerator(req: NextRequest): string {
    return RateLimiter.getClientIP(req);
  }

  /**
   * Generate key based on user and workspace
   */
  private static getUserWorkspaceKey(req: NextRequest): string {
    const workspaceId = req.headers.get('x-workspace-id');
    const userId = req.headers.get('x-user-id');
    const ip = RateLimiter.getClientIP(req);

    if (userId && workspaceId) {
      return `${userId}:${workspaceId}`;
    } else if (userId) {
      return `user:${userId}`;
    } else {
      return `ip:${ip}`;
    }
  }

  /**
   * Extract client IP from request
   */
  private static getClientIP(req: NextRequest): string {
    // Check various headers for the real client IP
    const forwarded = req.headers.get('x-forwarded-for');
    const realIP = req.headers.get('x-real-ip');
    const cfConnectingIP = req.headers.get('cf-connecting-ip');

    if (forwarded) {
      return forwarded.split(',')[0].trim();
    } else if (realIP) {
      return realIP;
    } else if (cfConnectingIP) {
      return cfConnectingIP;
    } else {
      return req.ip || 'unknown';
    }
  }

  /**
   * Check if request is whitelisted
   */
  private static isWhitelisted(req: NextRequest, whitelist: string[]): boolean {
    const ip = RateLimiter.getClientIP(req);
    const userId = req.headers.get('x-user-id');

    return whitelist.some(entry => {
      if (entry.includes('@')) {
        // Email-based whitelist
        return userId === entry;
      } else if (entry.includes('.')) {
        // IP-based whitelist
        return ip === entry || ip.startsWith(entry);
      } else {
        // User ID-based whitelist
        return userId === entry;
      }
    });
  }

  /**
   * Add rate limit headers to response
   */
  private static addRateLimitHeaders(response: NextResponse, info: RateLimitInfo) {
    response.headers.set('X-RateLimit-Limit', info.limit.toString());
    response.headers.set('X-RateLimit-Remaining', info.remaining.toString());
    response.headers.set('X-RateLimit-Reset', info.reset.toISOString());
    
    if (info.rule) {
      response.headers.set('X-RateLimit-Policy', info.rule);
    }

    if (info.blocked) {
      const retryAfter = Math.ceil((info.reset.getTime() - Date.now()) / 1000);
      response.headers.set('Retry-After', retryAfter.toString());
    }
  }

  /**
   * Log security events for rate limiting
   */
  private static async logSecurityEvent(
    event: string,
    req: NextRequest,
    details: Record<string, any> = {}
  ) {
    try {
      const workspaceId = req.headers.get('x-workspace-id');
      const userId = req.headers.get('x-user-id');

      await SecurityService.auditSecurityEvent(
        event,
        userId || undefined,
        workspaceId || undefined,
        {
          ...details,
          ipAddress: RateLimiter.getClientIP(req),
          userAgent: req.headers.get('user-agent'),
          path: req.nextUrl.pathname,
          method: req.method,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Get current rate limit status for an identifier
   */
  static async getStatus(identifier: string): Promise<RateLimitInfo | null> {
    try {
      const state = await SecurityService.checkRateLimit(identifier, 0, 0);
      
      return {
        limit: 0, // Will be updated by calling code
        remaining: 0, // Will be updated by calling code
        reset: state.resetTime,
        blocked: state.blocked,
        identifier: state.identifier
      };
    } catch (error) {
      console.error('Failed to get rate limit status:', error);
      return null;
    }
  }

  /**
   * Reset rate limit for an identifier (admin function)
   */
  static async reset(identifier: string): Promise<boolean> {
    try {
      // This would require implementing a reset function in SecurityService
      // For now, we'll log the admin action
      await SecurityService.auditSecurityEvent(
        'rate_limit_reset',
        undefined,
        undefined,
        { identifier, admin_action: true }
      );
      
      return true;
    } catch (error) {
      console.error('Failed to reset rate limit:', error);
      return false;
    }
  }

  /**
   * Create workspace-specific rate limiter with tier-based limits
   */
  static createWorkspaceLimiter(workspaceTier: 'free' | 'pro' | 'enterprise' = 'free') {
    const tierLimits = {
      free: {
        api: { windowMs: 15 * 60 * 1000, maxRequests: 100 },
        upload: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
        export: { windowMs: 60 * 60 * 1000, maxRequests: 2 }
      },
      pro: {
        api: { windowMs: 15 * 60 * 1000, maxRequests: 1000 },
        upload: { windowMs: 60 * 60 * 1000, maxRequests: 25 },
        export: { windowMs: 60 * 60 * 1000, maxRequests: 10 }
      },
      enterprise: {
        api: { windowMs: 15 * 60 * 1000, maxRequests: 10000 },
        upload: { windowMs: 60 * 60 * 1000, maxRequests: 100 },
        export: { windowMs: 60 * 60 * 1000, maxRequests: 50 }
      }
    };

    const limits = tierLimits[workspaceTier];

    return RateLimiter.create({
      ...limits.api,
      keyGenerator: (req) => `workspace:${workspaceTier}:${RateLimiter.getUserWorkspaceKey(req)}`,
      customRules: [
        {
          pattern: /^\/api\/upload/,
          ...limits.upload,
          description: `File upload (${workspaceTier} tier)`
        },
        {
          pattern: /^\/api\/export/,
          ...limits.export,
          description: `Data export (${workspaceTier} tier)`
        }
      ]
    });
  }
}

// Export convenience functions
export const apiRateLimit = RateLimiter.api;
export const authRateLimit = RateLimiter.auth;
export const uploadRateLimit = RateLimiter.upload;
export const workspaceRateLimit = RateLimiter.workspace;
export const publicRateLimit = RateLimiter.public;

// Export main class and types
export { RateLimiter };
export type { RateLimitConfig, RateLimitRule, RateLimitInfo, RateLimitResponse };