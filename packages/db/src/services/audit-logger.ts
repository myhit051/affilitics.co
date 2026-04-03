/**
 * Comprehensive Audit Logging Service for Affilitics.co
 * 
 * Provides extensive audit trail capabilities for compliance and security:
 * - Complete audit trail for all sensitive operations
 * - Data access, modifications, authentication events logging
 * - Security violations and suspicious activity tracking
 * - Compliance reporting and data retention management
 * - Real-time security event notifications
 * - Performance-optimized with batch processing capabilities
 */

import { prisma } from '../index.js';
import { SecurityService } from './security-service.js';

// Audit event types and interfaces
export interface AuditEvent {
  id?: string;
  workspaceId?: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: AuditCategory;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export type AuditCategory = 
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'workspace_management'
  | 'user_management'
  | 'file_operations'
  | 'security_violation'
  | 'system_operation'
  | 'compliance';

export interface AuditQuery {
  workspaceId?: string;
  userId?: string;
  action?: string;
  category?: AuditCategory;
  severity?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  includeDetails?: boolean;
}

export interface AuditSummary {
  totalEvents: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  byUser: Record<string, number>;
  recentCritical: AuditEvent[];
  timeRange: {
    start: Date;
    end: Date;
  };
}

export interface SecurityAlert {
  id: string;
  workspaceId?: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  details: Record<string, any>;
  triggerEvent: AuditEvent;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  createdAt: Date;
}

/**
 * Comprehensive Audit Logger Service
 */
export class AuditLogger {
  private static eventQueue: AuditEvent[] = [];
  private static batchSize = 100;
  private static flushInterval = 5000; // 5 seconds
  private static processingBatch = false;

  // Initialize batch processing
  static {
    setInterval(() => {
      AuditLogger.flushEventQueue().catch(console.error);
    }, AuditLogger.flushInterval);
  }

