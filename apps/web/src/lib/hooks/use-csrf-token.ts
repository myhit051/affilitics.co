"use client"

import { useState, useEffect, useCallback, useRef } from 'react'

// Security: CSRF Token Management Interface
interface CSRFTokenData {
  token: string
  expiresAt: string
  maxAge: number
}

interface CSRFTokenState {
  token: string | null
  isLoading: boolean
  error: string | null
  expiresAt: Date | null
}

interface CSRFTokenHookReturn extends CSRFTokenState {
  refreshToken: () => Promise<void>
  getValidToken: () => Promise<string | null>
  isTokenValid: () => boolean
}

/**
 * Security: CSRF Token Management Hook
 * 
 * Provides automatic CSRF token management for React components:
 * - Automatic token fetching and refresh
 * - Token expiration handling with buffer time
 * - Error handling and retry logic
 * - Memory management and cleanup
 * - Rate limiting protection
 * 
 * Usage:
 * const { token, isLoading, error, getValidToken } = useCSRFToken()
 */
export function useCSRFToken(): CSRFTokenHookReturn {
  const [state, setState] = useState<CSRFTokenState>({
    token: null,
    isLoading: false,
    error: null,
    expiresAt: null
  })

  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)

  // Security: Check if token is still valid with buffer time
  const isTokenValid = useCallback((): boolean => {
    if (!state.token || !state.expiresAt) {
      return false
    }

    // Security: Use 5-minute buffer before expiration to ensure valid tokens
    const bufferTime = 5 * 60 * 1000 // 5 minutes
    const now = new Date()
    const expiryWithBuffer = new Date(state.expiresAt.getTime() - bufferTime)
    
    return now < expiryWithBuffer
  }, [state.token, state.expiresAt])

  // Security: Fetch CSRF token from API
  const fetchToken = useCallback(async (): Promise<CSRFTokenData | null> => {
    try {
      const response = await fetch('/api/auth/csrf-token', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // Include current origin for origin validation
          'Origin': window.location.origin
        },
        credentials: 'include' // Include cookies for authentication
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.')
        } else if (response.status === 401) {
          throw new Error('Authentication required. Please log in.')
        } else if (response.status === 403) {
          throw new Error('Access denied. Invalid origin.')
        } else {
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch CSRF token`)
        }
      }

      const data: CSRFTokenData = await response.json()
      
      if (!data.token || !data.expiresAt) {
        throw new Error('Invalid token response format')
      }

      return data
    } catch (error) {
      console.error('CSRF token fetch error:', error)
      throw error
    }
  }, [])

  // Security: Refresh token with error handling and state management
  const refreshToken = useCallback(async (): Promise<void> => {
    if (!isMountedRef.current) return

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const tokenData = await fetchToken()
      
      if (!tokenData || !isMountedRef.current) {
        return
      }

      const expiresAt = new Date(tokenData.expiresAt)
      
      setState({
        token: tokenData.token,
        isLoading: false,
        error: null,
        expiresAt
      })

      // Security: Schedule automatic refresh before expiration
      const refreshTime = expiresAt.getTime() - Date.now() - (10 * 60 * 1000) // 10 minutes before expiry
      
      if (refreshTime > 0) {
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current)
        }
        
        refreshTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            refreshToken()
          }
        }, refreshTime)
      }

    } catch (error) {
      if (!isMountedRef.current) return

      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch CSRF token'
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }))

      // Security: Retry logic with exponential backoff for network errors
      if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
        setTimeout(() => {
          if (isMountedRef.current) {
            refreshToken()
          }
        }, 5000) // Retry after 5 seconds for network errors
      }
    }
  }, [fetchToken])

  // Security: Get valid token, refresh if needed
  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (isTokenValid()) {
      return state.token
    }

    // Token is invalid or expired, refresh it
    await refreshToken()
    
    // Return the new token if available
    return state.token
  }, [state.token, isTokenValid, refreshToken])

  // Security: Initialize token on mount
  useEffect(() => {
    refreshToken()
    
    return () => {
      isMountedRef.current = false
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [refreshToken])

  // Security: Handle page visibility changes to refresh stale tokens
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isTokenValid()) {
        refreshToken()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isTokenValid, refreshToken])

  return {
    token: state.token,
    isLoading: state.isLoading,
    error: state.error,
    expiresAt: state.expiresAt,
    refreshToken,
    getValidToken,
    isTokenValid
  }
}

/**
 * Security: Higher-order hook for components that need CSRF protection
 * 
 * Ensures component has valid CSRF token before rendering
 * Useful for forms and other components that make state-changing requests
 */
export function useCSRFProtection() {
  const csrfHook = useCSRFToken()
  
  return {
    ...csrfHook,
    isReady: !csrfHook.isLoading && csrfHook.token !== null && csrfHook.error === null,
    withCSRFHeaders: (headers: Record<string, string> = {}) => ({
      ...headers,
      'X-CSRF-Token': csrfHook.token || ''
    })
  }
}