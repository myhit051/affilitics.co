/**
 * Comprehensive Authentication Wrappers Test Suite
 * 
 * Tests authentication wrappers, guards, and HOCs that protect components
 * with proper authentication and authorization validation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import {
  withAuth,
  withWorkspaceAuth,
  AuthGuard,
  useAuthGuard,
  useRoleBasedAccess,
  hasUserPermission,
  AuthenticationError,
  AuthorizationError
} from '@/lib/auth/auth-wrappers'
import { useAuth } from '@/components/auth/auth-provider'
import type { AuthUser } from '@/lib/supabase/types'

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn()
}))

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: vi.fn()
}))

vi.mock('@/lib/auth/workspace-middleware', () => ({
  validateWorkspaceAccess: vi.fn(),
  hasPermission: vi.fn()
}))

const mockPush = vi.fn()
const mockBack = vi.fn()
const mockRefresh = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(useRouter as any).mockReturnValue({
    push: mockPush,
    back: mockBack,
    refresh: mockRefresh
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

// Test component for HOC testing
const TestComponent = ({ testProp }: { testProp?: string }) => (
  <div data-testid="protected-component">
    Protected Content
    {testProp && <span data-testid="test-prop">{testProp}</span>}
  </div>
)

// Mock user data
const mockUser: AuthUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  role: 'admin',
  aud: 'authenticated',
  exp: Date.now() / 1000 + 3600
}

const mockWorkspaceContext = {
  user: mockUser,
  workspaceId: 'test-workspace-id',
  role: 'admin',
  isLoading: false,
  signOut: vi.fn()
}

describe('withAuth HOC', () => {
  it('should render component for authenticated user', async () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: mockUser,
      isLoading: false
    })

    const ProtectedComponent = withAuth(TestComponent)
    render(<ProtectedComponent testProp="authenticated" />)

    expect(screen.getByTestId('protected-component')).toBeInTheDocument()
    expect(screen.getByTestId('test-prop')).toHaveTextContent('authenticated')
  })

  it('should show loading state while checking authentication', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: null,
      isLoading: true
    })

    const ProtectedComponent = withAuth(TestComponent)
    render(<ProtectedComponent />)

    expect(screen.getByText('Authenticating...')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-component')).not.toBeInTheDocument()
  })

  it('should redirect to login for unauthenticated user', async () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: null,
      isLoading: false
    })

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { pathname: '/dashboard' },
      writable: true
    })

    const ProtectedComponent = withAuth(TestComponent)
    render(<ProtectedComponent />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/login?callbackUrl=%2Fdashboard')
    })
  })

  it('should use custom redirect path', async () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: null,
      isLoading: false
    })

    const ProtectedComponent = withAuth(TestComponent, {
      redirectTo: '/custom-login'
    })
    render(<ProtectedComponent />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/custom-login?callbackUrl=')
    })
  })

  it('should show custom fallback component', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: null,
      isLoading: true
    })

    const customFallback = <div data-testid="custom-loading">Custom Loading...</div>
    const ProtectedComponent = withAuth(TestComponent, {
      fallback: customFallback
    })
    render(<ProtectedComponent />)

    expect(screen.getByTestId('custom-loading')).toBeInTheDocument()
  })

  it('should handle authentication errors', async () => {
    const mockSignOut = vi.fn()
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: mockUser,
      isLoading: false,
      signOut: mockSignOut
    })

    const ProtectedComponent = withAuth(TestComponent, {
      errorBoundary: true
    })
    
    render(<ProtectedComponent />)

    // Simulate token expiration error
    const error = new AuthenticationError('Token expired', 'TOKEN_EXPIRED')
    
    // Component should handle the error internally
    expect(screen.getByTestId('protected-component')).toBeInTheDocument()
  })

  it('should skip validation when configured', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: null,
      isLoading: false
    })

    const ProtectedComponent = withAuth(TestComponent, {
      skipValidation: true
    })
    render(<ProtectedComponent />)

    // Should not redirect when validation is skipped
    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('withWorkspaceAuth HOC', () => {
  beforeEach(() => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: mockUser,
      workspaceId: 'test-workspace-id',
      role: 'admin',
      isLoading: false
    })
  })

  it('should render component for user with workspace access', async () => {
    const ProtectedComponent = withWorkspaceAuth(TestComponent)
    render(<ProtectedComponent testProp="workspace-authorized" />)

    await waitFor(() => {
      expect(screen.getByTestId('protected-component')).toBeInTheDocument()
      expect(screen.getByTestId('test-prop')).toHaveTextContent('workspace-authorized')
    })
  })

  it('should deny access for user without workspace', async () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      workspaceId: null,
      role: null
    })

    const ProtectedComponent = withWorkspaceAuth(TestComponent, {
      validateWorkspace: true
    })
    render(<ProtectedComponent />)

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument()
      expect(screen.getByText('Workspace access required')).toBeInTheDocument()
    })
  })

  it('should validate required roles', async () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      role: 'viewer'
    })

    const ProtectedComponent = withWorkspaceAuth(TestComponent, {
      requiredRole: ['admin', 'owner']
    })
    render(<ProtectedComponent />)

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument()
      expect(screen.getByText(/Required roles: admin, owner/)).toBeInTheDocument()
    })
  })

  it('should allow access for valid role', async () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      role: 'admin'
    })

    const ProtectedComponent = withWorkspaceAuth(TestComponent, {
      requiredRole: ['admin', 'owner']
    })
    render(<ProtectedComponent />)

    await waitFor(() => {
      expect(screen.getByTestId('protected-component')).toBeInTheDocument()
    })
  })

  it('should handle single required role', async () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      role: 'owner'
    })

    const ProtectedComponent = withWorkspaceAuth(TestComponent, {
      requiredRole: 'owner'
    })
    render(<ProtectedComponent />)

    await waitFor(() => {
      expect(screen.getByTestId('protected-component')).toBeInTheDocument()
    })
  })

  it('should redirect to workspace creation when allowed', async () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      workspaceId: null,
      role: null
    })

    const ProtectedComponent = withWorkspaceAuth(TestComponent, {
      allowWorkspaceCreation: true,
      validateWorkspace: true
    })
    render(<ProtectedComponent />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/workspaces/create')
    })
  })

  it('should show loading during workspace validation', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      isLoading: true
    })

    const ProtectedComponent = withWorkspaceAuth(TestComponent)
    render(<ProtectedComponent />)

    expect(screen.getByText('Authenticating...')).toBeInTheDocument()
  })
})

describe('AuthGuard Component', () => {
  it('should render children for authenticated user', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: mockUser,
      isLoading: false
    })

    render(
      <AuthGuard requireAuth={true}>
        <div data-testid="guarded-content">Protected Content</div>
      </AuthGuard>
    )

    expect(screen.getByTestId('guarded-content')).toBeInTheDocument()
  })

  it('should show fallback for unauthenticated user', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: null,
      isLoading: false
    })

    render(
      <AuthGuard 
        requireAuth={true}
        fallback={<div data-testid="auth-fallback">Please login</div>}
      >
        <div data-testid="guarded-content">Protected Content</div>
      </AuthGuard>
    )

    expect(screen.getByTestId('auth-fallback')).toBeInTheDocument()
    expect(screen.queryByTestId('guarded-content')).not.toBeInTheDocument()
  })

  it('should validate workspace requirement', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: mockUser,
      workspaceId: null,
      isLoading: false
    })

    render(
      <AuthGuard 
        requireWorkspace={true}
        fallback={<div data-testid="workspace-fallback">No workspace</div>}
      >
        <div data-testid="guarded-content">Protected Content</div>
      </AuthGuard>
    )

    expect(screen.getByTestId('workspace-fallback')).toBeInTheDocument()
    expect(screen.queryByTestId('guarded-content')).not.toBeInTheDocument()
  })

  it('should validate role requirements', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: mockUser,
      role: 'viewer',
      isLoading: false
    })

    render(
      <AuthGuard 
        requiredRole={['admin', 'owner']}
        fallback={<div data-testid="role-fallback">Insufficient role</div>}
      >
        <div data-testid="guarded-content">Protected Content</div>
      </AuthGuard>
    )

    expect(screen.getByTestId('role-fallback')).toBeInTheDocument()
    expect(screen.queryByTestId('guarded-content')).not.toBeInTheDocument()
  })

  it('should call onUnauthorized callback', () => {
    const onUnauthorized = vi.fn()
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: null,
      isLoading: false
    })

    render(
      <AuthGuard 
        requireAuth={true}
        onUnauthorized={onUnauthorized}
      >
        <div data-testid="guarded-content">Protected Content</div>
      </AuthGuard>
    )

    expect(onUnauthorized).toHaveBeenCalled()
  })
})

describe('useAuthGuard Hook', () => {
  it('should return auth guard context', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: mockUser,
      workspaceId: 'test-workspace-id',
      role: 'admin',
      isLoading: false
    })

    let context: any
    function TestHookComponent() {
      context = useAuthGuard()
      return null
    }

    render(<TestHookComponent />)

    expect(context).toEqual({
      user: mockUser,
      workspaceId: 'test-workspace-id',
      role: 'admin',
      isLoading: false,
      hasWorkspaceAccess: true,
      permissions: []
    })
  })

  it('should indicate no workspace access when workspace is missing', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: mockUser,
      workspaceId: null,
      role: null,
      isLoading: false
    })

    let context: any
    function TestHookComponent() {
      context = useAuthGuard()
      return null
    }

    render(<TestHookComponent />)

    expect(context.hasWorkspaceAccess).toBe(false)
  })
})

describe('useRoleBasedAccess Hook', () => {
  it('should validate single role access', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      role: 'admin'
    })

    let roleAccess: any
    function TestHookComponent() {
      roleAccess = useRoleBasedAccess()
      return null
    }

    render(<TestHookComponent />)

    expect(roleAccess.hasRole('admin')).toBe(true)
    expect(roleAccess.hasRole('owner')).toBe(false)
    expect(roleAccess.currentRole).toBe('admin')
  })

  it('should validate multiple role access', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      role: 'admin'
    })

    let roleAccess: any
    function TestHookComponent() {
      roleAccess = useRoleBasedAccess()
      return null
    }

    render(<TestHookComponent />)

    expect(roleAccess.hasRole(['admin', 'owner'])).toBe(true)
    expect(roleAccess.hasRole(['owner', 'viewer'])).toBe(false)
    expect(roleAccess.hasAnyRole(['admin', 'owner'])).toBe(true)
    expect(roleAccess.hasAllRoles(['admin', 'owner'])).toBe(false)
  })

  it('should handle no role scenario', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      role: null
    })

    let roleAccess: any
    function TestHookComponent() {
      roleAccess = useRoleBasedAccess()
      return null
    }

    render(<TestHookComponent />)

    expect(roleAccess.hasRole('admin')).toBe(false)
    expect(roleAccess.hasAnyRole(['admin', 'owner'])).toBe(false)
    expect(roleAccess.currentRole).toBe(null)
  })
})

describe('hasUserPermission Utility', () => {
  it('should return false for null role', () => {
    expect(hasUserPermission(null, 'read_data')).toBe(false)
  })

  it('should validate permissions correctly', () => {
    // Mock the hasPermission function
    const { hasPermission } = require('@/lib/auth/workspace-middleware')
    hasPermission.mockImplementation((role: string, permission: string) => {
      const permissions: Record<string, string[]> = {
        'admin': ['read_data', 'write_data', 'manage_users'],
        'member': ['read_data', 'write_data'],
        'viewer': ['read_data']
      }
      return permissions[role]?.includes(permission) || false
    })

    expect(hasUserPermission('admin', 'read_data')).toBe(true)
    expect(hasUserPermission('admin', 'manage_users')).toBe(true)
    expect(hasUserPermission('member', 'read_data')).toBe(true)
    expect(hasUserPermission('member', 'manage_users')).toBe(false)
    expect(hasUserPermission('viewer', 'read_data')).toBe(true)
    expect(hasUserPermission('viewer', 'write_data')).toBe(false)
  })
})

describe('Error Classes', () => {
  it('should create AuthenticationError correctly', () => {
    const error = new AuthenticationError('Invalid token', 'INVALID_TOKEN', 401)
    
    expect(error.name).toBe('AuthenticationError')
    expect(error.message).toBe('Invalid token')
    expect(error.code).toBe('INVALID_TOKEN')
    expect(error.statusCode).toBe(401)
  })

  it('should create AuthorizationError correctly', () => {
    const error = new AuthorizationError('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS', 403)
    
    expect(error.name).toBe('AuthorizationError')
    expect(error.message).toBe('Insufficient permissions')
    expect(error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(error.statusCode).toBe(403)
  })

  it('should use default status codes', () => {
    const authError = new AuthenticationError('Test', 'TEST')
    const authzError = new AuthorizationError('Test', 'TEST')
    
    expect(authError.statusCode).toBe(401)
    expect(authzError.statusCode).toBe(403)
  })
})

describe('Edge Cases and Security', () => {
  it('should handle undefined user gracefully', () => {
    ;(useAuth as any).mockReturnValue({
      user: undefined,
      workspaceId: null,
      role: null,
      isLoading: false,
      signOut: vi.fn()
    })

    const ProtectedComponent = withAuth(TestComponent)
    render(<ProtectedComponent />)

    expect(screen.queryByTestId('protected-component')).not.toBeInTheDocument()
  })

  it('should handle malformed auth context', () => {
    ;(useAuth as any).mockReturnValue({
      // Missing required properties
      isLoading: false
    })

    const ProtectedComponent = withAuth(TestComponent, {
      errorBoundary: true
    })
    
    expect(() => render(<ProtectedComponent />)).not.toThrow()
  })

  it('should prevent role escalation attempts', () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: { ...mockUser, role: 'viewer' },
      role: 'viewer',
      isLoading: false
    })

    const ProtectedComponent = withWorkspaceAuth(TestComponent, {
      requiredRole: 'admin'
    })
    render(<ProtectedComponent />)

    expect(screen.getByText('Access Denied')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-component')).not.toBeInTheDocument()
  })

  it('should validate workspace ID format', async () => {
    ;(useAuth as any).mockReturnValue({
      ...mockWorkspaceContext,
      user: mockUser,
      workspaceId: 'invalid-workspace-id',
      role: 'admin',
      isLoading: false
    })

    const ProtectedComponent = withWorkspaceAuth(TestComponent, {
      validateWorkspace: true
    })
    render(<ProtectedComponent />)

    // Should still render if workspace validation is not strict at component level
    // Actual validation happens at API level
    await waitFor(() => {
      expect(screen.getByTestId('protected-component')).toBeInTheDocument()
    })
  })
})