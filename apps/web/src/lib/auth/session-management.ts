"use client"

/**
 * PRODUCTION-READY SESSION MANAGEMENT
 * 
 * This module provides comprehensive session management with security features,
 * automatic refresh, monitoring, and proper cleanup.
 */

import { createClient } from '@/lib/supabase/client'
import { Session, User, AuthError } from '@supabase/supabase-js'

// Types for session management
export interface SessionContext {
  session: Session | null
  user: User | null
  isValid: boolean
  expiresAt: number | null
  refreshToken: string | null
}

export interface SessionConfig {
  autoRefresh: boolean
  refreshThreshold: number // minutes before expiry to trigger refresh
  maxRetries: number
  retryDelay: number // milliseconds
  enableLogging: boolean
  enableMetrics: boolean
  onSessionExpired?: () => void
  onSessionRefreshed?: (session: Session) => void
  onSessionError?: (error: AuthError) => void
}

export interface SessionMetrics {
  totalRefreshes: number
  successfulRefreshes: number
  failedRefreshes: number
  lastRefresh: number | null
  averageRefreshTime: number
  sessionDuration: number
}

// Default configuration
const DEFAULT_CONFIG: SessionConfig = {
  autoRefresh: true,
  refreshThreshold: 5, // 5 minutes
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  enableLogging: true,
  enableMetrics: true
}

// Session events for monitoring
export type SessionEvent = 
  | 'session_started'
  | 'session_refreshed'
  | 'session_expired'
  | 'session_terminated'
  | 'refresh_failed'
  | 'refresh_retry'

export interface SessionEventData {
  event: SessionEvent
  timestamp: number
  userId?: string
  sessionId?: string
  error?: string
  metadata?: Record<string, any>
}

/**
 * Enhanced session manager with comprehensive security and monitoring
 */
export class SessionManager {
  private supabase = createClient()
  private config: SessionConfig
  private metrics: SessionMetrics
  private refreshTimer: NodeJS.Timeout | null = null
  private refreshPromise: Promise<Session | null> | null = null
  private eventListeners: ((event: SessionEventData) => void)[] = []
  private isRefreshing = false
  private retryCount = 0

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.metrics = {
      totalRefreshes: 0,
      successfulRefreshes: 0,
      failedRefreshes: 0,
      lastRefresh: null,
      averageRefreshTime: 0,
      sessionDuration: 0
    }