  /**
   * Log authentication events
   */
  static async logAuthentication(
    action: 'login' | 'logout' | 'login_failed' | 'token_refresh' | 'mfa_challenge',
    userId?: string,
    details: Record<string, any> = {},
    context?: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
      workspaceId?: string;
    }
  ): Promise<void> {
    const severity = action === 'login_failed' ? 'medium' : 'low';
    const success = !action.includes('failed');

    await this.logEvent({
      workspaceId: context?.workspaceId,
      userId,
      action,
      resource: 'user_session',
      details: {
        ...details,
        attempt_result: success ? 'success' : 'failure'
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      sessionId: context?.sessionId,
      timestamp: new Date(),
      severity,
      category: 'authentication',
      success
    });

    // Create security alert for repeated failed logins
    if (action === 'login_failed' && userId) {
      await this.checkFailedLoginPattern(userId, context?.ipAddress);
    }
  }

  /**
   * Log authorization events
   */
  static async logAuthorization(
    action: 'access_granted' | 'access_denied' | 'permission_check',
    userId: string,
    workspaceId?: string,
    resource?: string,
    details: Record<string, any> = {},
    context?: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    const severity = action === 'access_denied' ? 'medium' : 'low';
    const success = action !== 'access_denied';

    await this.logEvent({
      workspaceId,
      userId,
      action,
      resource: resource || 'workspace_resource',
      details: {
        ...details,
        authorization_result: success ? 'granted' : 'denied'
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      sessionId: context?.sessionId,
      timestamp: new Date(),
      severity,
      category: 'authorization',
      success
    });

    // Create security alert for suspicious access patterns
    if (action === 'access_denied') {
      await this.checkSuspiciousAccessPattern(userId, workspaceId, context?.ipAddress);
    }
  }

  /**
   * Log data access events
   */
  static async logDataAccess(
    action: 'read' | 'query' | 'export' | 'download',
    userId: string,
    workspaceId: string,
    resource: string,
    resourceId?: string,
    details: Record<string, any> = {},
    context?: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    const severity = action === 'export' || action === 'download' ? 'medium' : 'low';

    await this.logEvent({
      workspaceId,
      userId,
      action,
      resource,
      resourceId,
      details: {
        ...details,
        data_access_type: action,
        timestamp: new Date().toISOString()
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      sessionId: context?.sessionId,
      timestamp: new Date(),
      severity,
      category: 'data_access',
      success: true
    });

    // Monitor for bulk data access
    if (action === 'export' || action === 'download') {
      await this.checkBulkDataAccess(userId, workspaceId);
    }
  }

  /**
   * Log data modification events
   */
  static async logDataModification(
    action: 'create' | 'update' | 'delete' | 'bulk_import' | 'bulk_delete',
    userId: string,
    workspaceId: string,
    resource: string,
    resourceId?: string,
    details: Record<string, any> = {},
    context?: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    const severity = action.startsWith('bulk_') || action === 'delete' ? 'high' : 'medium';

    await this.logEvent({
      workspaceId,
      userId,
      action,
      resource,
      resourceId,
      details: {
        ...details,
        modification_type: action,
        change_summary: this.generateChangeSummary(details)
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      sessionId: context?.sessionId,
      timestamp: new Date(),
      severity,
      category: 'data_modification',
      success: true
    });

    // Monitor for suspicious data modification patterns
    if (action.startsWith('bulk_') || action === 'delete') {
      await this.checkSuspiciousModificationPattern(userId, workspaceId, action);
    }
  }

  /**
   * Log workspace management events
   */
  static async logWorkspaceManagement(
    action: 'create' | 'update' | 'delete' | 'member_add' | 'member_remove' | 'role_change',
    userId: string,
    workspaceId: string,
    details: Record<string, any> = {},
    context?: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    const severity = action === 'delete' || action === 'member_remove' ? 'high' : 'medium';

    await this.logEvent({
      workspaceId,
      userId,
      action,
      resource: 'workspace',
      details: {
        ...details,
        workspace_action: action
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      sessionId: context?.sessionId,
      timestamp: new Date(),
      severity,
      category: 'workspace_management',
      success: true
    });
  }

  /**
   * Log file operation events
   */
  static async logFileOperation(
    action: 'upload' | 'download' | 'delete' | 'process' | 'validation_failed',
    userId: string,
    workspaceId: string,
    filename: string,
    details: Record<string, any> = {},
    context?: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    const severity = action === 'validation_failed' ? 'medium' : 'low';
    const success = action !== 'validation_failed';

    await this.logEvent({
      workspaceId,
      userId,
      action,
      resource: 'file',
      resourceId: filename,
      details: {
        ...details,
        filename,
        file_operation: action
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      sessionId: context?.sessionId,
      timestamp: new Date(),
      severity,
      category: 'file_operations',
      success
    });
  }

  /**
   * Log security violations
   */
  static async logSecurityViolation(
    violationType: string,
    userId?: string,
    workspaceId?: string,
    details: Record<string, any> = {},
    context?: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    const event = await this.logEvent({
      workspaceId,
      userId,
      action: violationType,
      resource: 'security',
      details: {
        ...details,
        violation_type: violationType,
        severity_reason: this.determineViolationSeverity(violationType)
      },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      sessionId: context?.sessionId,
      timestamp: new Date(),
      severity: 'critical',
      category: 'security_violation',
      success: false
    });

    // Create immediate security alert
    await this.createSecurityAlert(violationType, event, details);
  }

  /**
   * Log system operations
   */
  static async logSystemOperation(
    action: string,
    details: Record<string, any> = {},
    userId?: string,
    workspaceId?: string
  ): Promise<void> {
    await this.logEvent({
      workspaceId,
      userId,
      action,
      resource: 'system',
      details: {
        ...details,
        system_operation: action
      },
      timestamp: new Date(),
      severity: 'low',
      category: 'system_operation',
      success: true
    });
  }

  /**
   * Core event logging method
   */
  private static async logEvent(event: AuditEvent): Promise<AuditEvent> {
    // Add to queue for batch processing
    this.eventQueue.push(event);

    // If queue is full, flush immediately
    if (this.eventQueue.length >= this.batchSize) {
      await this.flushEventQueue();
    }

    return event;
  }

  /**
   * Flush event queue to database
   */
  private static async flushEventQueue(): Promise<void> {
    if (this.processingBatch || this.eventQueue.length === 0) {
      return;
    }

    this.processingBatch = true;
    const events = this.eventQueue.splice(0, this.batchSize);

    try {
      // @ts-expect-error - AuditLog model not yet in schema
      await prisma.auditLog.createMany({
        data: events.map(event => ({
          id: event.id,
          workspaceId: event.workspaceId,
          userId: event.userId,
          action: event.action,
          details: event.details,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          timestamp: event.timestamp,
          createdAt: event.timestamp
        }))
      });

      // Log critical events to security events table
      const criticalEvents = events.filter(e => e.severity === 'critical');
      for (const event of criticalEvents) {
        await this.createSecurityEventRecord(event);
      }

    } catch (error) {
      console.error('Failed to flush audit events:', error);
      
      // Re-add events to queue for retry
      this.eventQueue.unshift(...events);
    } finally {
      this.processingBatch = false;
    }
  }

  /**
   * Query audit events with filtering
   */
  static async queryEvents(query: AuditQuery): Promise<AuditEvent[]> {
    try {
      const where: any = {};

      if (query.workspaceId) where.workspaceId = query.workspaceId;
      if (query.userId) where.userId = query.userId;
      if (query.action) where.action = { contains: query.action };
      if (query.startDate || query.endDate) {
        where.timestamp = {};
        if (query.startDate) where.timestamp.gte = query.startDate;
        if (query.endDate) where.timestamp.lte = query.endDate;
      }

      // @ts-expect-error - AuditLog model not yet in schema
      const events = await prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: query.limit || 100,
        skip: query.offset || 0,
        select: {
          id: true,
          workspaceId: true,
          userId: true,
          action: true,
          details: query.includeDetails !== false,
          ipAddress: true,
          userAgent: true,
          timestamp: true
        }
      });

      return events.map(event => ({
        id: event.id,
        workspaceId: event.workspaceId || undefined,
        userId: event.userId || undefined,
        action: event.action,
        resource: event.details?.resource || 'unknown',
        details: event.details || {},
        ipAddress: event.ipAddress || undefined,
        userAgent: event.userAgent || undefined,
        timestamp: event.timestamp,
        severity: event.details?.severity || 'low',
        category: event.details?.category || 'system_operation',
        success: event.details?.success !== false
      }));

    } catch (error) {
      console.error('Failed to query audit events:', error);
      return [];
    }
  }

  /**
   * Generate audit summary for reporting
   */
  static async generateSummary(
    workspaceId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AuditSummary> {
    try {
      const where: any = {};
      if (workspaceId) where.workspaceId = workspaceId;
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = startDate;
        if (endDate) where.timestamp.lte = endDate;
      }

      // @ts-expect-error - AuditLog model not yet in schema
      const events = await prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          userId: true,
          action: true,
          details: true,
          timestamp: true
        }
      });

      const bySeverity: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      const byUser: Record<string, number> = {};
      const criticalEvents: AuditEvent[] = [];

      for (const event of events) {
        const severity = event.details?.severity || 'low';
        const category = event.details?.category || 'system_operation';
        const userId = event.userId || 'system';

        bySeverity[severity] = (bySeverity[severity] || 0) + 1;
        byCategory[category] = (byCategory[category] || 0) + 1;
        byUser[userId] = (byUser[userId] || 0) + 1;

        if (severity === 'critical') {
          criticalEvents.push({
            id: event.id,
            userId: event.userId || undefined,
            action: event.action,
            resource: event.details?.resource || 'unknown',
            details: event.details || {},
            timestamp: event.timestamp,
            severity: severity as any,
            category: category as any,
            success: event.details?.success !== false
          });
        }
      }

      return {
        totalEvents: events.length,
        bySeverity,
        byCategory,
        byUser,
        recentCritical: criticalEvents.slice(0, 10),
        timeRange: {
          start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: endDate || new Date()
        }
      };

    } catch (error) {
      console.error('Failed to generate audit summary:', error);
      throw error;
    }
  }

  /**
   * Export audit events for compliance
   */
  static async exportEvents(
    query: AuditQuery,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    try {
      const events = await this.queryEvents({ ...query, includeDetails: true });

      if (format === 'csv') {
        return this.convertToCSV(events);
      } else {
        return JSON.stringify(events, null, 2);
      }
    } catch (error) {
      console.error('Failed to export audit events:', error);
      throw error;
    }
  }

  // Private helper methods

  private static async checkFailedLoginPattern(userId: string, ipAddress?: string): Promise<void> {
    try {
      // @ts-expect-error - AuditLog model not yet in schema
      const recentFailures = await prisma.auditLog.count({
        where: {
          userId,
          action: 'login_failed',
          timestamp: {
            gte: new Date(Date.now() - 15 * 60 * 1000) // Last 15 minutes
          }
        }
      });

      if (recentFailures >= 5) {
        await this.logSecurityViolation(
          'multiple_failed_logins',
          userId,
          undefined,
          { failureCount: recentFailures, ipAddress },
          { ipAddress }
        );
      }
    } catch (error) {
      console.error('Failed to check failed login pattern:', error);
    }
  }

  private static async checkSuspiciousAccessPattern(
    userId: string,
    workspaceId?: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      // @ts-expect-error - AuditLog model not yet in schema
      const recentDenials = await prisma.auditLog.count({
        where: {
          userId,
          workspaceId,
          action: 'access_denied',
          timestamp: {
            gte: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
          }
        }
      });

      if (recentDenials >= 10) {
        await this.logSecurityViolation(
          'suspicious_access_pattern',
          userId,
          workspaceId,
          { denialCount: recentDenials, ipAddress },
          { ipAddress }
        );
      }
    } catch (error) {
      console.error('Failed to check suspicious access pattern:', error);
    }
  }

