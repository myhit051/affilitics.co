/**
 * COMPREHENSIVE API ROUTE PROTECTION MIDDLEWARE
 * 
 * This module provides production-ready middleware for securing API routes
 * with authentication, authorization, rate limiting, and comprehensive logging.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyCSRFEnhanced } from '@/lib/security/csrf'
import { validateWorkspaceAccess } from '@/lib/auth/workspace-middleware'
import { User } from '@supabase/supabase-js'

// Types for middleware configuration
export interface ApiMiddlewareOptions {
  requireAuth?: boolean
  requireWorkspace?: boolean
  requireCSRF?: boolean
  allowedMethods?: string[]
  allowedRoles?: string[]
  requiredPermissions?: string[]
  rateLimit?: {
    requests: number
    windowMs: number
    keyGenerator?: (request: NextRequest) => string
  }
  corsOptions?: {
    origin?: string | string[]
    credentials?: boolean
    methods?: string[]
    allowedHeaders?: string[]
  }
  logRequests?: boolean
  enableMetrics?: boolean
}

export interface ApiContext {
  user: User | null
  workspaceId: string | null
  userRole: string | null
  permissions: string[]
  request: NextRequest
  supabase: ReturnType<typeof createClient>
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  metadata?: {
    timestamp: string
    requestId: string
    processingTime?: number
  }
}

// Rate limiting storage (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Request metrics storage
const metricsStore = new Map<string, {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  lastReset: number
}>()

/**
 * Enhanced API error class with proper status codes and logging
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public details?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }

  toResponse(): Response {
    const response: ApiResponse = {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: generateRequestId()
      }
    }

    return new Response(JSON.stringify(response), {
      status: this.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    })
  }
}

/**
 * Generate unique request ID for tracking
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Enhanced rate limiting with configurable options
 */
function checkRateLimit(
  key: string,
  options: { requests: number; windowMs: number }
): boolean {
  const now = Date.now()
  const record = rateLimitStore.get(key)

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + options.windowMs
    })
    return true
  }

  if (record.count >= options.requests) {
    return false
  }

  record.count++
  return true
}

/**
 * Update request metrics
 */
function updateMetrics(endpoint: string, success: boolean, responseTime: number): void {
  const metrics = metricsStore.get(endpoint) || {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    lastReset: Date.now()
  }

  metrics.totalRequests++
  if (success) {
    metrics.successfulRequests++
  } else {
    metrics.failedRequests++
  }

  // Update average response time
  metrics.averageResponseTime = 
    (metrics.averageResponseTime * (metrics.totalRequests - 1) + responseTime) / 
    metrics.totalRequests

  metricsStore.set(endpoint, metrics)
}

/**
 * Get client IP address for rate limiting
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
 * Add CORS headers to response
 */
function addCorsHeaders(
  response: Response,
  options: ApiMiddlewareOptions['corsOptions'] = {}
): void {
  const {
    origin = '*',
    credentials = false,
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Workspace-ID']
  } = options

  response.headers.set('Access-Control-Allow-Origin', Array.isArray(origin) ? origin.join(',') : origin)
  response.headers.set('Access-Control-Allow-Methods', methods.join(','))
  response.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(','))
  
  if (credentials) {
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }
}

/**
 * Log API request for monitoring and debugging
 */
function logRequest(
  request: NextRequest,
  context: Partial<ApiContext>,
  response?: { status: number; processingTime?: number },
  error?: Error
): void {
  const logData = {
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent'),
    ip: getClientIP(request),
    userId: context.user?.id,
    workspaceId: context.workspaceId,
    userRole: context.userRole,
    status: response?.status,
    processingTime: response?.processingTime,
    error: error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : undefined
  }

  if (error) {
    console.error('API Error:', logData)
  } else {
    console.log('API Request:', logData)
  }
}

/**
 * Enhanced middleware wrapper with comprehensive security and monitoring
 */
