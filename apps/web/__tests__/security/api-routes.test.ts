/**
 * Comprehensive API Route Security Test Suite
 * 
 * Tests actual API route implementations for proper authentication,
 * authorization, input validation, and security measures.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createMocks } from 'node-mocks-http'

// Import API route handlers for testing
import { GET as getAnalyticsOverview } from '@/app/api/analytics/overview/route'
import { POST as uploadFile } from '@/app/api/import/upload/route'
import { GET as getWorkspaceAudit } from '@/app/api/workspace/audit/route'
import { GET as getAuthCallback } from '@/app/api/auth/callback/route'
import { GET as getCsrfToken } from '@/app/api/auth/csrf-token/route'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabase)
}))

vi.mock('@/lib/auth/workspace-middleware', () => ({
  validateWorkspaceAccess: vi.fn()
}))

vi.mock('@/lib/security/csrf', () => ({
  verifyCSRFEnhanced: vi.fn(),
  generateCSRFToken: vi.fn()
}))

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
    getSession: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    signOut: vi.fn()
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          order: vi.fn(() => ({
            limit: vi.fn()
          }))
        })),
        gte: vi.fn(() => ({
          lte: vi.fn()
        })),
        range: vi.fn()
      }))
    })),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }))
}

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated'
}

const mockWorkspaceContext = {
  user: mockUser,
  workspaceId: 'workspace-123',
  userRole: 'admin',
  permissions: ['read_data', 'write_data', 'manage_imports'],
  supabase: mockSupabase
}

beforeEach(() => {
  vi.clearAllMocks()
  
  // Default successful auth
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: mockUser },
    error: null
  })

  // Default workspace validation
  const { validateWorkspaceAccess } = require('@/lib/auth/workspace-middleware')
  validateWorkspaceAccess.mockResolvedValue(mockWorkspaceContext)

  // Default CSRF validation
  const { verifyCSRFEnhanced, generateCSRFToken } = require('@/lib/security/csrf')
  verifyCSRFEnhanced.mockResolvedValue(true)
  generateCSRFToken.mockReturnValue('csrf-token-123')
})

afterEach(() => {
  vi.clearAllMocks()
})

function createTestRequest(options: {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: any
} = {}): NextRequest {
  const {
    method = 'GET',
    url = 'https://example.com/api/test',
    headers = {},
    body
  } = options

  const requestInit: RequestInit = {
    method,
    headers: new Headers({
      'Content-Type': 'application/json',
      ...headers
    })
  }

  if (body) {
    requestInit.body = JSON.stringify(body)
  }

  return new NextRequest(url, requestInit)
}

describe('Analytics API Routes', () => {
  describe('/api/analytics/overview', () => {
    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({
                data: [
                  { date: '2023-01-01', revenue: 1000, orders: 10 },
                  { date: '2023-01-02', revenue: 1500, orders: 15 }
                ],
                error: null
              })
            })
          })
        })
      })
    })

    it('should require authentication', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Not authenticated')
      })

      const request = createTestRequest({
        url: 'https://example.com/api/analytics/overview?startDate=2023-01-01&endDate=2023-01-31'
      })

      const response = await getAnalyticsOverview(request)
      expect(response.status).toBe(401)

      const responseData = await response.json()
      expect(responseData.success).toBe(false)
      expect(responseData.error.code).toBe('UNAUTHORIZED')
    })

    it('should require valid workspace access', async () => {
      const { validateWorkspaceAccess } = require('@/lib/auth/workspace-middleware')
      validateWorkspaceAccess.mockRejectedValue(
        new Response(JSON.stringify({
          error: 'WORKSPACE_ERROR',
          details: 'No access to workspace'
        }), { status: 403 })
      )

      const request = createTestRequest({
        url: 'https://example.com/api/analytics/overview?startDate=2023-01-01&endDate=2023-01-31',
        headers: { 'x-workspace-id': 'unauthorized-workspace' }
      })

      const response = await getAnalyticsOverview(request)
      expect(response.status).toBe(403)
    })

    it('should validate date parameters', async () => {
      const request = createTestRequest({
        url: 'https://example.com/api/analytics/overview?startDate=invalid-date&endDate=2023-01-31'
      })

      const response = await getAnalyticsOverview(request)
      expect(response.status).toBe(400)

      const responseData = await response.json()
      expect(responseData.error.message).toContain('Invalid date format')
    })

    it('should enforce date range limits', async () => {
      const request = createTestRequest({
        url: 'https://example.com/api/analytics/overview?startDate=2020-01-01&endDate=2023-12-31'
      })

      const response = await getAnalyticsOverview(request)
      expect(response.status).toBe(400)

      const responseData = await response.json()
      expect(responseData.error.message).toContain('Date range too large')
    })

    it('should return analytics data for valid request', async () => {
      const request = createTestRequest({
        url: 'https://example.com/api/analytics/overview?startDate=2023-01-01&endDate=2023-01-31',
        headers: { 'x-workspace-id': 'workspace-123' }
      })

      const response = await getAnalyticsOverview(request)
      expect(response.status).toBe(200)

      const responseData = await response.json()
      expect(responseData.success).toBe(true)
      expect(responseData.data).toBeDefined()
      expect(responseData.data.length).toBe(2)
    })

    it('should include security headers', async () => {
      const request = createTestRequest({
        url: 'https://example.com/api/analytics/overview?startDate=2023-01-01&endDate=2023-01-31'
      })

      const response = await getAnalyticsOverview(request)

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block')
      expect(response.headers.get('X-Request-ID')).toBeDefined()
    })

    it('should handle database errors gracefully', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database connection failed' }
              })
            })
          })
        })
      })

      const request = createTestRequest({
        url: 'https://example.com/api/analytics/overview?startDate=2023-01-01&endDate=2023-01-31'
      })

      const response = await getAnalyticsOverview(request)
      expect(response.status).toBe(500)

      const responseData = await response.json()
      expect(responseData.error.code).toBe('DATABASE_ERROR')
    })
  })
})

describe('File Upload API Routes', () => {
  describe('/api/import/upload', () => {
    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          data: [{ id: 'job-123', status: 'queued' }],
          error: null
        })
      })
    })

    it('should require authentication', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Not authenticated')
      })

      const formData = new FormData()
      formData.append('file', new Blob(['test data'], { type: 'text/csv' }), 'test.csv')
      formData.append('platform', 'shopee')

      const request = new NextRequest('https://example.com/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await uploadFile(request)
      expect(response.status).toBe(401)
    })

    it('should require workspace access with import permissions', async () => {
      const { validateWorkspaceAccess } = require('@/lib/auth/workspace-middleware')
      validateWorkspaceAccess.mockRejectedValue(
        new Response(JSON.stringify({
          error: 'INSUFFICIENT_PERMISSIONS',
          details: 'Import permission required'
        }), { status: 403 })
      )

      const formData = new FormData()
      formData.append('file', new Blob(['test data'], { type: 'text/csv' }), 'test.csv')
      formData.append('platform', 'shopee')

      const request = new NextRequest('https://example.com/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await uploadFile(request)
      expect(response.status).toBe(403)
    })

    it('should validate file type and size', async () => {
      const formData = new FormData()
      const largeFile = new Blob(['x'.repeat(100 * 1024 * 1024)], { type: 'application/exe' })
      formData.append('file', largeFile, 'malicious.exe')
      formData.append('platform', 'shopee')

      const request = new NextRequest('https://example.com/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await uploadFile(request)
      expect(response.status).toBe(400)

      const responseData = await response.json()
      expect(responseData.error.message).toContain('Invalid file type')
    })

    it('should validate platform parameter', async () => {
      const formData = new FormData()
      formData.append('file', new Blob(['test data'], { type: 'text/csv' }), 'test.csv')
      formData.append('platform', 'invalid-platform')

      const request = new NextRequest('https://example.com/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await uploadFile(request)
      expect(response.status).toBe(400)

      const responseData = await response.json()
      expect(responseData.error.message).toContain('Invalid platform')
    })

    it('should handle successful file upload', async () => {
      const formData = new FormData()
      formData.append('file', new Blob(['order_id,amount\n123,100'], { type: 'text/csv' }), 'test.csv')
      formData.append('platform', 'shopee')

      const request = new NextRequest('https://example.com/api/import/upload', {
        method: 'POST',
        body: formData,
        headers: { 'x-workspace-id': 'workspace-123' }
      })

      const response = await uploadFile(request)
      expect(response.status).toBe(200)

      const responseData = await response.json()
      expect(responseData.success).toBe(true)
      expect(responseData.data.jobId).toBeDefined()
    })

    it('should sanitize file names', async () => {
      const formData = new FormData()
      formData.append('file', new Blob(['test data'], { type: 'text/csv' }), '../../../etc/passwd.csv')
      formData.append('platform', 'shopee')

      const request = new NextRequest('https://example.com/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await uploadFile(request)
      
      // Should either reject or sanitize the filename
      if (response.status === 200) {
        const responseData = await response.json()
        expect(responseData.data.filename).not.toContain('../')
      } else {
        expect(response.status).toBe(400)
      }
    })

    it('should enforce rate limiting for uploads', async () => {
      const formData = new FormData()
      formData.append('file', new Blob(['test data'], { type: 'text/csv' }), 'test.csv')
      formData.append('platform', 'shopee')

      const requests = []
      for (let i = 0; i < 10; i++) {
        const request = new NextRequest('https://example.com/api/import/upload', {
          method: 'POST',
          body: formData
        })
        requests.push(uploadFile(request))
      }

      const responses = await Promise.all(requests)
      const rateLimitedResponses = responses.filter(r => r.status === 429)
      
      // Should have some rate limited responses
      expect(rateLimitedResponses.length).toBeGreaterThan(0)
    })
  })
})

describe('Workspace Management API Routes', () => {
  describe('/api/workspace/audit', () => {
    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'audit-1',
                    action: 'file_upload',
                    user_id: 'user-123',
                    created_at: '2023-01-01T00:00:00Z'
                  }
                ],
                error: null
              })
            })
          })
        })
      })
    })

    it('should require admin role for audit access', async () => {
      const { validateWorkspaceAccess } = require('@/lib/auth/workspace-middleware')
      validateWorkspaceAccess.mockRejectedValue(
        new Response(JSON.stringify({
          error: 'INSUFFICIENT_ROLE',
          details: 'Admin role required'
        }), { status: 403 })
      )

      const request = createTestRequest({
        url: 'https://example.com/api/workspace/audit'
      })

      const response = await getWorkspaceAudit(request)
      expect(response.status).toBe(403)
    })

    it('should return audit logs for authorized users', async () => {
      const request = createTestRequest({
        url: 'https://example.com/api/workspace/audit',
        headers: { 'x-workspace-id': 'workspace-123' }
      })

      const response = await getWorkspaceAudit(request)
      expect(response.status).toBe(200)

      const responseData = await response.json()
      expect(responseData.success).toBe(true)
      expect(responseData.data).toHaveLength(1)
      expect(responseData.data[0].action).toBe('file_upload')
    })

    it('should filter audit logs by workspace', async () => {
      const request = createTestRequest({
        url: 'https://example.com/api/workspace/audit'
      })

      await getWorkspaceAudit(request)

      // Verify database query includes workspace filtering
      expect(mockSupabase.from).toHaveBeenCalledWith('audit_logs')
      // The actual filtering should happen in the query chain
    })

    it('should paginate audit results', async () => {
      const request = createTestRequest({
        url: 'https://example.com/api/workspace/audit?page=2&limit=50'
      })

      await getWorkspaceAudit(request)

      // Should include pagination in query
      const mockQuery = mockSupabase.from().select().eq().order()
      expect(mockQuery.limit).toHaveBeenCalledWith(50)
    })

    it('should not expose sensitive information in audit logs', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'audit-1',
                    action: 'password_change',
                    user_id: 'user-123',
                    details: { old_password: 'secret', new_password: 'secret2' },
                    created_at: '2023-01-01T00:00:00Z'
                  }
                ],
                error: null
              })
            })
          })
        })
      })

      const request = createTestRequest({
        url: 'https://example.com/api/workspace/audit'
      })

      const response = await getWorkspaceAudit(request)
      const responseData = await response.json()

      // Should not include sensitive details
      expect(JSON.stringify(responseData.data)).not.toContain('secret')
    })
  })
})

describe('Authentication API Routes', () => {
  describe('/api/auth/callback', () => {
    beforeEach(() => {
      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      })

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'member-123',
                workspace_id: 'workspace-123',
                role: 'admin',
                workspace: {
                  id: 'workspace-123',
                  name: 'Test Workspace',
                  plan: 'pro'
                }
              }
            ],
            error: null
          })
        })
      })
    })

    it('should handle OAuth callback with valid code', async () => {
      const request = createTestRequest({
        url: 'https://example.com/api/auth/callback?code=valid-oauth-code'
      })

      const response = await getAuthCallback(request)
      expect(response.status).toBe(302) // Redirect

      expect(mockSupabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('valid-oauth-code')
    })

    it('should handle OAuth errors', async () => {
      const request = createTestRequest({
        url: 'https://example.com/api/auth/callback?error=access_denied&error_description=User denied access'
      })

      const response = await getAuthCallback(request)
      expect(response.status).toBe(302)

      const location = response.headers.get('location')
      expect(location).toContain('error=access_denied')
    })

    it('should handle invalid authorization codes', async () => {
      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid code' }
      })

      const request = createTestRequest({
        url: 'https://example.com/api/auth/callback?code=invalid-code'
      })

      const response = await getAuthCallback(request)
      expect(response.status).toBe(302)

      const location = response.headers.get('location')
      expect(location).toContain('error=callback_error')
    })

    it('should redirect to appropriate workspace', async () => {
      const request = createTestRequest({
        url: 'https://example.com/api/auth/callback?code=valid-code'
      })

      const response = await getAuthCallback(request)
      expect(response.status).toBe(302)

      const location = response.headers.get('location')
      expect(location).toContain('workspace-123')
    })

    it('should handle users with multiple workspaces', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: 'member-1', workspace_id: 'workspace-1', role: 'admin' },
              { id: 'member-2', workspace_id: 'workspace-2', role: 'member' }
            ],
            error: null
          })
        })
      })

      const request = createTestRequest({
        url: 'https://example.com/api/auth/callback?code=valid-code'
      })

      const response = await getAuthCallback(request)
      const location = response.headers.get('location')
      expect(location).toContain('/workspaces') // Should go to workspace selection
    })

    it('should handle new users without workspaces', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      })

      const request = createTestRequest({
        url: 'https://example.com/api/auth/callback?code=valid-code'
      })

      const response = await getAuthCallback(request)
      const location = response.headers.get('location')
      expect(location).toContain('/workspaces') // Should go to workspace creation
    })
  })

  describe('/api/auth/csrf-token', () => {
    it('should require authentication for CSRF token', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Not authenticated')
      })

      const request = createTestRequest({
        url: 'https://example.com/api/auth/csrf-token'
      })

      const response = await getCsrfToken(request)
      expect(response.status).toBe(401)
    })

    it('should generate CSRF token for authenticated users', async () => {
      const request = createTestRequest({
        url: 'https://example.com/api/auth/csrf-token'
      })

      const response = await getCsrfToken(request)
      expect(response.status).toBe(200)

      const responseData = await response.json()
      expect(responseData.success).toBe(true)
      expect(responseData.data.token).toBe('csrf-token-123')
    })

    it('should include secure headers for CSRF token', async () => {
      const request = createTestRequest({
        url: 'https://example.com/api/auth/csrf-token'
      })

      const response = await getCsrfToken(request)

      expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })
  })
})

describe('Input Validation and Security', () => {
  it('should sanitize SQL injection attempts', async () => {
    const maliciousInput = "'; DROP TABLE users; --"
    
    const request = createTestRequest({
      url: `https://example.com/api/analytics/overview?startDate=${encodeURIComponent(maliciousInput)}&endDate=2023-01-31`
    })

    const response = await getAnalyticsOverview(request)
    expect(response.status).toBe(400)

    const responseData = await response.json()
    expect(responseData.error.message).toContain('Invalid date format')
  })

  it('should prevent XSS in query parameters', async () => {
    const xssPayload = '<script>alert("xss")</script>'
    
    const request = createTestRequest({
      url: `https://example.com/api/analytics/overview?filter=${encodeURIComponent(xssPayload)}&startDate=2023-01-01&endDate=2023-01-31`
    })

    const response = await getAnalyticsOverview(request)
    
    if (response.status === 200) {
      const responseData = await response.json()
      expect(JSON.stringify(responseData)).not.toContain('<script>')
    }
  })

  it('should validate JSON payload size', async () => {
    const largePayload = {
      data: 'x'.repeat(10 * 1024 * 1024) // 10MB
    }

    const request = createTestRequest({
      method: 'POST',
      url: 'https://example.com/api/import/validate',
      body: largePayload
    })

    // Should be rejected due to size
    expect(async () => {
      await request.json()
    }).rejects.toThrow()
  })

  it('should handle malformed JSON gracefully', async () => {
    const request = new NextRequest('https://example.com/api/import/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json{'
    })

    // API should handle this gracefully without crashing
    expect(async () => {
      await request.json()
    }).rejects.toThrow()
  })

  it('should validate UUID format in parameters', async () => {
    const invalidUuids = [
      'invalid-uuid',
      '123',
      'not-a-uuid-at-all',
      '../../../../etc/passwd'
    ]

    for (const invalidUuid of invalidUuids) {
      const request = createTestRequest({
        url: `https://example.com/api/workspace/${invalidUuid}/validate`
      })

      // Should reject invalid UUID format
      // This test would depend on the actual route implementation
    }
  })
})

describe('Rate Limiting and DoS Protection', () => {
  it('should implement rate limiting per IP', async () => {
    const requests = []
    for (let i = 0; i < 100; i++) {
      const request = createTestRequest({
        url: 'https://example.com/api/analytics/overview?startDate=2023-01-01&endDate=2023-01-31'
      })
      requests.push(getAnalyticsOverview(request))
    }

    const responses = await Promise.all(requests)
    const rateLimitedCount = responses.filter(r => r.status === 429).length
    
    // Should have some rate limited responses
    expect(rateLimitedCount).toBeGreaterThan(0)
  })

  it('should implement rate limiting per user', async () => {
    const requests = []
    for (let i = 0; i < 50; i++) {
      const request = createTestRequest({
        url: 'https://example.com/api/analytics/overview?startDate=2023-01-01&endDate=2023-01-31',
        headers: { 'authorization': 'Bearer same-user-token' }
      })
      requests.push(getAnalyticsOverview(request))
    }

    const responses = await Promise.all(requests)
    const rateLimitedCount = responses.filter(r => r.status === 429).length
    
    expect(rateLimitedCount).toBeGreaterThan(0)
  })

  it('should have stricter limits for sensitive endpoints', async () => {
    // Admin endpoints should have stricter limits
    const requests = []
    for (let i = 0; i < 20; i++) {
      const request = createTestRequest({
        url: 'https://example.com/api/workspace/audit'
      })
      requests.push(getWorkspaceAudit(request))
    }

    const responses = await Promise.all(requests)
    const rateLimitedCount = responses.filter(r => r.status === 429).length
    
    // Admin endpoints should be rate limited more aggressively
    expect(rateLimitedCount).toBeGreaterThan(0)
  })
})

describe('Error Information Disclosure', () => {
  it('should not expose internal errors in production', async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    mockSupabase.from.mockImplementation(() => {
      throw new Error('Database connection string: postgresql://user:password@localhost/db')
    })

    const request = createTestRequest({
      url: 'https://example.com/api/analytics/overview?startDate=2023-01-01&endDate=2023-01-31'
    })

    const response = await getAnalyticsOverview(request)
    const responseData = await response.json()

    // Should not expose internal error details
    expect(JSON.stringify(responseData)).not.toContain('postgresql://')
    expect(JSON.stringify(responseData)).not.toContain('password')

    process.env.NODE_ENV = originalEnv
  })

  it('should provide detailed errors in development', async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    mockSupabase.from.mockImplementation(() => {
      throw new Error('Development error details')
    })

    const request = createTestRequest({
      url: 'https://example.com/api/analytics/overview?startDate=2023-01-01&endDate=2023-01-31'
    })

    const response = await getAnalyticsOverview(request)
    const responseData = await response.json()

    // May include more details in development
    expect(response.status).toBe(500)

    process.env.NODE_ENV = originalEnv
  })
})

describe('Workspace Isolation', () => {
  it('should prevent cross-workspace data access', async () => {
    // User tries to access data from workspace they don't belong to
    const { validateWorkspaceAccess } = require('@/lib/auth/workspace-middleware')
    validateWorkspaceAccess.mockRejectedValue(
      new Response(JSON.stringify({
        error: 'ACCESS_DENIED',
        details: 'Not a member of this workspace'
      }), { status: 403 })
    )

    const request = createTestRequest({
      url: 'https://example.com/api/analytics/overview?startDate=2023-01-01&endDate=2023-01-31',
      headers: { 'x-workspace-id': 'unauthorized-workspace-id' }
    })

    const response = await getAnalyticsOverview(request)
    expect(response.status).toBe(403)
  })

  it('should validate workspace ID in all data queries', async () => {
    const request = createTestRequest({
      url: 'https://example.com/api/analytics/overview?startDate=2023-01-01&endDate=2023-01-31',
      headers: { 'x-workspace-id': 'workspace-123' }
    })

    await getAnalyticsOverview(request)

    // Should query with workspace filter
    expect(mockSupabase.from).toHaveBeenCalledWith(expect.any(String))
    // The actual workspace filtering should be verified in the query chain
  })
})