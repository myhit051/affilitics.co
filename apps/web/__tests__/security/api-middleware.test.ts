/**
 * Comprehensive API Middleware Protection Test Suite
 * 
 * Tests API route protection middleware including authentication,
 * authorization, rate limiting, CSRF protection, and security headers.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  withApiProtection,
  withAuth,
  withWorkspaceAuth,
  withAdminAuth,
  createSuccessResponse,
  createErrorResponse,
  getApiMetrics,
  ApiError
} from '@/lib/auth/api-middleware'
import { createClient } from '@/lib/supabase/server'
import { verifyCSRFEnhanced } from '@/lib/security/csrf'
import { validateWorkspaceAccess } from '@/lib/auth/workspace-middleware'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn()
}))

vi.mock('@/lib/security/csrf', () => ({
  verifyCSRFEnhanced: vi.fn()
}))

vi.mock('@/lib/auth/workspace-middleware', () => ({
  validateWorkspaceAccess: vi.fn()
}))

const mockSupabase = {
  auth: {
    getUser: vi.fn()
  }
}

const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  user_metadata: { role: 'admin' }
}

const mockWorkspaceContext = {
  user: mockUser,
  workspaceId: 'test-workspace-id',
  userRole: 'admin',
  permissions: ['read_data', 'write_data', 'manage_users']
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(createClient as any).mockReturnValue(mockSupabase)
  
  // Clear rate limiting and metrics stores
  const middleware = require('@/lib/auth/api-middleware')
  if (middleware.clearStores) {
    middleware.clearStores()
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

function createMockRequest(options: {
  method?: string
  url?: string
  headers?: Record<string, string>
  ip?: string
} = {}): NextRequest {
  const {
    method = 'GET',
    url = 'https://example.com/api/test',
    headers = {},
    ip = '127.0.0.1'
  } = options

  const request = new NextRequest(url, {
    method,
    headers: new Headers(headers)
  })

  // Mock IP address
  Object.defineProperty(request, 'ip', {
    value: ip,
    writable: true
  })

  return request
}

describe('withApiProtection Middleware', () => {
  const mockHandler = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true }), { status: 200 })
  )

  beforeEach(() => {
    mockHandler.mockClear()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    })
  })

  describe('Basic Protection', () => {
    it('should allow requests with valid authentication', async () => {
      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: true
      })

      const request = createMockRequest()
      const response = await protectedHandler(request)

      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
      expect(mockHandler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          user: mockUser,
          workspaceId: null,
          userRole: null,
          permissions: [],
          request,
          supabase: mockSupabase
        })
      )
      expect(response.status).toBe(200)
    })

    it('should reject unauthenticated requests', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Not authenticated')
      })

      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: true
      })

      const request = createMockRequest()
      const response = await protectedHandler(request)

      expect(mockHandler).not.toHaveBeenCalled()
      expect(response.status).toBe(401)

      const responseData = await response.json()
      expect(responseData.success).toBe(false)
      expect(responseData.error.code).toBe('UNAUTHORIZED')
    })

    it('should handle authentication errors gracefully', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' }
      })

      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: true
      })

      const request = createMockRequest()
      const response = await protectedHandler(request)

      expect(response.status).toBe(401)
      const responseData = await response.json()
      expect(responseData.error.message).toBe('Authentication required')
    })
  })

  describe('Method Validation', () => {
    it('should allow only specified methods', async () => {
      const protectedHandler = withApiProtection(mockHandler, {
        allowedMethods: ['POST', 'PUT'],
        requireAuth: false
      })

      const getRequest = createMockRequest({ method: 'GET' })
      const getResponse = await protectedHandler(getRequest)
      expect(getResponse.status).toBe(405)

      const postRequest = createMockRequest({ method: 'POST' })
      const postResponse = await protectedHandler(postRequest)
      expect(postResponse.status).toBe(200)
    })

    it('should handle OPTIONS requests for CORS', async () => {
      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: false,
        corsOptions: {
          origin: 'https://example.com',
          methods: ['GET', 'POST']
        }
      })

      const request = createMockRequest({ method: 'OPTIONS' })
      const response = await protectedHandler(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET,POST')
    })
  })

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: false,
        rateLimit: {
          requests: 3,
          windowMs: 60000
        }
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      // Make 3 requests - all should succeed
      for (let i = 0; i < 3; i++) {
        const response = await protectedHandler(request)
        expect(response.status).toBe(200)
      }
    })

    it('should block requests exceeding rate limit', async () => {
      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: false,
        rateLimit: {
          requests: 2,
          windowMs: 60000
        }
      })

      const request = createMockRequest({ ip: '192.168.1.2' })

      // Make 2 requests - should succeed
      for (let i = 0; i < 2; i++) {
        const response = await protectedHandler(request)
        expect(response.status).toBe(200)
      }

      // 3rd request should be rate limited
      const response = await protectedHandler(request)
      expect(response.status).toBe(429)

      const responseData = await response.json()
      expect(responseData.error.code).toBe('RATE_LIMITED')
      expect(responseData.error.details.retryAfter).toBeDefined()
    })

    it('should use custom rate limit key generator', async () => {
      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: true,
        rateLimit: {
          requests: 1,
          windowMs: 60000,
          keyGenerator: (request) => `user:${mockUser.id}`
        }
      })

      const request1 = createMockRequest({ ip: '192.168.1.3' })
      const request2 = createMockRequest({ ip: '192.168.1.4' })

      // Both requests from same user should share rate limit
      const response1 = await protectedHandler(request1)
      expect(response1.status).toBe(200)

      const response2 = await protectedHandler(request2)
      expect(response2.status).toBe(429)
    })
  })

  describe('Workspace Validation', () => {
    beforeEach(() => {
      ;(validateWorkspaceAccess as any).mockResolvedValue(mockWorkspaceContext)
    })

    it('should validate workspace access', async () => {
      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: true,
        requireWorkspace: true
      })

      const request = createMockRequest({
        headers: { 'x-workspace-id': 'test-workspace-id' }
      })

      const response = await protectedHandler(request)

      expect(validateWorkspaceAccess).toHaveBeenCalledWith(request, {
        allowedRoles: undefined,
        requirePermissions: undefined,
        logAction: 'api_access'
      })
      expect(mockHandler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          workspaceId: 'test-workspace-id',
          userRole: 'admin',
          permissions: ['read_data', 'write_data', 'manage_users']
        })
      )
    })

    it('should handle workspace validation failures', async () => {
      ;(validateWorkspaceAccess as any).mockRejectedValue(
        new Response(JSON.stringify({
          error: 'WORKSPACE_ERROR',
          details: 'Invalid workspace'
        }), { status: 403 })
      )

      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: true,
        requireWorkspace: true
      })

      const request = createMockRequest()
      const response = await protectedHandler(request)

      expect(response.status).toBe(403)
      const responseData = await response.json()
      expect(responseData.error.code).toBe('WORKSPACE_ERROR')
    })

    it('should validate role requirements', async () => {
      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: true,
        requireWorkspace: true,
        allowedRoles: ['admin', 'owner']
      })

      const request = createMockRequest()
      const response = await protectedHandler(request)

      expect(validateWorkspaceAccess).toHaveBeenCalledWith(request, {
        allowedRoles: ['admin', 'owner'],
        requirePermissions: undefined,
        logAction: 'api_access'
      })
    })
  })

  describe('CSRF Protection', () => {
    beforeEach(() => {
      ;(verifyCSRFEnhanced as any).mockResolvedValue(true)
    })

    it('should verify CSRF tokens', async () => {
      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: true,
        requireCSRF: true
      })

      const request = createMockRequest({
        method: 'POST',
        headers: { 'x-csrf-token': 'valid-token' }
      })

      const response = await protectedHandler(request)

      expect(verifyCSRFEnhanced).toHaveBeenCalledWith(request, mockUser.id, {
        enableOriginValidation: true,
        enableRateLimit: true
      })
      expect(response.status).toBe(200)
    })

    it('should handle CSRF validation failures', async () => {
      ;(verifyCSRFEnhanced as any).mockRejectedValue(new Error('Invalid CSRF token'))

      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: true,
        requireCSRF: true
      })

      const request = createMockRequest({
        method: 'POST'
      })

      const response = await protectedHandler(request)

      expect(response.status).toBe(403)
      const responseData = await response.json()
      expect(responseData.error.code).toBe('CSRF_ERROR')
    })
  })

  describe('Security Headers', () => {
    it('should add security headers to responses', async () => {
      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: false
      })

      const request = createMockRequest()
      const response = await protectedHandler(request)

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block')
      expect(response.headers.get('X-Request-ID')).toBeDefined()
    })

    it('should add CORS headers when configured', async () => {
      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: false,
        corsOptions: {
          origin: ['https://app.example.com', 'https://admin.example.com'],
          credentials: true,
          methods: ['GET', 'POST', 'PUT'],
          allowedHeaders: ['Content-Type', 'Authorization']
        }
      })

      const request = createMockRequest()
      const response = await protectedHandler(request)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com,https://admin.example.com')
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET,POST,PUT')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type,Authorization')
    })
  })

  describe('Error Handling', () => {
    it('should handle ApiError instances', async () => {
      const errorHandler = vi.fn().mockRejectedValue(
        new ApiError('Custom error', 400, 'CUSTOM_ERROR', { detail: 'Extra info' })
      )

      const protectedHandler = withApiProtection(errorHandler, {
        requireAuth: false
      })

      const request = createMockRequest()
      const response = await protectedHandler(request)

      expect(response.status).toBe(400)
      const responseData = await response.json()
      expect(responseData.error.code).toBe('CUSTOM_ERROR')
      expect(responseData.error.message).toBe('Custom error')
      expect(responseData.error.details).toEqual({ detail: 'Extra info' })
    })

    it('should handle unexpected errors', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Unexpected error'))

      const protectedHandler = withApiProtection(errorHandler, {
        requireAuth: false
      })

      const request = createMockRequest()
      const response = await protectedHandler(request)

      expect(response.status).toBe(500)
      const responseData = await response.json()
      expect(responseData.error.code).toBe('INTERNAL_ERROR')
      expect(responseData.error.message).toBe('Internal server error')
    })

    it('should include error details in development', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const errorHandler = vi.fn().mockRejectedValue(new Error('Dev error'))

      const protectedHandler = withApiProtection(errorHandler, {
        requireAuth: false
      })

      const request = createMockRequest()
      const response = await protectedHandler(request)

      const responseData = await response.json()
      expect(responseData.error.details).toBeDefined()
      expect(responseData.error.details.message).toBe('Dev error')

      process.env.NODE_ENV = originalEnv
    })
  })

  describe('Metrics and Logging', () => {
    it('should track request metrics', async () => {
      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: false,
        enableMetrics: true
      })

      const request = createMockRequest({ url: 'https://example.com/api/test' })
      await protectedHandler(request)

      const metrics = getApiMetrics()
      expect(metrics.endpoints['/api/test']).toBeDefined()
      expect(metrics.endpoints['/api/test'].totalRequests).toBe(1)
      expect(metrics.endpoints['/api/test'].successfulRequests).toBe(1)
    })

    it('should log requests when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const protectedHandler = withApiProtection(mockHandler, {
        requireAuth: true,
        logRequests: true
      })

      const request = createMockRequest()
      await protectedHandler(request)

      expect(consoleSpy).toHaveBeenCalledWith(
        'API Request:',
        expect.objectContaining({
          method: 'GET',
          userId: mockUser.id,
          status: 200
        })
      )

      consoleSpy.mockRestore()
    })
  })
})

describe('Convenience Wrappers', () => {
  const mockHandler = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true }), { status: 200 })
  )

  beforeEach(() => {
    mockHandler.mockClear()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    })
  })

  describe('withAuth', () => {
    it('should protect with basic authentication', async () => {
      const protectedHandler = withAuth(mockHandler)
      const request = createMockRequest()
      const response = await protectedHandler(request)

      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
      expect(response.status).toBe(200)
    })
  })

  describe('withWorkspaceAuth', () => {
    beforeEach(() => {
      ;(validateWorkspaceAccess as any).mockResolvedValue(mockWorkspaceContext)
    })

    it('should protect with workspace authentication', async () => {
      const protectedHandler = withWorkspaceAuth(mockHandler, {
        allowedRoles: ['admin'],
        requiredPermissions: ['read_data']
      })

      const request = createMockRequest()
      const response = await protectedHandler(request)

      expect(validateWorkspaceAccess).toHaveBeenCalledWith(request, {
        allowedRoles: ['admin'],
        requirePermissions: ['read_data'],
        logAction: 'api_access'
      })
      expect(response.status).toBe(200)
    })

    it('should enable CSRF when configured', async () => {
      ;(verifyCSRFEnhanced as any).mockResolvedValue(true)

      const protectedHandler = withWorkspaceAuth(mockHandler, {
        requireCSRF: true
      })

      const request = createMockRequest()
      await protectedHandler(request)

      expect(verifyCSRFEnhanced).toHaveBeenCalled()
    })
  })

  describe('withAdminAuth', () => {
    beforeEach(() => {
      ;(validateWorkspaceAccess as any).mockResolvedValue({
        ...mockWorkspaceContext,
        userRole: 'admin'
      })
      ;(verifyCSRFEnhanced as any).mockResolvedValue(true)
    })

    it('should enforce admin-only access with strict security', async () => {
      const protectedHandler = withAdminAuth(mockHandler)
      const request = createMockRequest()
      const response = await protectedHandler(request)

      expect(validateWorkspaceAccess).toHaveBeenCalledWith(request, {
        allowedRoles: ['admin', 'owner'],
        requirePermissions: undefined,
        logAction: 'api_access'
      })
      expect(verifyCSRFEnhanced).toHaveBeenCalled()
      expect(response.status).toBe(200)
    })

    it('should apply rate limiting for admin endpoints', async () => {
      const protectedHandler = withAdminAuth(mockHandler)
      const request = createMockRequest({ ip: '192.168.1.100' })

      // Make multiple requests to test rate limiting
      for (let i = 0; i < 50; i++) {
        const response = await protectedHandler(request)
        expect(response.status).toBe(200)
      }

      // 51st request should be rate limited
      const response = await protectedHandler(request)
      expect(response.status).toBe(429)
    })
  })
})

describe('Response Helpers', () => {
  describe('createSuccessResponse', () => {
    it('should create successful response with data', () => {
      const data = { message: 'Success', id: 123 }
      const response = createSuccessResponse(data, 201, { extra: 'metadata' })

      expect(response.status).toBe(201)
      expect(response.headers.get('Content-Type')).toBe('application/json')
      
      // Note: Can't easily test JSON content in this setup without parsing
    })

    it('should use default status code', () => {
      const response = createSuccessResponse({ success: true })
      expect(response.status).toBe(200)
    })
  })

  describe('createErrorResponse', () => {
    it('should create error response with details', () => {
      const response = createErrorResponse(
        'Validation failed',
        422,
        'VALIDATION_ERROR',
        { fields: ['email', 'password'] }
      )

      expect(response.status).toBe(422)
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })

    it('should use default values', () => {
      const response = createErrorResponse('Bad request')
      expect(response.status).toBe(400)
    })
  })
})

describe('ApiError Class', () => {
  it('should create API error with all properties', () => {
    const error = new ApiError(
      'Custom error message',
      422,
      'CUSTOM_ERROR',
      { field: 'email' }
    )

    expect(error.name).toBe('ApiError')
    expect(error.message).toBe('Custom error message')
    expect(error.statusCode).toBe(422)
    expect(error.code).toBe('CUSTOM_ERROR')
    expect(error.details).toEqual({ field: 'email' })
  })

  it('should use default values', () => {
    const error = new ApiError('Default error')

    expect(error.statusCode).toBe(500)
    expect(error.code).toBe('INTERNAL_ERROR')
    expect(error.details).toBeUndefined()
  })

  it('should convert to response correctly', () => {
    const error = new ApiError('Test error', 400, 'TEST_ERROR')
    const response = error.toResponse()

    expect(response.status).toBe(400)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate')
  })
})

describe('Edge Cases and Security', () => {
  const mockHandler = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true }), { status: 200 })
  )

  beforeEach(() => {
    mockHandler.mockClear()
  })

  it('should handle missing IP address', async () => {
    const protectedHandler = withApiProtection(mockHandler, {
      requireAuth: false,
      rateLimit: { requests: 5, windowMs: 60000 }
    })

    const request = createMockRequest({ ip: undefined as any })
    const response = await protectedHandler(request)

    // Should still work with 'unknown' IP
    expect(response.status).toBe(200)
  })

  it('should handle malformed headers', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    })

    const protectedHandler = withApiProtection(mockHandler, {
      requireAuth: true
    })

    const request = createMockRequest({
      headers: {
        'x-forwarded-for': '',
        'user-agent': null as any
      }
    })

    const response = await protectedHandler(request)
    expect(response.status).toBe(200)
  })

  it('should prevent header injection attacks', async () => {
    const protectedHandler = withApiProtection(mockHandler, {
      requireAuth: false
    })

    const request = createMockRequest({
      headers: {
        'x-forwarded-for': '127.0.0.1\r\nX-Injected: malicious'
      }
    })

    const response = await protectedHandler(request)
    
    // Should not contain injected headers
    expect(response.headers.get('X-Injected')).toBeNull()
  })

  it('should handle concurrent rate limit attempts', async () => {
    const protectedHandler = withApiProtection(mockHandler, {
      requireAuth: false,
      rateLimit: { requests: 1, windowMs: 60000 }
    })

    const request = createMockRequest({ ip: '192.168.1.200' })

    // Simulate concurrent requests
    const promises = Array(5).fill(null).map(() => protectedHandler(request))
    const responses = await Promise.all(promises)

    const successCount = responses.filter(r => r.status === 200).length
    const rateLimitedCount = responses.filter(r => r.status === 429).length

    expect(successCount).toBe(1)
    expect(rateLimitedCount).toBe(4)
  })

  it('should handle workspace validation edge cases', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    })

    ;(validateWorkspaceAccess as any).mockRejectedValue(
      new Error('Database connection failed')
    )

    const protectedHandler = withApiProtection(mockHandler, {
      requireAuth: true,
      requireWorkspace: true
    })

    const request = createMockRequest()
    const response = await protectedHandler(request)

    expect(response.status).toBe(500)
  })
})