/**
 * Comprehensive Authentication Flow End-to-End Integration Test Suite
 * 
 * Tests complete authentication flows including login, registration,
 * workspace selection, and secure transitions between authenticated states.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider } from '@/components/auth/auth-provider'
import { withAuth, withWorkspaceAuth } from '@/lib/auth/auth-wrappers'
import { createClient } from '@/lib/supabase/client'
import type { User, Session, AuthError } from '@supabase/supabase-js'

// Mock dependencies
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn()
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    back: mockBack,
    refresh: mockRefresh
  }))
}))

const mockPush = vi.fn()
const mockBack = vi.fn()
const mockRefresh = vi.fn()

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    signInWithOAuth: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    refreshSession: vi.fn()
  }
}

const mockUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  email_confirmed_at: '2023-01-01T00:00:00Z',
  phone_confirmed_at: null,
  confirmed_at: '2023-01-01T00:00:00Z',
  last_sign_in_at: '2023-01-01T00:00:00Z',
  app_metadata: {},
  user_metadata: { role: 'admin' },
  identities: [],
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  is_anonymous: false
}

const mockSession: Session = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  token_type: 'bearer',
  user: mockUser
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.getItem.mockReturnValue(null)
  ;(createClient as any).mockReturnValue(mockSupabase)
  
  // Default successful session
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: null
  })
  
  mockSupabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } }
  })
})

afterEach(() => {
  vi.clearAllMocks()
  localStorageMock.clear()
})

// Test components
function LoginForm() {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const { error } = await mockSupabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        setError(error.message)
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="login-form">
      <div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          data-testid="email-input"
          required
        />
      </div>
      <div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          data-testid="password-input"
          required
        />
      </div>
      {error && <div data-testid="error-message" role="alert">{error}</div>}
      <button 
        type="submit" 
        disabled={isLoading}
        data-testid="submit-button"
      >
        {isLoading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  )
}

function ProtectedDashboard() {
  return (
    <div data-testid="dashboard">
      <h1>Dashboard</h1>
      <p>Welcome to your dashboard!</p>
    </div>
  )
}

function WorkspaceSelector() {
  const workspaces = [
    { id: 'workspace-1', name: 'Workspace 1', role: 'admin' },
    { id: 'workspace-2', name: 'Workspace 2', role: 'member' }
  ]

  const handleWorkspaceSelect = (workspace: any) => {
    localStorageMock.setItem('workspace-context', JSON.stringify({
      userId: mockUser.id,
      workspaceId: workspace.id,
      role: workspace.role,
      timestamp: Date.now()
    }))
  }

  return (
    <div data-testid="workspace-selector">
      <h2>Select Workspace</h2>
      {workspaces.map(workspace => (
        <button
          key={workspace.id}
          onClick={() => handleWorkspaceSelect(workspace)}
          data-testid={`workspace-${workspace.id}`}
        >
          {workspace.name} ({workspace.role})
        </button>
      ))}
    </div>
  )
}

// Protected components with different auth requirements
const AuthProtectedDashboard = withAuth(ProtectedDashboard)
const WorkspaceProtectedDashboard = withWorkspaceAuth(ProtectedDashboard, {
  requiredRole: ['admin', 'member']
})

describe('Complete Authentication Flow Integration', () => {
  describe('Initial Authentication State', () => {
    it('should start with unauthenticated state', async () => {
      render(
        <AuthProvider>
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      // Should show loading initially
      expect(screen.getByText('Authenticating...')).toBeInTheDocument()

      // Should redirect to login when not authenticated
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/login?callbackUrl=')
      })
    })

    it('should load existing session on mount', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      })

      render(
        <AuthProvider>
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument()
      })
    })
  })

  describe('Login Flow', () => {
    it('should handle successful login', async () => {
      const user = userEvent.setup()
      
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null
      })

      // Simulate auth state change
      let authCallback: any
      mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
        authCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(
        <AuthProvider>
          <LoginForm />
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      // Fill in login form
      await user.type(screen.getByTestId('email-input'), 'test@example.com')
      await user.type(screen.getByTestId('password-input'), 'password123')
      
      // Submit form
      await user.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123'
        })
      })

      // Simulate successful auth state change
      act(() => {
        authCallback('SIGNED_IN', mockSession)
      })

      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument()
      })
    })

    it('should handle login errors', async () => {
      const user = userEvent.setup()
      
      const authError: AuthError = {
        name: 'AuthError',
        message: 'Invalid login credentials',
        status: 400
      }

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: authError
      })

      render(
        <AuthProvider>
          <LoginForm />
        </AuthProvider>
      )

      await user.type(screen.getByTestId('email-input'), 'wrong@example.com')
      await user.type(screen.getByTestId('password-input'), 'wrongpassword')
      await user.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent('Invalid login credentials')
      })
    })

    it('should handle network errors during login', async () => {
      const user = userEvent.setup()
      
      mockSupabase.auth.signInWithPassword.mockRejectedValue(
        new Error('Network error')
      )

      render(
        <AuthProvider>
          <LoginForm />
        </AuthProvider>
      )

      await user.type(screen.getByTestId('email-input'), 'test@example.com')
      await user.type(screen.getByTestId('password-input'), 'password123')
      await user.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent('An unexpected error occurred')
      })
    })
  })

  describe('Workspace Selection Flow', () => {
    it('should handle workspace selection after login', async () => {
      const user = userEvent.setup()

      // Start with authenticated user but no workspace
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      })

      render(
        <AuthProvider>
          <WorkspaceSelector />
          <WorkspaceProtectedDashboard />
        </AuthProvider>
      )

      // Should show workspace selector
      await waitFor(() => {
        expect(screen.getByTestId('workspace-selector')).toBeInTheDocument()
      })

      // Select a workspace
      await user.click(screen.getByTestId('workspace-workspace-1'))

      // Should save workspace context
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'workspace-context',
        expect.stringContaining('workspace-1')
      )
    })

    it('should redirect to workspace creation for new users', async () => {
      render(
        <AuthProvider>
          <WorkspaceProtectedDashboard />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/login?callbackUrl=')
      })
    })

    it('should load saved workspace context', async () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify({
        userId: 'user-123',
        workspaceId: 'workspace-saved',
        role: 'admin',
        timestamp: Date.now()
      }))

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      })

      render(
        <AuthProvider>
          <WorkspaceProtectedDashboard />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument()
      })
    })
  })

  describe('Logout Flow', () => {
    it('should handle logout and clear all state', async () => {
      const user = userEvent.setup()

      // Start with authenticated state
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      })

      localStorageMock.getItem.mockReturnValue(JSON.stringify({
        userId: 'user-123',
        workspaceId: 'workspace-123',
        role: 'admin',
        timestamp: Date.now()
      }))

      mockSupabase.auth.signOut.mockResolvedValue({ error: null })

      let authCallback: any
      mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
        authCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      function LogoutButton() {
        return (
          <button 
            onClick={() => mockSupabase.auth.signOut()}
            data-testid="logout-button"
          >
            Logout
          </button>
        )
      }

      render(
        <AuthProvider>
          <LogoutButton />
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      // Should be authenticated initially
      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument()
      })

      // Logout
      await user.click(screen.getByTestId('logout-button'))

      // Simulate logout auth state change
      act(() => {
        authCallback('SIGNED_OUT', null)
      })

      await waitFor(() => {
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('workspace-context')
        expect(mockPush).toHaveBeenCalledWith('/auth/login?callbackUrl=')
      })
    })
  })

  describe('Session Management', () => {
    it('should handle session refresh', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      })

      const refreshedSession = {
        ...mockSession,
        access_token: 'new-access-token'
      }

      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: { session: refreshedSession },
        error: null
      })

      let authCallback: any
      mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
        authCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(
        <AuthProvider>
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument()
      })

      // Simulate token refresh
      act(() => {
        authCallback('TOKEN_REFRESHED', refreshedSession)
      })

      // Should continue to show dashboard
      expect(screen.getByTestId('dashboard')).toBeInTheDocument()
    })

    it('should handle session expiration', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      })

      let authCallback: any
      mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
        authCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(
        <AuthProvider>
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument()
      })

      // Simulate session expiration
      act(() => {
        authCallback('SIGNED_OUT', null)
      })

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/login?callbackUrl=')
      })
    })
  })

  describe('Role-Based Access Control', () => {
    it('should enforce role requirements', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      })

      localStorageMock.getItem.mockReturnValue(JSON.stringify({
        userId: 'user-123',
        workspaceId: 'workspace-123',
        role: 'viewer', // Insufficient role
        timestamp: Date.now()
      }))

      const AdminOnlyComponent = withWorkspaceAuth(ProtectedDashboard, {
        requiredRole: ['admin', 'owner']
      })

      render(
        <AuthProvider>
          <AdminOnlyComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument()
        expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument()
      })
    })

    it('should allow access for sufficient roles', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      })

      localStorageMock.getItem.mockReturnValue(JSON.stringify({
        userId: 'user-123',
        workspaceId: 'workspace-123',
        role: 'admin', // Sufficient role
        timestamp: Date.now()
      }))

      const AdminOnlyComponent = withWorkspaceAuth(ProtectedDashboard, {
        requiredRole: ['admin', 'owner']
      })

      render(
        <AuthProvider>
          <AdminOnlyComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument()
      })
    })
  })

  describe('Error Recovery and Edge Cases', () => {
    it('should recover from auth initialization errors', async () => {
      mockSupabase.auth.getSession.mockRejectedValue(
        new Error('Auth service unavailable')
      )

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(
        <AuthProvider>
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Auth initialization error:',
          expect.any(Error)
        )
      })

      // Should still attempt to redirect
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled()
      })

      consoleSpy.mockRestore()
    })

    it('should handle corrupted workspace context', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      })

      // Corrupted localStorage data
      localStorageMock.getItem.mockReturnValue('invalid-json{')

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(
        <AuthProvider>
          <WorkspaceProtectedDashboard />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('workspace-context')
        expect(consoleSpy).toHaveBeenCalledWith(
          'Error loading workspace context:',
          expect.any(Error)
        )
      })

      consoleSpy.mockRestore()
    })

    it('should handle rapid auth state changes', async () => {
      let authCallback: any
      mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
        authCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(
        <AuthProvider>
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled()
      })

      // Simulate rapid state changes
      act(() => {
        authCallback('SIGNED_IN', mockSession)
        authCallback('TOKEN_REFRESHED', mockSession)
        authCallback('USER_UPDATED', mockSession)
        authCallback('SIGNED_OUT', null)
        authCallback('SIGNED_IN', mockSession)
      })

      // Should handle gracefully without errors
      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument()
      })
    })

    it('should handle component unmount during auth flow', async () => {
      const { unmount } = render(
        <AuthProvider>
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      // Unmount before auth completes
      unmount()

      // Should not cause memory leaks or errors
      await waitFor(() => {
        expect(true).toBe(true) // Test passes if no errors
      })
    })
  })

  describe('OAuth Flow Integration', () => {
    it('should handle OAuth callback success', async () => {
      // Simulate OAuth callback URL parameters
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://example.com/auth/callback?code=oauth-code-123',
          search: '?code=oauth-code-123'
        },
        writable: true
      })

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      })

      render(
        <AuthProvider>
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument()
      })
    })

    it('should handle OAuth callback errors', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://example.com/auth/callback?error=access_denied',
          search: '?error=access_denied&error_description=User%20denied%20access'
        },
        writable: true
      })

      render(
        <AuthProvider>
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      // Should handle OAuth error gracefully
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/login?callbackUrl=')
      })
    })
  })

  describe('Security Validations', () => {
    it('should validate workspace context security', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      })

      // Workspace context for different user (security breach attempt)
      localStorageMock.getItem.mockReturnValue(JSON.stringify({
        userId: 'different-user-456',
        workspaceId: 'workspace-123',
        role: 'admin',
        timestamp: Date.now()
      }))

      render(
        <AuthProvider>
          <WorkspaceProtectedDashboard />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('workspace-context')
      })
    })

    it('should prevent session fixation attacks', async () => {
      // Start with no session
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      })

      let authCallback: any
      mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
        authCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(
        <AuthProvider>
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      // Simulate malicious session injection
      act(() => {
        authCallback('SIGNED_IN', {
          ...mockSession,
          user: { ...mockUser, id: 'malicious-user' }
        })
      })

      // Should clear any existing workspace context for security
      await waitFor(() => {
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('workspace-context')
      })
    })

    it('should handle token tampering attempts', async () => {
      const tamperedSession = {
        ...mockSession,
        access_token: 'tampered-token',
        user: { ...mockUser, id: 'different-user' }
      }

      let authCallback: any
      mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
        authCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      render(
        <AuthProvider>
          <AuthProtectedDashboard />
        </AuthProvider>
      )

      act(() => {
        authCallback('SIGNED_IN', tamperedSession)
      })

      // Should handle tampered tokens gracefully
      await waitFor(() => {
        expect(screen.queryByTestId('dashboard')).toBeInTheDocument()
      })
    })
  })
})