    this.initialize()
  }

  /**
   * Initialize session manager
   */
  private async initialize(): Promise<void> {
    try {
      // Get initial session
      const { data: { session }, error } = await this.supabase.auth.getSession()
      
      if (error) {
        this.logEvent('session_error' as any, { error: error.message })
        return
      }

      if (session) {
        this.logEvent('session_started', {
          userId: session.user.id,
          sessionId: this.getSessionId(session)
        })
        
        if (this.config.autoRefresh) {
          this.scheduleRefresh(session)
        }
      }

      // Set up auth state change listener
      this.supabase.auth.onAuthStateChange((event, session) => {
        this.handleAuthStateChange(event, session)
      })

    } catch (error) {
      console.error('Session manager initialization error:', error)
    }
  }

  /**
   * Handle authentication state changes
   */
  private handleAuthStateChange(event: string, session: Session | null): void {
    switch (event) {
      case 'SIGNED_IN':
        if (session) {
          this.logEvent('session_started', {
            userId: session.user.id,
            sessionId: this.getSessionId(session)
          })
          
          if (this.config.autoRefresh) {
            this.scheduleRefresh(session)
          }
        }
        break

      case 'SIGNED_OUT':
        this.logEvent('session_terminated')
        this.clearRefreshTimer()
        this.resetMetrics()
        break

      case 'TOKEN_REFRESHED':
        if (session) {
          this.metrics.successfulRefreshes++
          this.metrics.lastRefresh = Date.now()
          
          this.logEvent('session_refreshed', {
            userId: session.user.id,
            sessionId: this.getSessionId(session)
          })

          if (this.config.onSessionRefreshed) {
            this.config.onSessionRefreshed(session)
          }

          if (this.config.autoRefresh) {
            this.scheduleRefresh(session)
          }
        }
        break

      case 'USER_UPDATED':
        // Handle user metadata updates
        break

      default:
        break
    }
  }

  /**
   * Get current session context with validation
   */
  async getSessionContext(): Promise<SessionContext> {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession()
      
      if (error) {
        this.logEvent('session_error' as any, { error: error.message })
        return {
          session: null,
          user: null,
          isValid: false,
          expiresAt: null,
          refreshToken: null
        }
      }

      if (!session) {
        return {
          session: null,
          user: null,
          isValid: false,
          expiresAt: null,
          refreshToken: null
        }
      }

      const expiresAt = session.expires_at ? session.expires_at * 1000 : null
      const isValid = expiresAt ? Date.now() < expiresAt : false

      return {
        session,
        user: session.user,
        isValid,
        expiresAt,
        refreshToken: session.refresh_token
      }

    } catch (error) {
      console.error('Error getting session context:', error)
      return {
        session: null,
        user: null,
        isValid: false,
        expiresAt: null,
        refreshToken: null
      }
    }
  }

  /**
   * Manually refresh session
   */
  async refreshSession(): Promise<Session | null> {
    // Prevent concurrent refresh attempts
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise
    }

    this.isRefreshing = true
    const startTime = Date.now()

    this.refreshPromise = this.performRefresh()
      .then(session => {
        const refreshTime = Date.now() - startTime
        
        // Update metrics
        this.metrics.totalRefreshes++
        this.metrics.averageRefreshTime = 
          (this.metrics.averageRefreshTime * (this.metrics.totalRefreshes - 1) + refreshTime) /
          this.metrics.totalRefreshes

        this.retryCount = 0
        this.isRefreshing = false
        return session
      })
      .catch(error => {
        this.isRefreshing = false
        this.metrics.failedRefreshes++
        
        this.logEvent('refresh_failed', {
          error: error.message,
          retryCount: this.retryCount
        })

        // Retry logic
        if (this.retryCount < this.config.maxRetries) {
          this.retryCount++
          this.logEvent('refresh_retry', { attempt: this.retryCount })
          
          setTimeout(() => {
            this.refreshSession()
          }, this.config.retryDelay * this.retryCount) // Exponential backoff
        } else {
          // Max retries exceeded - session likely invalid
          this.logEvent('session_expired')
          if (this.config.onSessionExpired) {
            this.config.onSessionExpired()
          }
        }

        throw error
      })

    return this.refreshPromise
  }

  /**
   * Perform the actual session refresh
   */
  private async performRefresh(): Promise<Session | null> {
    const { data: { session }, error } = await this.supabase.auth.refreshSession()
    
    if (error) {
      if (this.config.onSessionError) {
        this.config.onSessionError(error)
      }
      throw error
    }

    return session
  }

  /**
   * Schedule automatic session refresh
   */
  private scheduleRefresh(session: Session): void {
    this.clearRefreshTimer()

    if (!session.expires_at) {
      return
    }

    const expiresAt = session.expires_at * 1000
    const now = Date.now()
    const timeUntilExpiry = expiresAt - now
    const refreshThresholdMs = this.config.refreshThreshold * 60 * 1000
    const timeUntilRefresh = timeUntilExpiry - refreshThresholdMs

    if (timeUntilRefresh > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshSession().catch(error => {
          console.error('Automatic session refresh failed:', error)
        })
      }, timeUntilRefresh)

      if (this.config.enableLogging) {
        console.log(`Session refresh scheduled in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`)
      }
    } else {
      // Session is close to expiring, refresh immediately
      this.refreshSession().catch(error => {
        console.error('Immediate session refresh failed:', error)
      })
    }
  }

  /**
   * Clear refresh timer
   */
  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  /**
   * Validate current session
   */
  async validateSession(): Promise<boolean> {
    const context = await this.getSessionContext()
    
    if (!context.isValid) {
      this.logEvent('session_expired')
      return false
    }

    // Check if session is close to expiring
    if (context.expiresAt) {
      const timeUntilExpiry = context.expiresAt - Date.now()
      const refreshThresholdMs = this.config.refreshThreshold * 60 * 1000

      if (timeUntilExpiry < refreshThresholdMs && this.config.autoRefresh) {
        try {
          await this.refreshSession()
          return true
        } catch (error) {
          console.error('Session validation refresh failed:', error)
          return false
        }
      }
    }

    return true
  }

  /**
   * Terminate session
   */
  async terminateSession(): Promise<void> {
    try {
      this.clearRefreshTimer()
      await this.supabase.auth.signOut()
      this.logEvent('session_terminated')
      this.resetMetrics()
    } catch (error) {
      console.error('Error terminating session:', error)
      throw error
    }
  }

  /**
   * Get session metrics
   */
  getMetrics(): SessionMetrics {
    return { ...this.metrics }
  }

  /**
   * Add event listener
   */
  addEventListener(listener: (event: SessionEventData) => void): void {
    this.eventListeners.push(listener)
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: SessionEventData) => void): void {
    const index = this.eventListeners.indexOf(listener)
    if (index > -1) {
      this.eventListeners.splice(index, 1)
    }
  }

  /**
   * Log session event
   */
  private logEvent(event: SessionEvent, metadata?: Record<string, any>): void {
    const eventData: SessionEventData = {
      event,
      timestamp: Date.now(),
      metadata
    }

    if (this.config.enableLogging) {
      console.log('Session Event:', eventData)
    }

    // Notify listeners
    this.eventListeners.forEach(listener => {
      try {
        listener(eventData)
      } catch (error) {
        console.error('Session event listener error:', error)
      }
    })
  }

  /**
   * Get session ID for tracking
   */
  private getSessionId(session: Session): string {
    // Create a stable session identifier
    return session.access_token.substring(0, 16)
  }

  /**
   * Reset metrics
   */
  private resetMetrics(): void {
    this.metrics = {
      totalRefreshes: 0,
      successfulRefreshes: 0,
      failedRefreshes: 0,
      lastRefresh: null,
      averageRefreshTime: 0,
      sessionDuration: 0
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.clearRefreshTimer()
    this.eventListeners = []
    this.refreshPromise = null
  }
}

