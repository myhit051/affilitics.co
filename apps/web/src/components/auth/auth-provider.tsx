'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { User, AuthError, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { AuthContext, WorkspaceMember } from '@/lib/supabase/types'

interface AuthProviderState extends AuthContext {
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signUp: (email: string, password: string, metadata?: any) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>
  signInWithGoogle: () => Promise<{ error: AuthError | null }>
  refreshSession: () => Promise<void>
  setWorkspace: (workspace: WorkspaceMember) => void
  clearWorkspace: () => void
  session: Session | null
}

const AuthProviderContext = createContext<AuthProviderState>({
  user: null,
  workspaceId: null,
  role: null,
  isLoading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
  resetPassword: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  signInWithGoogle: async () => ({ error: null }),
  refreshSession: async () => {},
  setWorkspace: () => {},
  clearWorkspace: () => {},
  session: null
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [supabase] = useState(() => createClient())

  // Security: Session refresh handler with error handling
  const refreshSession = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession()
      if (error) {
        console.error('Session refresh error:', error)
        // Security: Clear invalid session
        setSession(null)
        setUser(null)
        return
      }
      setSession(session)
      setUser(session?.user || null)
    } catch (error) {
      console.error('Unexpected session refresh error:', error)
      setSession(null)
      setUser(null)
    }
  }, [supabase])

  // Security: Initialize auth state and set up listeners
  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      try {
        // Get initial session
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Initial session error:', error)
        }

        if (mounted) {
          setSession(session)
          setUser(session?.user || null)
          setIsLoading(false)
        }

        // Security: Set up auth state change listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (!mounted) return

            console.log('Auth state change:', event)

            // Security: Handle different auth events
            switch (event) {
              case 'SIGNED_IN':
                setSession(session)
                setUser(session?.user || null)
                break
              case 'SIGNED_OUT':
                setSession(null)
                setUser(null)
                setWorkspaceId(null)
                setRole(null)
                // Security: Clear any cached data
                localStorage.removeItem('workspace-context')
                break
              case 'TOKEN_REFRESHED':
                setSession(session)
                setUser(session?.user || null)
                break
              case 'USER_UPDATED':
                setSession(session)
                setUser(session?.user || null)
                break
              default:
                break
            }

            setIsLoading(false)
          }
        )

        return () => {
          subscription.unsubscribe()
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    initializeAuth()

    return () => {
      mounted = false
    }
  }, [supabase])

  // Security: Load workspace context from localStorage on mount
  useEffect(() => {
    if (user && !workspaceId) {
      try {
        const saved = localStorage.getItem('workspace-context')
        if (saved) {
          const context = JSON.parse(saved)
          // Security: Validate saved context
          if (context.userId === user.id && context.workspaceId && context.role) {
            setWorkspaceId(context.workspaceId)
            setRole(context.role)
          } else {
            // Security: Clear invalid saved context
            localStorage.removeItem('workspace-context')
          }
        }
      } catch (error) {
        console.error('Error loading workspace context:', error)
        localStorage.removeItem('workspace-context')
      }
    }
  }, [user, workspaceId])

  // Authentication methods
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      return { error }
    } catch (error) {
      return { error: error as AuthError }
    }
  }, [supabase])

  const signUp = useCallback(async (email: string, password: string, metadata?: any) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata
        }
      })
      return { error }
    } catch (error) {
      return { error: error as AuthError }
    }
  }, [supabase])

  const signOut = useCallback(async () => {
    try {
      // Security: Clear local state immediately
      setWorkspaceId(null)
      setRole(null)
      localStorage.removeItem('workspace-context')
      
      const { error } = await supabase.auth.signOut()
      return { error }
    } catch (error) {
      return { error: error as AuthError }
    }
  }, [supabase])

  const resetPassword = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      return { error }
    } catch (error) {
      return { error: error as AuthError }
    }
  }, [supabase])

  const updatePassword = useCallback(async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password })
      return { error }
    } catch (error) {
      return { error: error as AuthError }
    }
  }, [supabase])

  const signInWithGoogle = useCallback(async () => {
    try {
      // Security: Get the current URL for proper redirect handling
      const currentUrl = window.location.href
      const redirectUrl = `${window.location.origin}/api/auth/callback`
      
      console.log('Initiating Google OAuth with redirect:', redirectUrl)
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          // Security: Add query string to preserve state
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          // Security: Skip session confirmation for smoother UX
          skipBrowserRedirect: false
        }
      })
      
      if (error) {
        console.error('Google OAuth initiation error:', error)
        // Security: Provide specific error details for debugging
        if (error.message.includes('400')) {
          console.error('OAuth Configuration Error: Check Google OAuth setup in Supabase dashboard')
        }
      }
      
      return { error }
    } catch (error) {
      console.error('Unexpected Google OAuth error:', error)
      return { error: error as AuthError }
    }
  }, [supabase])

  // Workspace management
  const setWorkspace = useCallback((workspace: WorkspaceMember) => {
    setWorkspaceId(workspace.workspace_id)
    setRole(workspace.role)
    
    // Security: Save workspace context to localStorage
    try {
      localStorage.setItem('workspace-context', JSON.stringify({
        userId: user?.id,
        workspaceId: workspace.workspace_id,
        role: workspace.role,
        timestamp: Date.now()
      }))
    } catch (error) {
      console.error('Error saving workspace context:', error)
    }
  }, [user?.id])

  const clearWorkspace = useCallback(() => {
    setWorkspaceId(null)
    setRole(null)
    localStorage.removeItem('workspace-context')
  }, [])

  const value: AuthProviderState = {
    user: user ? {
      id: user.id,
      email: user.email!,
      role: user.user_metadata?.role,
      aud: user.aud,
      exp: (user as any).exp || 0
    } : null,
    workspaceId,
    role,
    isLoading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    signInWithGoogle,
    refreshSession,
    setWorkspace,
    clearWorkspace,
    session
  }

  return (
    <AuthProviderContext.Provider value={value}>
      {children}
    </AuthProviderContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthProviderContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}