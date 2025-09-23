/**
 * SECURITY MONITORING AND AUDIT SYSTEM
 * 
 * This module provides comprehensive security monitoring, audit logging,
 * and threat detection for the authentication system.
 */

import { NextRequest } from 'next/server'

// Types for security events
export type SecurityEventType = 
  | 'auth_success'
  | 'auth_failure'
  | 'session_created'
  | 'session_expired'
  | 'session_refresh'
  | 'password_reset'
  | 'account_locked'
  | 'suspicious_activity'
  | 'rate_limit_exceeded'
  | 'csrf_violation'
  | 'permission_denied'
  | 'workspace_access_denied'
  | 'admin_action'
  | 'data_export'
  | 'security_scan'

export type SecurityLevel = 'low' | 'medium' | 'high' | 'critical'

export interface SecurityEvent {
  id: string
  timestamp: string
  type: SecurityEventType
  level: SecurityLevel
  userId?: string
  workspaceId?: string
  ip: string
  userAgent: string
  location?: {
    country?: string
    city?: string
    timezone?: string
  }
  details: Record<string, any>
  fingerprint: string
  resolved: boolean
  alertSent: boolean
}

export interface SecurityMetrics {
  totalEvents: number
  eventsByType: Record<SecurityEventType, number>
  eventsByLevel: Record<SecurityLevel, number>
  suspiciousIPs: string[]
  blockedIPs: string[]
  activeThreats: number
  lastUpdated: string
}

export interface ThreatDetectionRule {
  id: string
  name: string
  description: string
  enabled: boolean
  conditions: ThreatCondition[]
  action: ThreatAction
  severity: SecurityLevel
}

export interface ThreatCondition {
  field: string
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'regex'
  value: any
  timeWindow?: number // milliseconds
}

export interface ThreatAction {
  type: 'log' | 'alert' | 'block' | 'rate_limit'
  parameters?: Record<string, any>
}

export interface SecurityAlert {
  id: string
  timestamp: string
  type: SecurityEventType
  level: SecurityLevel
  title: string
  description: string
  affectedUsers: string[]
  affectedWorkspaces: string[]
  recommendedActions: string[]
  resolved: boolean
}

// Security event storage (use database in production)
const securityEvents: SecurityEvent[] = []
const securityAlerts: SecurityAlert[] = []
const blockedIPs = new Set<string>()
const suspiciousActivities = new Map<string, number>()

// Threat detection rules
const defaultThreatRules: ThreatDetectionRule[] = [
  {
    id: 'multiple_failed_logins',
    name: 'Multiple Failed Login Attempts',
    description: 'Detect multiple failed login attempts from same IP',
    enabled: true,
    conditions: [
      { field: 'type', operator: 'equals', value: 'auth_failure' },
      { field: 'count', operator: 'greater_than', value: 5, timeWindow: 15 * 60 * 1000 }
    ],
    action: { type: 'block', parameters: { duration: 60 * 60 * 1000 } },
    severity: 'high'
  },
  {
    id: 'suspicious_location',
    name: 'Login from Suspicious Location',
    description: 'Detect login from unusual geographic location',
    enabled: true,
    conditions: [
      { field: 'type', operator: 'equals', value: 'auth_success' },
      { field: 'location_change', operator: 'equals', value: true }
    ],
    action: { type: 'alert' },
    severity: 'medium'
  },
  {
    id: 'admin_action_monitoring',
    name: 'Administrative Action Monitoring',
    description: 'Monitor all administrative actions',
    enabled: true,
    conditions: [
      { field: 'type', operator: 'equals', value: 'admin_action' }
    ],
    action: { type: 'log' },
    severity: 'high'
  },
  {
    id: 'rapid_api_requests',
    name: 'Rapid API Requests',
    description: 'Detect unusually rapid API requests',
    enabled: true,
    conditions: [
      { field: 'request_count', operator: 'greater_than', value: 100, timeWindow: 60 * 1000 }
    ],
    action: { type: 'rate_limit', parameters: { limit: 50, window: 60 * 1000 } },
    severity: 'medium'
  }
]