export function withApiProtection<T extends any[]>(
  handler: (request: NextRequest, context: ApiContext, ...args: T) => Promise<Response>,
  options: ApiMiddlewareOptions = {}
) {
  const {
    requireAuth = true,
    requireWorkspace = false,
    requireCSRF = false,
    allowedMethods,
    allowedRoles,
    requiredPermissions,
    rateLimit,
    corsOptions,
    logRequests = true,
    enableMetrics = true
  } = options

  return async (request: NextRequest, ...args: T): Promise<Response> => {
    const startTime = Date.now()
    const requestId = generateRequestId()
    const context: Partial<ApiContext> = { request }

    try {
      // Method validation
      if (allowedMethods && !allowedMethods.includes(request.method)) {
        throw new ApiError(
          `Method ${request.method} not allowed`,
          405,
          'METHOD_NOT_ALLOWED'
        )
      }

      // Handle OPTIONS requests for CORS
      if (request.method === 'OPTIONS') {
        const response = new Response(null, { status: 200 })
        addCorsHeaders(response, corsOptions)
        return response
      }

      // Rate limiting
      if (rateLimit) {
        const rateLimitKey = rateLimit.keyGenerator 
          ? rateLimit.keyGenerator(request)
          : getClientIP(request)
        
        if (!checkRateLimit(rateLimitKey, rateLimit)) {
          throw new ApiError(
            'Rate limit exceeded',
            429,
            'RATE_LIMITED',
            {
              limit: rateLimit.requests,
              windowMs: rateLimit.windowMs,
              retryAfter: Math.ceil(rateLimit.windowMs / 1000)
            }
          )
        }
      }

      // Authentication
      const supabase = createClient()
      let user: User | null = null
      let workspaceId: string | null = null
      let userRole: string | null = null
      let permissions: string[] = []

      if (requireAuth) {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !authUser) {
          throw new ApiError(
            'Authentication required',
            401,
            'UNAUTHORIZED'
          )
        }

        user = authUser
        context.user = user
        context.supabase = supabase
      }

      // Workspace validation
      if (requireWorkspace && user) {
        try {
          const workspaceContext = await validateWorkspaceAccess(request, {
            allowedRoles,
            requirePermissions: requiredPermissions,
            logAction: 'api_access'
          })

          workspaceId = workspaceContext.workspaceId
          userRole = workspaceContext.userRole
          permissions = workspaceContext.permissions

          context.workspaceId = workspaceId
          context.userRole = userRole
          context.permissions = permissions

        } catch (error) {
          if (error instanceof Response) {
            const errorData = await error.json()
            throw new ApiError(
              errorData.details || 'Workspace validation failed',
              error.status,
              errorData.error || 'WORKSPACE_ERROR'
            )
          }
          throw error
        }
      }

      // CSRF validation
      if (requireCSRF && user) {
        try {
          await verifyCSRFEnhanced(request, user.id, {
            enableOriginValidation: true,
            enableRateLimit: true
          })
        } catch (error) {
          throw new ApiError(
            'CSRF validation failed',
            403,
            'CSRF_ERROR',
            { error: error instanceof Error ? error.message : 'Unknown CSRF error' }
          )
        }
      }

      // Execute handler
      const apiContext: ApiContext = {
        user,
        workspaceId,
        userRole,
        permissions,
        request,
        supabase
      }

      const response = await handler(request, apiContext, ...args)
      
      // Add security headers
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('X-Frame-Options', 'DENY')
      response.headers.set('X-XSS-Protection', '1; mode=block')
      response.headers.set('X-Request-ID', requestId)
      
      // Add CORS headers if configured
      if (corsOptions) {
        addCorsHeaders(response, corsOptions)
      }

      // Metrics and logging
      const processingTime = Date.now() - startTime
      
      if (enableMetrics) {
        updateMetrics(request.nextUrl.pathname, true, processingTime)
      }

      if (logRequests) {
        logRequest(request, context, { status: response.status, processingTime })
      }

      return response

    } catch (error) {
      const processingTime = Date.now() - startTime

      // Handle API errors
      if (error instanceof ApiError) {
        if (enableMetrics) {
          updateMetrics(request.nextUrl.pathname, false, processingTime)
        }

        if (logRequests) {
          logRequest(request, context, { status: error.statusCode, processingTime }, error)
        }

        return error.toResponse()
      }

      // Handle unexpected errors
      console.error('Unexpected API error:', error)
      
      const apiError = new ApiError(
        'Internal server error',
        500,
        'INTERNAL_ERROR',
        process.env.NODE_ENV === 'development' ? {
          stack: error instanceof Error ? error.stack : undefined,
          message: error instanceof Error ? error.message : String(error)
        } : undefined
      )

      if (enableMetrics) {
        updateMetrics(request.nextUrl.pathname, false, processingTime)
      }

      if (logRequests) {
        logRequest(request, context, { status: 500, processingTime }, apiError)
      }

      return apiError.toResponse()
    }
  }
}

/**
 * Simplified auth-only wrapper for basic protection
 */
export function withAuth<T extends any[]>(
  handler: (request: NextRequest, context: ApiContext, ...args: T) => Promise<Response>
) {
  return withApiProtection(handler, {
    requireAuth: true,
    requireWorkspace: false,
    logRequests: true
  })
}

/**
 * Workspace-protected wrapper with role validation
 */
export function withWorkspaceAuth<T extends any[]>(
  handler: (request: NextRequest, context: ApiContext, ...args: T) => Promise<Response>,
  options: {
    allowedRoles?: string[]
    requiredPermissions?: string[]
    requireCSRF?: boolean
  } = {}
) {
  return withApiProtection(handler, {
    requireAuth: true,
    requireWorkspace: true,
    requireCSRF: options.requireCSRF || false,
    allowedRoles: options.allowedRoles,
    requiredPermissions: options.requiredPermissions,
    logRequests: true,
    enableMetrics: true
  })
}

/**
 * Admin-only wrapper for sensitive operations
 */
export function withAdminAuth<T extends any[]>(
  handler: (request: NextRequest, context: ApiContext, ...args: T) => Promise<Response>
) {
  return withApiProtection(handler, {
    requireAuth: true,
    requireWorkspace: true,
    requireCSRF: true,
    allowedRoles: ['admin', 'owner'],
    logRequests: true,
    enableMetrics: true,
    rateLimit: {
      requests: 50,
      windowMs: 15 * 60 * 1000 // 15 minutes
    }
  })
}

/**
 * Success response helper
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200,
  metadata?: Record<string, any>
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: generateRequestId(),
      ...metadata
    }
  }

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

/**
 * Error response helper
 */
export function createErrorResponse(
  message: string,
  status: number = 400,
  code: string = 'BAD_REQUEST',
  details?: any
): Response {
  const apiError = new ApiError(message, status, code, details)
  return apiError.toResponse()
}

/**
 * Get current metrics for monitoring
 */
export function getApiMetrics(): Record<string, any> {
  const metrics = Object.fromEntries(metricsStore.entries())
  return {
    endpoints: metrics,
    rateLimits: Object.fromEntries(rateLimitStore.entries()),
    timestamp: new Date().toISOString()
  }
}

export default {
  withApiProtection,
  withAuth,
  withWorkspaceAuth,
  withAdminAuth,
  createSuccessResponse,
  createErrorResponse,
  getApiMetrics,
  ApiError
}