  private static async checkBulkDataAccess(userId: string, workspaceId: string): Promise<void> {
    try {
      // @ts-expect-error - AuditLog model not yet in schema
      const recentExports = await prisma.auditLog.count({
        where: {
          userId,
          workspaceId,
          action: { in: ['export', 'download'] },
          timestamp: {
            gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
          }
        }
      });

      if (recentExports >= 5) {
        await this.logSecurityViolation(
          'bulk_data_access',
          userId,
          workspaceId,
          { exportCount: recentExports }
        );
      }
    } catch (error) {
      console.error('Failed to check bulk data access:', error);
    }
  }

  private static async checkSuspiciousModificationPattern(
    userId: string,
    workspaceId: string,
    action: string
  ): Promise<void> {
    try {
      // @ts-expect-error - AuditLog model not yet in schema
      const recentModifications = await prisma.auditLog.count({
        where: {
          userId,
          workspaceId,
          action: { contains: 'bulk_' },
          timestamp: {
            gte: new Date(Date.now() - 30 * 60 * 1000) // Last 30 minutes
          }
        }
      });

      if (recentModifications >= 3) {
        await this.logSecurityViolation(
          'suspicious_bulk_modifications',
          userId,
          workspaceId,
          { modificationCount: recentModifications, actionType: action }
        );
      }
    } catch (error) {
      console.error('Failed to check suspicious modification pattern:', error);
    }
  }