/**
 * Security monitoring class
 */
export class SecurityMonitor {
  private threatRules: ThreatDetectionRule[] = [...defaultThreatRules]
  private isEnabled: boolean = true
  private alertCallbacks: ((alert: SecurityAlert) => void)[] = []

  constructor() {
    // Initialize monitoring
    this.startBackgroundTasks()
  }

  /**
   * Log a security event
   */
  logEvent(
    type: SecurityEventType,
    request: NextRequest | null,
    details: Record<string, any> = {},
    userId?: string,
    workspaceId?: string
  ): SecurityEvent {
    if (!this.isEnabled) {
      console.log('Security monitoring disabled, skipping event:', type)
      return this.createDummyEvent(type)
    }

    const timestamp = new Date().toISOString()
    const ip = request ? this.getClientIP(request) : 'unknown'
    const userAgent = request?.headers.get('user-agent') || 'unknown'
    const fingerprint = this.generateFingerprint(ip, userAgent, type)

    const event: SecurityEvent = {
      id: this.generateEventId(),
      timestamp,
      type,
      level: this.determineSecurityLevel(type, details),
      userId,
      workspaceId,
      ip,
      userAgent,
      location: this.getLocationInfo(request),
      details: { ...details, url: request?.url, method: request?.method },
      fingerprint,
      resolved: false,
      alertSent: false
    }

    // Store event
    securityEvents.push(event)

    // Check threat detection rules
    this.checkThreatRules(event)

    // Log to console (replace with proper logging in production)
    console.log('Security Event:', {
      type: event.type,
      level: event.level,
      userId: event.userId,
      ip: event.ip,
      details: event.details
    })

    return event
  }

