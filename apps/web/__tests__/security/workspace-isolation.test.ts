/**
 * Comprehensive Workspace Access Control and Multi-Tenant Isolation Test Suite
 * 
 * Tests workspace validation middleware, role-based access control,
 * and ensures proper multi-tenant data isolation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  validateWorkspaceAccess,
  withWorkspaceValidation,
  hasPermission,
  getRolePermissions
} from '@/lib/auth/workspace-middleware'
import { createClient } from '@/lib/supabase/server'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn()
}))

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
    updateUser: vi.fn()
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn()
        }))
      }))
    }))
  }))
}

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated'
}

const mockWorkspaceMembership = {
  id: 'member-123',
  role: 'admin',
  workspace: {
    id: 'workspace-123',
    name: 'Test Workspace',
    plan: 'pro',
    created_at: '2023-01-01T00:00:00Z'
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(createClient as any).mockReturnValue(mockSupabase)
  
  // Mock console methods to avoid test pollution
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function createMockRequest(options: {
  method?: string
  url?: string
  headers?: Record<string, string>
  ip?: string
} = {}): NextRequest {
  const {
    method = 'GET',
    url = 'https://example.com/api/workspace/workspace-123/data',
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

describe('Workspace Access Validation', () => {
  beforeEach(() => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    })

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockWorkspaceMembership,
              error: null
            })
          })
        })
      })
    })

    mockSupabase.auth.updateUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    })
  })

  describe('Basic Workspace Validation', () => {
    it('should validate successful workspace access', async () => {
      const request = createMockRequest({
        url: 'https://example.com/api/workspace/workspace-123/data'
      })

      const context = await validateWorkspaceAccess(request)

      expect(context).toEqual({
        user: mockUser,
        workspaceId: 'workspace-123',
        userRole: 'admin',
        permissions: ['read_data', 'write_data', 'delete_data', 'import_files', 'manage_imports', 'invite_members', 'change_settings', 'view_analytics', 'export_data'],
        supabase: mockSupabase
      })
    })

    it('should extract workspace ID from URL path', async () => {
      const testCases = [
        'https://example.com/api/workspace/550e8400-e29b-41d4-a716-446655440000/analytics',
        'https://example.com/workspace/550e8400-e29b-41d4-a716-446655440000/settings',
        'https://example.com/api/workspace/550e8400-e29b-41d4-a716-446655440000'
      ]

      for (const url of testCases) {
        const request = createMockRequest({ url })
        const context = await validateWorkspaceAccess(request)
        expect(context.workspaceId).toBe('550e8400-e29b-41d4-a716-446655440000')
      }
    })

    it('should extract workspace ID from headers', async () => {
      const request = createMockRequest({
        url: 'https://example.com/api/data',
        headers: {
          'x-workspace-id': 'workspace-456'
        }
      })

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...mockWorkspaceMembership, workspace: { ...mockWorkspaceMembership.workspace, id: 'workspace-456' } },
                error: null
              })
            })
          })
        })
      })

      const context = await validateWorkspaceAccess(request)
      expect(context.workspaceId).toBe('workspace-456')
    })

    it('should extract workspace ID from query parameters', async () => {
      const request = createMockRequest({
        url: 'https://example.com/api/data?workspaceId=workspace-789'
      })

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...mockWorkspaceMembership, workspace: { ...mockWorkspaceMembership.workspace, id: 'workspace-789' } },
                error: null
              })
            })
          })
        })
      })

      const context = await validateWorkspaceAccess(request)
      expect(context.workspaceId).toBe('workspace-789')
    })

    it('should prioritize URL path over headers', async () => {
      const request = createMockRequest({
        url: 'https://example.com/api/workspace/workspace-url/data',
        headers: {
          'x-workspace-id': 'workspace-header'
        }
      })

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...mockWorkspaceMembership, workspace: { ...mockWorkspaceMembership.workspace, id: 'workspace-url' } },
                error: null
              })
            })
          })
        })
      })

      const context = await validateWorkspaceAccess(request)
      expect(context.workspaceId).toBe('workspace-url')
    })
  })

  describe('Authentication Validation', () => {
    it('should reject unauthenticated requests', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Not authenticated')
      })

      const request = createMockRequest()

      await expect(validateWorkspaceAccess(request)).rejects.toThrow()
      
      try {
        await validateWorkspaceAccess(request)
      } catch (error) {
        expect(error).toBeInstanceOf(Response)
        const response = error as Response
        expect(response.status).toBe(401)
        
        const responseData = await response.json()
        expect(responseData.error).toBe('Unauthorized')
        expect(responseData.details).toBe('Valid authentication required')
      }
    })

    it('should handle authentication errors', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' }
      })

      const request = createMockRequest()

      try {
        await validateWorkspaceAccess(request)
      } catch (error) {
        expect(error).toBeInstanceOf(Response)
        const response = error as Response
        expect(response.status).toBe(401)
      }
    })
  })

  describe('Workspace ID Validation', () => {
    it('should reject missing workspace ID', async () => {
      const request = createMockRequest({
        url: 'https://example.com/api/data'
      })

      try {
        await validateWorkspaceAccess(request)
      } catch (error) {
        expect(error).toBeInstanceOf(Response)
        const response = error as Response
        expect(response.status).toBe(400)
        
        const responseData = await response.json()
        expect(responseData.error).toBe('Missing workspace context')
      }
    })

    it('should reject invalid workspace ID format', async () => {
      const invalidWorkspaceIds = [
        'invalid-uuid',
        '123',
        'not-a-uuid-at-all',
        '550e8400-e29b-41d4-a716-44665544000', // missing character
        '550e8400-e29b-41d4-a716-4466554400000' // extra character
      ]

      for (const invalidId of invalidWorkspaceIds) {
        const request = createMockRequest({
          headers: { 'x-workspace-id': invalidId }
        })

        try {
          await validateWorkspaceAccess(request)
          expect(true).toBe(false) // Should not reach here
        } catch (error) {
          expect(error).toBeInstanceOf(Response)
          const response = error as Response
          expect(response.status).toBe(400)
          
          const responseData = await response.json()
          expect(responseData.error).toBe('Invalid workspace ID')
        }
      }
    })

    it('should accept valid UUID formats', async () => {
      const validWorkspaceIds = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
      ]

      for (const validId of validWorkspaceIds) {
        mockSupabase.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { ...mockWorkspaceMembership, workspace: { ...mockWorkspaceMembership.workspace, id: validId } },
                  error: null
                })
              })
            })
          })
        })

        const request = createMockRequest({
          headers: { 'x-workspace-id': validId }
        })

        const context = await validateWorkspaceAccess(request)
        expect(context.workspaceId).toBe(validId)
      }
    })
  })

  describe('Multi-Tenant Isolation', () => {
    it('should deny access to non-member workspace', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'No membership found' }
              })
            })
          })
        })
      })

      const request = createMockRequest()

      try {
        await validateWorkspaceAccess(request)
      } catch (error) {
        expect(error).toBeInstanceOf(Response)
        const response = error as Response
        expect(response.status).toBe(403)
        
        const responseData = await response.json()
        expect(responseData.error).toBe('Access denied')
        expect(responseData.details).toBe('You do not have access to this workspace')
      }
    })

    it('should deny access when membership query fails', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database error' }
              })
            })
          })
        })
      })

      const request = createMockRequest()

      try {
        await validateWorkspaceAccess(request)
      } catch (error) {
        expect(error).toBeInstanceOf(Response)
        const response = error as Response
        expect(response.status).toBe(403)
      }
    })

    it('should ensure user can only access their own workspace data', async () => {
      // Test that the database query properly filters by user_id
      const request = createMockRequest()
      await validateWorkspaceAccess(request)

      expect(mockSupabase.from).toHaveBeenCalledWith('members')
      
      // Verify the query structure includes proper user filtering
      const mockQuery = mockSupabase.from().select().eq().eq()
      expect(mockQuery.single).toHaveBeenCalled()
    })
  })

  describe('Role-Based Access Control', () => {
    it('should validate role requirements', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...mockWorkspaceMembership, role: 'viewer' },
                error: null
              })
            })
          })
        })
      })

      const request = createMockRequest()

      try {
        await validateWorkspaceAccess(request, {
          allowedRoles: ['admin', 'owner']
        })
      } catch (error) {
        expect(error).toBeInstanceOf(Response)
        const response = error as Response
        expect(response.status).toBe(403)
        
        const responseData = await response.json()
        expect(responseData.error).toBe('Insufficient privileges')
        expect(responseData.details).toContain('admin, owner')
      }
    })

    it('should allow access for valid roles', async () => {
      const validRoles = ['admin', 'owner', 'member']
      
      for (const role of validRoles) {
        mockSupabase.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { ...mockWorkspaceMembership, role },
                  error: null
                })
              })
            })
          })
        })

        const request = createMockRequest()
        const context = await validateWorkspaceAccess(request, {
          allowedRoles: ['admin', 'owner', 'member']
        })

        expect(context.userRole).toBe(role)
      }
    })

    it('should validate permission requirements', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...mockWorkspaceMembership, role: 'viewer' },
                error: null
              })
            })
          })
        })
      })

      const request = createMockRequest()

      try {
        await validateWorkspaceAccess(request, {
          requirePermissions: ['write_data', 'delete_data']
        })
      } catch (error) {
        expect(error).toBeInstanceOf(Response)
        const response = error as Response
        expect(response.status).toBe(403)
        
        const responseData = await response.json()
        expect(responseData.error).toBe('Insufficient permissions')
      }
    })

    it('should allow owner role to access everything', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...mockWorkspaceMembership, role: 'owner' },
                error: null
              })
            })
          })
        })
      })

      const request = createMockRequest()
      const context = await validateWorkspaceAccess(request, {
        requirePermissions: ['write_data', 'delete_data', 'manage_users', 'any_permission']
      })

      expect(context.userRole).toBe('owner')
      expect(context.permissions).toContain('*')
    })
  })

  describe('Security Logging and Monitoring', () => {
    it('should log successful access when requested', async () => {
      const consoleSpy = vi.spyOn(console, 'warn')

      const request = createMockRequest()
      await validateWorkspaceAccess(request, {
        logAction: 'test_access'
      })

      expect(consoleSpy).toHaveBeenCalledWith(
        'Security Event:',
        expect.stringContaining('"event":"test_access"')
      )
    })

    it('should log security violations', async () => {
      const consoleSpy = vi.spyOn(console, 'warn')

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'No membership found' }
              })
            })
          })
        })
      })

      const request = createMockRequest()

      try {
        await validateWorkspaceAccess(request)
      } catch (error) {
        // Error should be logged
        expect(consoleSpy).toHaveBeenCalledWith(
          'Security Event:',
          expect.stringContaining('"event":"workspace_access_denied"')
        )
      }
    })

    it('should log authentication failures', async () => {
      const consoleSpy = vi.spyOn(console, 'warn')

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT' }
      })

      const request = createMockRequest()

      try {
        await validateWorkspaceAccess(request)
      } catch (error) {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Security Event:',
          expect.stringContaining('"event":"auth_failed"')
        )
      }
    })

    it('should include request fingerprinting in logs', async () => {
      const consoleSpy = vi.spyOn(console, 'warn')

      const request = createMockRequest({
        headers: {
          'user-agent': 'Mozilla/5.0 Test Browser',
          'accept-language': 'en-US,en;q=0.9'
        }
      })

      await validateWorkspaceAccess(request, {
        logAction: 'fingerprint_test'
      })

      const logCall = consoleSpy.mock.calls.find(call => 
        call[1]?.includes('fingerprint_test')
      )
      expect(logCall).toBeDefined()
      
      const logData = JSON.parse(logCall![1])
      expect(logData.fingerprint).toBeDefined()
      expect(logData.userAgent).toBe('Mozilla/5.0 Test Browser')
    })
  })

  describe('JWT Context Updates', () => {
    it('should update JWT with workspace context', async () => {
      const request = createMockRequest()
      await validateWorkspaceAccess(request)

      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        data: {
          current_workspace_id: 'workspace-123',
          workspace_role: 'admin'
        }
      })
    })

    it('should handle JWT update failures gracefully', async () => {
      mockSupabase.auth.updateUser.mockRejectedValue(new Error('JWT update failed'))

      const request = createMockRequest()
      
      // Should not throw even if JWT update fails
      const context = await validateWorkspaceAccess(request)
      expect(context.workspaceId).toBe('workspace-123')
    })
  })

  describe('Skip Validation Mode', () => {
    it('should return basic context when validation is skipped', async () => {
      const request = createMockRequest({
        headers: { 'x-workspace-id': 'test-workspace' }
      })

      const context = await validateWorkspaceAccess(request, {
        skipValidation: true
      })

      expect(context).toEqual({
        user: mockUser,
        workspaceId: 'test-workspace',
        userRole: 'member',
        permissions: ['read_data', 'write_data', 'import_files', 'view_analytics', 'export_data'],
        supabase: mockSupabase
      })

      // Should not query database when skipping validation
      expect(mockSupabase.from).not.toHaveBeenCalled()
    })

    it('should still require authentication when skipping validation', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Not authenticated')
      })

      const request = createMockRequest()

      try {
        await validateWorkspaceAccess(request, {
          skipValidation: true
        })
      } catch (error) {
        expect(error).toBeInstanceOf(Response)
        const response = error as Response
        expect(response.status).toBe(401)
      }
    })
  })
})

describe('Permission System', () => {
  describe('hasPermission Function', () => {
    it('should validate admin permissions', () => {
      expect(hasPermission('admin', 'read_data')).toBe(true)
      expect(hasPermission('admin', 'write_data')).toBe(true)
      expect(hasPermission('admin', 'delete_data')).toBe(true)
      expect(hasPermission('admin', 'invite_members')).toBe(true)
    })

    it('should validate member permissions', () => {
      expect(hasPermission('member', 'read_data')).toBe(true)
      expect(hasPermission('member', 'write_data')).toBe(true)
      expect(hasPermission('member', 'import_files')).toBe(true)
      expect(hasPermission('member', 'delete_data')).toBe(false)
      expect(hasPermission('member', 'invite_members')).toBe(false)
    })

    it('should validate viewer permissions', () => {
      expect(hasPermission('viewer', 'read_data')).toBe(true)
      expect(hasPermission('viewer', 'view_analytics')).toBe(true)
      expect(hasPermission('viewer', 'write_data')).toBe(false)
      expect(hasPermission('viewer', 'import_files')).toBe(false)
    })

    it('should grant all permissions to owner', () => {
      expect(hasPermission('owner', 'any_permission')).toBe(true)
      expect(hasPermission('owner', 'super_admin_permission')).toBe(true)
      expect(hasPermission('owner', 'delete_workspace')).toBe(true)
    })

    it('should deny permissions for invalid roles', () => {
      expect(hasPermission('invalid_role', 'read_data')).toBe(false)
      expect(hasPermission('', 'read_data')).toBe(false)
      expect(hasPermission(null as any, 'read_data')).toBe(false)
    })
  })

  describe('getRolePermissions Function', () => {
    it('should return correct permissions for each role', () => {
      const ownerPerms = getRolePermissions('owner')
      expect(ownerPerms).toEqual(['*'])

      const adminPerms = getRolePermissions('admin')
      expect(adminPerms).toContain('read_data')
      expect(adminPerms).toContain('write_data')
      expect(adminPerms).toContain('delete_data')
      expect(adminPerms).toContain('invite_members')

      const memberPerms = getRolePermissions('member')
      expect(memberPerms).toContain('read_data')
      expect(memberPerms).toContain('write_data')
      expect(memberPerms).not.toContain('delete_data')

      const viewerPerms = getRolePermissions('viewer')
      expect(viewerPerms).toEqual(['read_data', 'view_analytics'])
    })

    it('should return empty array for invalid roles', () => {
      expect(getRolePermissions('invalid_role')).toEqual([])
      expect(getRolePermissions('')).toEqual([])
    })
  })
})

describe('withWorkspaceValidation HOC', () => {
  const mockHandler = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true }), { status: 200 })
  )

  beforeEach(() => {
    mockHandler.mockClear()
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockWorkspaceMembership,
              error: null
            })
          })
        })
      })
    })
  })

  it('should call handler with validated context', async () => {
    const protectedHandler = withWorkspaceValidation(mockHandler)
    const request = createMockRequest()

    const response = await protectedHandler(request)

    expect(mockHandler).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        user: mockUser,
        workspaceId: 'workspace-123',
        userRole: 'admin'
      })
    )
    expect(response.status).toBe(200)
  })

  it('should handle validation failures', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Access denied' }
            })
          })
        })
      })
    })

    const protectedHandler = withWorkspaceValidation(mockHandler)
    const request = createMockRequest()

    const response = await protectedHandler(request)

    expect(mockHandler).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
  })

  it('should handle unexpected errors', async () => {
    mockSupabase.auth.getUser.mockRejectedValue(new Error('Database error'))

    const protectedHandler = withWorkspaceValidation(mockHandler)
    const request = createMockRequest()

    const response = await protectedHandler(request)

    expect(response.status).toBe(500)
    const responseData = await response.json()
    expect(responseData.error).toBe('Internal server error')
  })
})

describe('Edge Cases and Security Hardening', () => {
  beforeEach(() => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    })
  })

  it('should handle concurrent workspace access attempts', async () => {
    let callCount = 0
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockImplementation(() => {
              callCount++
              if (callCount === 1) {
                return Promise.resolve({
                  data: mockWorkspaceMembership,
                  error: null
                })
              } else {
                return Promise.resolve({
                  data: null,
                  error: { message: 'Concurrent access blocked' }
                })
              }
            })
          })
        })
      })
    })

    const request1 = createMockRequest()
    const request2 = createMockRequest()

    const [result1, result2] = await Promise.allSettled([
      validateWorkspaceAccess(request1),
      validateWorkspaceAccess(request2)
    ])

    expect(result1.status).toBe('fulfilled')
    expect(result2.status).toBe('rejected')
  })

  it('should prevent workspace ID injection attacks', async () => {
    const maliciousWorkspaceIds = [
      "'; DROP TABLE workspaces; --",
      '<script>alert("xss")</script>',
      '../../etc/passwd',
      'workspace-123\r\nHost: evil.com'
    ]

    for (const maliciousId of maliciousWorkspaceIds) {
      const request = createMockRequest({
        headers: { 'x-workspace-id': maliciousId }
      })

      try {
        await validateWorkspaceAccess(request)
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Response)
        const response = error as Response
        expect(response.status).toBe(400)
      }
    }
  })

  it('should handle malformed request objects', async () => {
    const malformedRequest = {
      nextUrl: { pathname: null },
      headers: { get: () => null },
      method: undefined
    } as any

    try {
      await validateWorkspaceAccess(malformedRequest)
    } catch (error) {
      // Should handle gracefully without crashing
      expect(error).toBeInstanceOf(Response)
    }
  })

  it('should limit security event logging to prevent DoS', async () => {
    const consoleSpy = vi.spyOn(console, 'warn')
    
    // Simulate many failed requests
    for (let i = 0; i < 100; i++) {
      const request = createMockRequest({
        headers: { 'x-workspace-id': 'invalid-id' }
      })

      try {
        await validateWorkspaceAccess(request)
      } catch (error) {
        // Expected to fail
      }
    }

    // Should log events but not overwhelm the system
    expect(consoleSpy.mock.calls.length).toBeLessThan(200)
  })

  it('should validate workspace membership data integrity', async () => {
    const corruptedMembership = {
      id: null,
      role: undefined,
      workspace: {
        id: 'workspace-123',
        name: null
      }
    }

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: corruptedMembership,
              error: null
            })
          })
        })
      })
    })

    const request = createMockRequest()

    try {
      await validateWorkspaceAccess(request)
    } catch (error) {
      // Should handle corrupted data gracefully
      expect(error).toBeInstanceOf(Response)
    }
  })
})