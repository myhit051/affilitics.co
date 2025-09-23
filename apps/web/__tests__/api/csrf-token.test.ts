/**
 * Security Testing for CSRF Token API Endpoint
 * Tests the /api/auth/csrf-token endpoint functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, OPTIONS } from '@/app/api/auth/csrf-token/route'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  getAuthContextSimple: vi.fn(() => ({
    user: { id: 'test-user-123' },
    workspaceId: 'test-workspace-456'
  }))
}))

vi.mock('@/lib/security/csrf', () => ({
  createCSRFToken: vi.fn(() => '1234567890.abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456'),
  checkCSRFRateLimit: vi.fn(() => true),
  logCSRFEvent: vi.fn()
}))

// Import mocked modules
const { getAuthContextSimple } = await vi.importMock('@/lib/auth')
const { createCSRFToken, checkCSRFRateLimit, logCSRFEvent } = await vi.importMock('@/lib/security/csrf')

describe('/api/auth/csrf-token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Set up environment
    process.env.APP_ORIGIN = 'https://app.affilitics.co'
    process.env.CSRF_TOKEN_EXPIRY = '3600000' // 1 hour
    process.env.CSRF_LOGGING_ENABLED = 'true'
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('GET /api/auth/csrf-token', () => {
    it('should generate CSRF token for authenticated user', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'GET',
        headers: {
          'Origin': 'https://app.affilitics.co'
        }
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.token).toBe('1234567890.abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456')
      expect(data.expiresAt).toBeDefined()
      expect(data.maxAge).toBe(3600000)

      // Should generate token with user ID
      expect(createCSRFToken).toHaveBeenCalledWith('test-user-123')
      
      // Should log token generation
      expect(logCSRFEvent).toHaveBeenCalledWith('TOKEN_GENERATED', expect.objectContaining({
        userId: 'test-user-123',
        origin: 'https://app.affilitics.co'
      }))
    })

    it('should reject unauthenticated requests', async () => {
      getAuthContextSimple.mockImplementationOnce(() => ({
        user: null,
        workspaceId: null
      }))

      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'GET',
        headers: {
          'Origin': 'https://app.affilitics.co'
        }
      })

      const response = await GET(request)
      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.error).toBe('Authentication required')

      // Should log authentication failure
      expect(logCSRFEvent).toHaveBeenCalledWith('TOKEN_REQUEST_UNAUTHENTICATED', expect.objectContaining({
        origin: 'https://app.affilitics.co'
      }))
    })

    it('should enforce rate limiting', async () => {
      checkCSRFRateLimit.mockReturnValueOnce(false) // Rate limit exceeded

      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'GET',
        headers: {
          'Origin': 'https://app.affilitics.co'
        }
      })

      const response = await GET(request)
      expect(response.status).toBe(429)

      const data = await response.json()
      expect(data.error).toBe('Rate limit exceeded')
      expect(data.details).toBe('Too many CSRF token requests. Please try again later.')

      // Should log rate limit event
      expect(logCSRFEvent).toHaveBeenCalledWith('TOKEN_REQUEST_RATE_LIMITED', expect.objectContaining({
        userId: 'test-user-123',
        origin: 'https://app.affilitics.co'
      }))
    })

    it('should validate origin when configured', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'GET',
        headers: {
          'Origin': 'https://malicious-site.com'
        }
      })

      const response = await GET(request)
      expect(response.status).toBe(403)

      const data = await response.json()
      expect(data.error).toBe('Origin not allowed')
    })

    it('should allow requests without origin header (same-origin)', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'GET'
      })

      const response = await GET(request)
      expect(response.status).toBe(200)
    })

    it('should set secure response headers', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'GET',
        headers: {
          'Origin': 'https://app.affilitics.co'
        }
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      // Check security headers
      expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, private')
      expect(response.headers.get('Pragma')).toBe('no-cache')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })

    it('should handle authentication errors gracefully', async () => {
      getAuthContextSimple.mockImplementationOnce(() => {
        throw new Response('Unauthorized', { status: 401 })
      })

      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'GET',
        headers: {
          'Origin': 'https://app.affilitics.co'
        }
      })

      const response = await GET(request)
      expect(response.status).toBe(401)
    })

    it('should handle token generation errors', async () => {
      createCSRFToken.mockImplementationOnce(() => {
        throw new Error('Token generation failed')
      })

      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'GET',
        headers: {
          'Origin': 'https://app.affilitics.co'
        }
      })

      const response = await GET(request)
      expect(response.status).toBe(500)

      const data = await response.json()
      expect(data.error).toBe('Failed to generate CSRF token')
    })

    it('should use custom token expiry from environment', async () => {
      process.env.CSRF_TOKEN_EXPIRY = '7200000' // 2 hours

      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'GET',
        headers: {
          'Origin': 'https://app.affilitics.co'
        }
      })

      const response = await GET(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.maxAge).toBe(7200000)
    })
  })

  describe('OPTIONS /api/auth/csrf-token', () => {
    it('should handle preflight CORS requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://app.affilitics.co'
        }
      })

      const response = await OPTIONS(request)
      expect(response.status).toBe(200)

      // Check CORS headers
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.affilitics.co')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization')
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400')
    })

    it('should reject preflight requests from unauthorized origins', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://malicious-site.com'
        }
      })

      const response = await OPTIONS(request)
      expect(response.status).toBe(403)
    })

    it('should handle missing origin in preflight', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'OPTIONS'
      })

      const response = await OPTIONS(request)
      expect(response.status).toBe(403)
    })
  })

  describe('Security Features', () => {
    it('should not expose sensitive information in error responses', async () => {
      getAuthContextSimple.mockImplementationOnce(() => {
        throw new Error('Database connection failed with credentials: user:pass@host')
      })

      const request = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'GET',
        headers: {
          'Origin': 'https://app.affilitics.co'
        }
      })

      const response = await GET(request)
      expect(response.status).toBe(500)

      const data = await response.json()
      expect(data.error).toBe('Failed to generate CSRF token')
      expect(data.details).toBeUndefined()
      expect(JSON.stringify(data)).not.toContain('credentials')
      expect(JSON.stringify(data)).not.toContain('user:pass')
    })

    it('should generate different tokens for different users', async () => {
      const user1Token = '1111111111.token1111111111111111111111111111111111111111111111111111'
      const user2Token = '2222222222.token2222222222222222222222222222222222222222222222222222'

      // First user
      createCSRFToken.mockReturnValueOnce(user1Token)
      getAuthContextSimple.mockReturnValueOnce({
        user: { id: 'user-1' },
        workspaceId: 'workspace-1'
      })

      const request1 = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'GET',
        headers: { 'Origin': 'https://app.affilitics.co' }
      })

      const response1 = await GET(request1)
      const data1 = await response1.json()

      // Second user
      createCSRFToken.mockReturnValueOnce(user2Token)
      getAuthContextSimple.mockReturnValueOnce({
        user: { id: 'user-2' },
        workspaceId: 'workspace-2'
      })

      const request2 = new NextRequest('http://localhost:3000/api/auth/csrf-token', {
        method: 'GET',
        headers: { 'Origin': 'https://app.affilitics.co' }
      })

      const response2 = await GET(request2)
      const data2 = await response2.json()

      expect(data1.token).toBe(user1Token)
      expect(data2.token).toBe(user2Token)
      expect(data1.token).not.toBe(data2.token)

      expect(createCSRFToken).toHaveBeenCalledWith('user-1')
      expect(createCSRFToken).toHaveBeenCalledWith('user-2')
    })
  })
})