  /**
   * Create a security alert
   */
  createAlert(
    type: SecurityEventType,
    level: SecurityLevel,
    title: string,
    description: string,
    affectedUsers: string[] = [],
    affectedWorkspaces: string[] = [],
    recommendedActions: string[] = []
  ): SecurityAlert {
    const alert: SecurityAlert = {
      id: this.generateAlertId(),
      timestamp: new Date().toISOString(),
      type,
      level,
      title,
      description,
      affectedUsers,
      affectedWorkspaces,
      recommendedActions,
      resolved: false
    }

    securityAlerts.push(alert)

    // Notify alert callbacks
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert)
      } catch (error) {
        console.error('Error in alert callback:', error)
      }
    })

    console.warn('Security Alert:', alert)
    return alert
  }

  /**
   * Check IP against block list
   */
  isIPBlocked(ip: string): boolean {
    return blockedIPs.has(ip)
  }

  /**
   * Block an IP address
   */
  blockIP(ip: string, duration?: number): void {
    blockedIPs.add(ip)
    
    if (duration) {
      setTimeout(() => {
        blockedIPs.delete(ip)
        console.log(`IP ${ip} unblocked after ${duration}ms`)
      }, duration)
    }

    this.logEvent('security_scan', null, {
      action: 'ip_blocked',
      ip,
      duration: duration || 'permanent'
    })
  }

  /**
   * Get security metrics
   */
  getMetrics(): SecurityMetrics {
    const eventsByType = securityEvents.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1
      return acc
    }, {} as Record<SecurityEventType, number>)

    const eventsByLevel = securityEvents.reduce((acc, event) => {
      acc[event.level] = (acc[event.level] || 0) + 1
      return acc
    }, {} as Record<SecurityLevel, number>)

    return {
      totalEvents: securityEvents.length,
      eventsByType,
      eventsByLevel,
      suspiciousIPs: Array.from(suspiciousActivities.keys()),
      blockedIPs: Array.from(blockedIPs),
      activeThreats: securityAlerts.filter(a => !a.resolved).length,
      lastUpdated: new Date().toISOString()
    }
  }

  /**
   * Get recent security events
   */
  getRecentEvents(limit: number = 50, level?: SecurityLevel): SecurityEvent[] {
    let events = [...securityEvents]
    
    if (level) {
      events = events.filter(e => e.level === level)
    }

    return events
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): SecurityAlert[] {
    return securityAlerts.filter(alert => !alert.resolved)
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = securityAlerts.find(a => a.id === alertId)
    if (alert) {
      alert.resolved = true
      return true
    }
    return false
  }

  /**
   * Add alert callback
   */
  onAlert(callback: (alert: SecurityAlert) => void): void {
    this.alertCallbacks.push(callback)
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
    console.log(`Security monitoring ${enabled ? 'enabled' : 'disabled'}`)
  }

  // Private methods

  private createDummyEvent(type: SecurityEventType): SecurityEvent {
    return {
      id: 'dummy',
      timestamp: new Date().toISOString(),
      type,
      level: 'low',
      ip: 'unknown',
      userAgent: 'unknown',
      details: {},
      fingerprint: 'dummy',
      resolved: true,
      alertSent: false
    }
  }

  private getClientIP(request: NextRequest): string {
    const xForwardedFor = request.headers.get('x-forwarded-for')
    const xRealIp = request.headers.get('x-real-ip')
    const cfConnectingIp = request.headers.get('cf-connecting-ip')

    if (xForwardedFor) {
      return xForwardedFor.split(',')[0].trim()
    }

    if (xRealIp) {
      return xRealIp
    }

    if (cfConnectingIp) {
      return cfConnectingIp
    }

    return request.ip || 'unknown'
  }

  private getLocationInfo(request: NextRequest | null): SecurityEvent['location'] {
    if (!request) return undefined

    // In production, use a GeoIP service
    const country = request.headers.get('cf-ipcountry') || undefined
    const timezone = request.headers.get('cf-timezone') || undefined

    return country || timezone ? { country, timezone } : undefined
  }

  private generateFingerprint(ip: string, userAgent: string, type: SecurityEventType): string {
    const data = `${ip}:${userAgent}:${type}`
    // Simple hash (use crypto.subtle in production)
    return btoa(data).substring(0, 16)
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  private generateAlertId(): string {
    return `alt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  private determineSecurityLevel(type: SecurityEventType, details: Record<string, any>): SecurityLevel {
    switch (type) {
      case 'auth_failure':
        return details.repeated ? 'high' : 'medium'
      case 'suspicious_activity':
      case 'csrf_violation':
      case 'account_locked':
        return 'high'
      case 'admin_action':
      case 'data_export':
        return 'high'
      case 'rate_limit_exceeded':
        return 'medium'
      case 'permission_denied':
        return 'low'
      default:
        return 'low'
    }
  }

  private checkThreatRules(event: SecurityEvent): void {
    this.threatRules
      .filter(rule => rule.enabled)
      .forEach(rule => {
        if (this.evaluateRule(rule, event)) {
          this.executeAction(rule, event)
        }
      })
  }

  private evaluateRule(rule: ThreatDetectionRule, event: SecurityEvent): boolean {
    return rule.conditions.every(condition => {
      return this.evaluateCondition(condition, event)
    })
  }

  private evaluateCondition(condition: ThreatCondition, event: SecurityEvent): boolean {
    let value: any

    // Get the field value from the event
    switch (condition.field) {
      case 'type':
        value = event.type
        break
      case 'level':
        value = event.level
        break
      case 'ip':
        value = event.ip
        break
      case 'count':
        // Count events of same type from same IP in time window
        if (condition.timeWindow) {
          const cutoff = Date.now() - condition.timeWindow
          value = securityEvents.filter(e => 
            e.type === event.type && 
            e.ip === event.ip && 
            new Date(e.timestamp).getTime() > cutoff
          ).length
        } else {
          value = 1
        }
        break
      default:
        value = event.details[condition.field]
        break
    }

    // Evaluate the condition
    switch (condition.operator) {
      case 'equals':
        return value === condition.value
      case 'contains':
        return String(value).includes(String(condition.value))
      case 'greater_than':
        return Number(value) > Number(condition.value)
      case 'less_than':
        return Number(value) < Number(condition.value)
      case 'regex':
        return new RegExp(condition.value).test(String(value))
      default:
        return false
    }
  }

  private executeAction(rule: ThreatDetectionRule, event: SecurityEvent): void {
    switch (rule.action.type) {
      case 'log':
        console.warn(`Threat detected: ${rule.name}`, event)
        break

      case 'alert':
        this.createAlert(
          event.type,
          rule.severity,
          rule.name,
          rule.description,
          event.userId ? [event.userId] : [],
          event.workspaceId ? [event.workspaceId] : [],
          ['Review security logs', 'Investigate user activity']
        )
        break

      case 'block':
        this.blockIP(event.ip, rule.action.parameters?.duration)
        this.createAlert(
          'security_scan',
          'high',
          'IP Address Blocked',
          `IP ${event.ip} has been blocked due to: ${rule.name}`,
          [],
          [],
          ['Monitor for continued attempts', 'Review block duration']
        )
        break

      case 'rate_limit':
        // Implementation would depend on rate limiting system
        console.warn(`Rate limit triggered for IP ${event.ip}`)
        break
    }
  }

  private startBackgroundTasks(): void {
    // Clean up old events every hour
    setInterval(() => {
      const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000) // 7 days
      const initialLength = securityEvents.length
      
      while (securityEvents.length > 0 && 
             new Date(securityEvents[0].timestamp).getTime() < cutoff) {
        securityEvents.shift()
      }

      if (securityEvents.length < initialLength) {
        console.log(`Cleaned up ${initialLength - securityEvents.length} old security events`)
      }
    }, 60 * 60 * 1000)

    // Clean up resolved alerts after 30 days
    setInterval(() => {
      const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000) // 30 days
      const initialLength = securityAlerts.length
      
      for (let i = securityAlerts.length - 1; i >= 0; i--) {
        const alert = securityAlerts[i]
        if (alert.resolved && new Date(alert.timestamp).getTime() < cutoff) {
          securityAlerts.splice(i, 1)
        }
      }

      if (securityAlerts.length < initialLength) {
        console.log(`Cleaned up ${initialLength - securityAlerts.length} old security alerts`)
      }
    }, 24 * 60 * 60 * 1000)
  }
}

// Global security monitor instance
let globalSecurityMonitor: SecurityMonitor | null = null

/**
 * Get or create global security monitor
 */
export function getSecurityMonitor(): SecurityMonitor {
  if (!globalSecurityMonitor) {
    globalSecurityMonitor = new SecurityMonitor()
  }
  return globalSecurityMonitor
}

/**
 * Convenience functions for common security events
 */
export const SecurityLogger = {
  logAuthSuccess: (request: NextRequest, userId: string, workspaceId?: string) => {
    return getSecurityMonitor().logEvent('auth_success', request, {}, userId, workspaceId)
  },

  logAuthFailure: (request: NextRequest, reason: string, attempted_email?: string) => {
    return getSecurityMonitor().logEvent('auth_failure', request, { reason, attempted_email })
  },

  logSuspiciousActivity: (request: NextRequest, activity: string, userId?: string) => {
    return getSecurityMonitor().logEvent('suspicious_activity', request, { activity }, userId)
  },

  logAdminAction: (request: NextRequest, action: string, userId: string, workspaceId?: string, target?: string) => {
    return getSecurityMonitor().logEvent('admin_action', request, { action, target }, userId, workspaceId)
  },

  logPermissionDenied: (request: NextRequest, resource: string, userId?: string, workspaceId?: string) => {
    return getSecurityMonitor().logEvent('permission_denied', request, { resource }, userId, workspaceId)
  },

  logDataExport: (request: NextRequest, dataType: string, userId: string, workspaceId?: string) => {
    return getSecurityMonitor().logEvent('data_export', request, { dataType }, userId, workspaceId)
  }
}

export default SecurityMonitor