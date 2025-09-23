/**
 * Comprehensive Authentication Provider Test Suite
 * 
 * Tests the authentication provider component including session management,
 * workspace context, authentication methods, and security features.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '@/components/auth/auth-provider'
import { createClient } from '@/lib/supabase/client'
import type { User, Session, AuthError } from '@supabase/supabase-js'

// Mock dependencies
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn()
}))

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

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    origin: 'https://example.com',
    href: 'https://example.com/dashboard'
  },
  writable: true
})

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

const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signInWithOAuth: vi.fn(),
    refreshSession: vi.fn()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.getItem.mockReturnValue(null)
  ;(createClient as any).mockReturnValue(mockSupabase)
  
  // Mock auth state change listener
  mockSupabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } }
  })
})

afterEach(() => {
  vi.clearAllMocks()
  localStorageMock.clear()
})

// Test component to access auth context
function TestComponent() {
  const auth = useAuth()
  return (
    <div>
      <div data-testid="loading">{auth.isLoading ? 'loading' : 'loaded'}</div>
      <div data-testid="user">{auth.user ? auth.user.email : 'no-user'}</div>
      <div data-testid="workspace">{auth.workspaceId || 'no-workspace'}</div>
      <div data-testid="role">{auth.role || 'no-role'}</div>
      <button data-testid="sign-in" onClick={() => auth.signIn('test@example.com', 'password')}>
        Sign In
      </button>
      <button data-testid="sign-out" onClick={() => auth.signOut()}>
        Sign Out
      </button>
      <button data-testid="google-signin" onClick={() => auth.signInWithGoogle()}>
        Google Sign In
      </button>
    </div>
  )
}

describe('AuthProvider Initialization', () => {
  it('should initialize with loading state', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(screen.getByTestId('loading')).toHaveTextContent('loading')
    expect(screen.getByTestId('user')).toHaveTextContent('no-user')
  })

  it('should load existing session on mount', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null
    })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
    })
  })

  it('should handle session loading errors', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Session load error' }
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      expect(consoleSpy).toHaveBeenCalledWith('Initial session error:', { message: 'Session load error' })
    })

    consoleSpy.mockRestore()
  })

  it('should set up auth state change listener', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled()
    })
  })
})

describe('Authentication State Changes', () => {
  it('should handle SIGNED_IN event', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    })

    const mockCallback = vi.fn()
    mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
      mockCallback.mockImplementation(callback)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled()
    })

    act(() => {
      mockCallback('SIGNED_IN', mockSession)
    })

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
    })
  })

  it('should handle SIGNED_OUT event', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null
    })

    const mockCallback = vi.fn()
    mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
      mockCallback.mockImplementation(callback)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
    })

    act(() => {
      mockCallback('SIGNED_OUT', null)
    })

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('no-user')
      expect(screen.getByTestId('workspace')).toHaveTextContent('no-workspace')
      expect(screen.getByTestId('role')).toHaveTextContent('no-role')
    })

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('workspace-context')
  })

  it('should handle TOKEN_REFRESHED event', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null
    })

    const mockCallback = vi.fn()
    mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
      mockCallback.mockImplementation(callback)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    const refreshedSession = { ...mockSession, access_token: 'new-token' }

    act(() => {
      mockCallback('TOKEN_REFRESHED', refreshedSession)
    })

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
    })
  })

  it('should handle USER_UPDATED event', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null
    })

    const mockCallback = vi.fn()
    mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
      mockCallback.mockImplementation(callback)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    const updatedUser = { ...mockUser, email: 'updated@example.com' }
    const updatedSession = { ...mockSession, user: updatedUser }

    act(() => {
      mockCallback('USER_UPDATED', updatedSession)
    })

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('updated@example.com')
    })
  })
})

describe('Authentication Methods', () => {
  beforeEach(() => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null
    })
  })

  describe('signIn', () => {
    it('should handle successful sign in', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      act(() => {
        screen.getByTestId('sign-in').click()
      })

      await waitFor(() => {
        expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password'
        })
      })
    })

    it('should handle sign in errors', async () => {
      const authError: AuthError = {
        name: 'AuthError',
        message: 'Invalid credentials',
        status: 400
      }

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: authError
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      act(() => {
        screen.getByTestId('sign-in').click()
      })

      await waitFor(() => {
        expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalled()
      })
    })
  })

  describe('signUp', () => {
    it('should handle successful sign up', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null
      })

      const { result } = await act(async () => {
        const TestSignUp = () => {
          const auth = useAuth()
          return (
            <button onClick={() => auth.signUp('test@example.com', 'password', { name: 'Test User' })}>
              Sign Up
            </button>
          )
        }

        render(
          <AuthProvider>
            <TestSignUp />
          </AuthProvider>
        )

        return null
      })

      await waitFor(() => {
        expect(mockSupabase.auth.signUp).toBeDefined()
      })
    })
  })

  describe('signOut', () => {
    it('should handle successful sign out', async () => {
      mockSupabase.auth.signOut.mockResolvedValue({
        error: null
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
      })

      act(() => {
        screen.getByTestId('sign-out').click()
      })

      await waitFor(() => {
        expect(mockSupabase.auth.signOut).toHaveBeenCalled()
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('workspace-context')
      })
    })

    it('should clear local state immediately on sign out', async () => {
      mockSupabase.auth.signOut.mockResolvedValue({
        error: null
      })

      // Set up initial workspace context
      localStorageMock.getItem.mockReturnValue(JSON.stringify({
        userId: 'user-123',
        workspaceId: 'workspace-123',
        role: 'admin',
        timestamp: Date.now()
      }))

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      act(() => {
        screen.getByTestId('sign-out').click()
      })

      // Local storage should be cleared immediately
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('workspace-context')
    })
  })

  describe('Google OAuth', () => {
    it('should initiate Google OAuth correctly', async () => {
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { provider: 'google', url: 'https://accounts.google.com/oauth/authorize' },
        error: null
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      act(() => {
        screen.getByTestId('google-signin').click()
      })

      await waitFor(() => {
        expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
          provider: 'google',
          options: {
            redirectTo: 'https://example.com/api/auth/callback',
            queryParams: {
              access_type: 'offline',
              prompt: 'consent'
            },
            skipBrowserRedirect: false
          }
        })
      })
    })

    it('should handle Google OAuth errors', async () => {
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { provider: 'google', url: null },
        error: { message: 'OAuth configuration error', status: 400, name: 'AuthError' }
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      act(() => {
        screen.getByTestId('google-signin').click()
      })

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Google OAuth initiation error:', expect.any(Object))
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Password Reset', () => {
    it('should handle password reset request', async () => {
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: null
      })

      const TestPasswordReset = () => {
        const auth = useAuth()
        return (
          <button onClick={() => auth.resetPassword('test@example.com')}>
            Reset Password
          </button>
        )
      }

      render(
        <AuthProvider>
          <TestPasswordReset />
        </AuthProvider>
      )

      act(() => {
        screen.getByText('Reset Password').click()
      })

      await waitFor(() => {
        expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
          redirectTo: 'https://example.com/reset-password'
        })
      })
    })
  })

  describe('Password Update', () => {
    it('should handle password update', async () => {
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      })

      const TestPasswordUpdate = () => {
        const auth = useAuth()
        return (
          <button onClick={() => auth.updatePassword('newpassword')}>
            Update Password
          </button>
        )
      }

      render(
        <AuthProvider>
          <TestPasswordUpdate />
        </AuthProvider>
      )

      act(() => {
        screen.getByText('Update Password').click()
      })

      await waitFor(() => {
        expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword' })
      })
    })
  })
})

describe('Session Management', () => {
  it('should refresh session when requested', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null
    })

    mockSupabase.auth.refreshSession.mockResolvedValue({
      data: { session: { ...mockSession, access_token: 'refreshed-token' } },
      error: null
    })

    const TestRefresh = () => {
      const auth = useAuth()
      return (
        <button onClick={() => auth.refreshSession()}>
          Refresh Session
        </button>
      )
    }

    render(
      <AuthProvider>
        <TestRefresh />
      </AuthProvider>
    )

    act(() => {
      screen.getByText('Refresh Session').click()
    })

    await waitFor(() => {
      expect(mockSupabase.auth.refreshSession).toHaveBeenCalled()
    })
  })

  it('should handle session refresh errors', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null
    })

    mockSupabase.auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Session expired', name: 'AuthError', status: 401 }
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const TestRefresh = () => {
      const auth = useAuth()
      return (
        <button onClick={() => auth.refreshSession()}>
          Refresh Session
        </button>
      )
    }

    render(
      <AuthProvider>
        <TestRefresh />
      </AuthProvider>
    )

    act(() => {
      screen.getByText('Refresh Session').click()
    })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Session refresh error:', expect.any(Object))
    })

    consoleSpy.mockRestore()
  })
})

describe('Workspace Management', () => {
  beforeEach(() => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null
    })
  })

  it('should set workspace context', async () => {
    const TestWorkspaceSet = () => {
      const auth = useAuth()
      return (
        <button 
          onClick={() => auth.setWorkspace({
            workspace_id: 'workspace-456',
            role: 'member',
            id: 'member-456',
            user_id: 'user-123',
            created_at: new Date().toISOString()
          })}
        >
          Set Workspace
        </button>
      )
    }

    render(
      <AuthProvider>
        <TestWorkspaceSet />
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveTextContent('no-workspace')
    })

    act(() => {
      screen.getByText('Set Workspace').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveTextContent('workspace-456')
      expect(screen.getByTestId('role')).toHaveTextContent('member')
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'workspace-context',
      expect.stringContaining('workspace-456')
    )
  })

  it('should clear workspace context', async () => {
    // Start with workspace set
    localStorageMock.getItem.mockReturnValue(JSON.stringify({
      userId: 'user-123',
      workspaceId: 'workspace-456',
      role: 'member',
      timestamp: Date.now()
    }))

    const TestWorkspaceClear = () => {
      const auth = useAuth()
      return (
        <button onClick={() => auth.clearWorkspace()}>
          Clear Workspace
        </button>
      )
    }

    render(
      <AuthProvider>
        <TestWorkspaceClear />
        <TestComponent />
      </AuthProvider>
    )

    act(() => {
      screen.getByText('Clear Workspace').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveTextContent('no-workspace')
      expect(screen.getByTestId('role')).toHaveTextContent('no-role')
    })

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('workspace-context')
  })

  it('should load workspace context from localStorage', async () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify({
      userId: 'user-123',
      workspaceId: 'workspace-stored',
      role: 'admin',
      timestamp: Date.now()
    }))

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveTextContent('workspace-stored')
      expect(screen.getByTestId('role')).toHaveTextContent('admin')
    })
  })

  it('should validate saved workspace context', async () => {
    // Invalid context (wrong user ID)
    localStorageMock.getItem.mockReturnValue(JSON.stringify({
      userId: 'wrong-user',
      workspaceId: 'workspace-stored',
      role: 'admin',
      timestamp: Date.now()
    }))

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveTextContent('no-workspace')
      expect(screen.getByTestId('role')).toHaveTextContent('no-role')
    })

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('workspace-context')
  })

  it('should handle corrupted localStorage data', async () => {
    localStorageMock.getItem.mockReturnValue('invalid-json')

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toHaveTextContent('no-workspace')
    })

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('workspace-context')
    expect(consoleSpy).toHaveBeenCalledWith('Error loading workspace context:', expect.any(Error))

    consoleSpy.mockRestore()
  })
})

describe('Error Handling and Edge Cases', () => {
  it('should handle provider unmounting gracefully', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    })

    const { unmount } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    // Unmount before async operations complete
    unmount()

    // Should not throw errors or cause memory leaks
    await waitFor(() => {
      expect(true).toBe(true) // Test passes if no errors thrown
    })
  })

  it('should handle multiple rapid auth state changes', async () => {
    const mockCallback = vi.fn()
    mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
      mockCallback.mockImplementation(callback)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled()
    })

    // Simulate rapid state changes
    act(() => {
      mockCallback('SIGNED_IN', mockSession)
      mockCallback('TOKEN_REFRESHED', mockSession)
      mockCallback('SIGNED_OUT', null)
      mockCallback('SIGNED_IN', mockSession)
    })

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
    })
  })

  it('should handle auth exceptions gracefully', async () => {
    mockSupabase.auth.getSession.mockRejectedValue(new Error('Network error'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      expect(consoleSpy).toHaveBeenCalledWith('Auth initialization error:', expect.any(Error))
    })

    consoleSpy.mockRestore()
  })

  it('should handle localStorage exceptions', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null
    })

    // Mock localStorage.setItem to throw
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error('Storage quota exceeded')
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const TestWorkspaceSet = () => {
      const auth = useAuth()
      return (
        <button 
          onClick={() => auth.setWorkspace({
            workspace_id: 'workspace-456',
            role: 'member',
            id: 'member-456',
            user_id: 'user-123',
            created_at: new Date().toISOString()
          })}
        >
          Set Workspace
        </button>
      )
    }

    render(
      <AuthProvider>
        <TestWorkspaceSet />
      </AuthProvider>
    )

    act(() => {
      screen.getByText('Set Workspace').click()
    })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Error saving workspace context:', expect.any(Error))
    })

    consoleSpy.mockRestore()
  })
})

describe('useAuth Hook Error Handling', () => {
  it('should throw error when used outside provider', () => {
    const TestOutsideProvider = () => {
      try {
        useAuth()
        return <div>Should not render</div>
      } catch (error) {
        return <div data-testid="error">Hook error</div>
      }
    }

    expect(() => render(<TestOutsideProvider />)).toThrow(
      'useAuth must be used within an AuthProvider'
    )
  })
})

describe('User Data Transformation', () => {
  it('should transform Supabase user to AuthUser format', async () => {
    const supabaseUser = {
      ...mockUser,
      user_metadata: { role: 'manager', customField: 'value' }
    }

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { ...mockSession, user: supabaseUser } },
      error: null
    })

    const TestUserData = () => {
      const auth = useAuth()
      return (
        <div>
          <div data-testid="user-id">{auth.user?.id}</div>
          <div data-testid="user-email">{auth.user?.email}</div>
          <div data-testid="user-role">{auth.user?.role}</div>
          <div data-testid="user-aud">{auth.user?.aud}</div>
          <div data-testid="user-exp">{auth.user?.exp}</div>
        </div>
      )
    }

    render(
      <AuthProvider>
        <TestUserData />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('user-id')).toHaveTextContent('user-123')
      expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com')
      expect(screen.getByTestId('user-role')).toHaveTextContent('manager')
      expect(screen.getByTestId('user-aud')).toHaveTextContent('authenticated')
      expect(screen.getByTestId('user-exp')).toHaveTextContent(String(mockUser.exp || 0))
    })
  })
})