  private static generateChangeSummary(details: Record<string, any>): string {
    if (details.oldValues && details.newValues) {
      const changes = Object.keys(details.newValues).filter(
        key => details.oldValues[key] !== details.newValues[key]
      );
      return `Modified fields: ${changes.join(', ')}`;
    }
    return 'Data modified';
  }

  private static determineViolationSeverity(violationType: string): string {
    const highSeverityTypes = [
      'unauthorized_access',
      'privilege_escalation',
      'data_breach_attempt',
      'multiple_failed_logins'
    ];

    return highSeverityTypes.includes(violationType) 
      ? 'Critical security violation detected'
      : 'Security policy violation';
  }

  private static async createSecurityAlert(
    type: string,
    triggerEvent: AuditEvent,
    details: Record<string, any>
  ): Promise<void> {
    try {
      // @ts-expect-error - WorkspaceSecurityEvent model not yet in schema
      await prisma.workspaceSecurityEvent.create({
        data: {
          workspaceId: triggerEvent.workspaceId,
          userId: triggerEvent.userId,
          eventType: type,
          severity: 'critical',
          description: `Security violation: ${type}`,
          details: {
            ...details,
            triggerEvent: triggerEvent.id
          },
          ipAddress: triggerEvent.ipAddress,
          userAgent: triggerEvent.userAgent
        }
      });
    } catch (error) {
      console.error('Failed to create security alert:', error);
    }
  }

  private static async createSecurityEventRecord(event: AuditEvent): Promise<void> {
    try {
      await SecurityService.auditSecurityEvent(
        event.action,
        event.userId,
        event.workspaceId,
        {
          ...event.details,
          category: event.category,
          severity: event.severity,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent
        }
      );
    } catch (error) {
      console.error('Failed to create security event record:', error);
    }
  }

  private static convertToCSV(events: AuditEvent[]): string {
    const headers = [
      'timestamp',
      'workspaceId',
      'userId',
      'action',
      'resource',
      'severity',
      'category',
      'success',
      'ipAddress',
      'userAgent'
    ];

    const rows = events.map(event => [
      event.timestamp.toISOString(),
      event.workspaceId || '',
      event.userId || '',
      event.action,
      event.resource,
      event.severity,
      event.category,
      event.success.toString(),
      event.ipAddress || '',
      event.userAgent || ''
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}

// Export convenience functions for common audit operations
export const logAuth = AuditLogger.logAuthentication.bind(AuditLogger);
export const logAccess = AuditLogger.logDataAccess.bind(AuditLogger);
export const logModification = AuditLogger.logDataModification.bind(AuditLogger);
export const logSecurity = AuditLogger.logSecurityViolation.bind(AuditLogger);
export const queryAuditEvents = AuditLogger.queryEvents.bind(AuditLogger);
export const exportAuditEvents = AuditLogger.exportEvents.bind(AuditLogger);

// Types already exported above at interface/type declarations