/**
 * Global session manager instance
 */
let globalSessionManager: SessionManager | null = null

/**
 * Get or create global session manager
 */
export function getSessionManager(config?: Partial<SessionConfig>): SessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager(config)
  }
  return globalSessionManager
}

/**
 * Hook for React components to use session management
 */
export function useSessionManager(config?: Partial<SessionConfig>) {
  // Note: This hook requires React to be available in the environment
  // Import React dynamically or ensure it's available when using this hook
  if (typeof window === 'undefined') {
    throw new Error('useSessionManager can only be used in client-side components')
  }

  const React = require('react')
  const [sessionManager] = React.useState(() => getSessionManager(config))
  const [sessionContext, setSessionContext] = React.useState(null as SessionContext | null)

  React.useEffect(() => {
    let mounted = true

    const updateSession = async () => {
      const context = await sessionManager.getSessionContext()
      if (mounted) {
        setSessionContext(context)
      }
    }

    // Initial load
    updateSession()

    // Listen for session changes
    const listener = (event: SessionEventData) => {
      if (['session_started', 'session_refreshed', 'session_expired', 'session_terminated'].includes(event.event)) {
        updateSession()
      }
    }

    sessionManager.addEventListener(listener)

    return () => {
      mounted = false
      sessionManager.removeEventListener(listener)
    }
  }, [sessionManager])

  return {
    sessionManager,
    sessionContext,
    refreshSession: () => sessionManager.refreshSession(),
    validateSession: () => sessionManager.validateSession(),
    terminateSession: () => sessionManager.terminateSession(),
    getMetrics: () => sessionManager.getMetrics()
  }
}

/**
 * Utility functions for session validation
 */
export const SessionUtils = {
  /**
   * Check if session is expired
   */
  isExpired(session: Session | null): boolean {
    if (!session?.expires_at) return true
    return Date.now() >= session.expires_at * 1000
  },

  /**
   * Get time until expiry in minutes
   */
  getTimeUntilExpiry(session: Session | null): number | null {
    if (!session?.expires_at) return null
    const timeLeft = (session.expires_at * 1000) - Date.now()
    return Math.max(0, Math.floor(timeLeft / 1000 / 60))
  },

  /**
   * Check if session needs refresh
   */
  needsRefresh(session: Session | null, thresholdMinutes: number = 5): boolean {
    const timeLeft = this.getTimeUntilExpiry(session)
    return timeLeft !== null && timeLeft <= thresholdMinutes
  },

  /**
   * Validate session format
   */
  isValidSession(session: any): session is Session {
    return session &&
           typeof session === 'object' &&
           session.access_token &&
           session.user &&
           session.expires_at
  }
}

export default SessionManager