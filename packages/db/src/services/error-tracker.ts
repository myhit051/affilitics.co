/**
 * Error Tracking and Notification System
 *
 * Provides comprehensive error tracking, categorization, and notification
 * capabilities for production monitoring and alerting.
 */

import { prisma } from '../index.js';
import { getMonitoringConfig } from './config-service.js';

// Monitoring error severity levels
export enum MonitoringErrorSeverity {
  CRITICAL = 'critical',    // System outages, data loss, security breaches
  HIGH = 'high',           // Feature failures, significant performance degradation
  MEDIUM = 'medium',       // Partial functionality issues, recoverable errors
  LOW = 'low',            // Minor issues, cosmetic problems
  INFO = 'info'           // Informational, non-error events
}

// Monitoring error categories
export enum MonitoringErrorCategory {
  DATABASE = 'database',
  WORKER = 'worker',
  API = 'api',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  FILE_PROCESSING = 'file_processing',
  NETWORK = 'network',
  VALIDATION = 'validation',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

// Error tracking interfaces
export interface ErrorEvent {
  severity: MonitoringErrorSeverity;
  category: MonitoringErrorCategory;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  workspaceId?: string;
  userId?: string;
  requestId?: string;
  timestamp?: Date;
}

export interface MonitoringErrorSummary {
  id: string;
  severity: MonitoringErrorSeverity;
  category: MonitoringErrorCategory;
  message: string;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  affectedWorkspaces: number;
  affectedUsers: number;
}

export interface ErrorStats {
  totalErrors: number;
  criticalErrors: number;
  highErrors: number;
  mediumErrors: number;
  lowErrors: number;
  errorRate: number;
  topErrors: MonitoringErrorSummary[];
  errorsByCategory: Record<string, number>;
}

// Notification configuration
export interface NotificationConfig {
  enabled: boolean;
  webhookUrls: string[];
  emailRecipients: string[];
  slackChannels: string[];
  minSeverity: MonitoringErrorSeverity;
}

// Error Tracker Service
export class ErrorTracker {
  private static errorCounts = new Map<string, number>();
  private static lastNotificationTime = new Map<string, number>();
  private static readonly NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes

  /**
   * Track an error event
   */
  static async trackError(error: ErrorEvent): Promise<void> {
    try {
      const timestamp = error.timestamp || new Date();

      // Store error in database
      await prisma.$queryRaw`
        INSERT INTO error_logs (
          severity, category, message, stack, context,
          workspace_id, user_id, request_id, created_at
        ) VALUES (
          ${error.severity},
          ${error.category},
          ${error.message},
          ${error.stack || null},
          ${JSON.stringify(error.context || {})},
          ${error.workspaceId || null},
          ${error.userId || null},
          ${error.requestId || null},
          ${timestamp}
        )
      `;

      // Update error counts for rate limiting
      const errorKey = this.getErrorKey(error);
      const currentCount = this.errorCounts.get(errorKey) || 0;
      this.errorCounts.set(errorKey, currentCount + 1);

      // Check if notification should be sent
      if (this.shouldNotify(error, errorKey)) {
        await this.sendNotification(error);
        this.lastNotificationTime.set(errorKey, Date.now());
      }

      // Log to console based on severity
      this.logError(error);
    } catch (err) {
      console.error('Failed to track error:', err);
      // Fallback: at least log to console
      this.logError(error);
    }
  }

  /**
   * Track multiple errors in batch
   */
  static async trackErrors(errors: ErrorEvent[]): Promise<void> {
    try {
      if (errors.length === 0) return;

      // Process errors in parallel with controlled concurrency
      const batchSize = 10;
      for (let i = 0; i < errors.length; i += batchSize) {
        const batch = errors.slice(i, i + batchSize);
        await Promise.all(batch.map(error => this.trackError(error)));
      }
    } catch (err) {
      console.error('Failed to track error batch:', err);
    }
  }

  /**
   * Get error statistics for a time range
   */
  static async getErrorStats(timeRange: '1h' | '24h' | '7d' = '24h'): Promise<ErrorStats> {
    try {
      const interval = this.getTimeInterval(timeRange);

      const result = await prisma.$queryRaw<any[]>`
        SELECT
          COUNT(*) as total_errors,
          COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_errors,
          COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_errors,
          COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_errors,
          COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_errors
        FROM error_logs
        WHERE created_at >= NOW() - INTERVAL '${interval}'
      `;

      const stats = result[0];
      const totalErrors = parseInt(stats.total_errors) || 0;

      // Get top errors
      const topErrors = await this.getTopErrors(timeRange);

      // Get errors by category
      const categoryResult = await prisma.$queryRaw<any[]>`
        SELECT category, COUNT(*) as count
        FROM error_logs
        WHERE created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY category
        ORDER BY count DESC
      `;

      const errorsByCategory: Record<string, number> = {};
      categoryResult.forEach(row => {
        errorsByCategory[row.category] = parseInt(row.count) || 0;
      });

      return {
        totalErrors,
        criticalErrors: parseInt(stats.critical_errors) || 0,
        highErrors: parseInt(stats.high_errors) || 0,
        mediumErrors: parseInt(stats.medium_errors) || 0,
        lowErrors: parseInt(stats.low_errors) || 0,
        errorRate: this.calculateErrorRate(totalErrors, timeRange),
        topErrors,
        errorsByCategory,
      };
    } catch (error) {
      console.error('Failed to get error stats:', error);
      return this.getDefaultErrorStats();
    }
  }

  /**
   * Get top occurring errors
   */
  static async getTopErrors(
    timeRange: '1h' | '24h' | '7d' = '24h',
    limit: number = 10
  ): Promise<MonitoringErrorSummary[]> {
    try {
      const interval = this.getTimeInterval(timeRange);

      const result = await prisma.$queryRaw<any[]>`
        SELECT
          message,
          severity,
          category,
          COUNT(*) as count,
          MIN(created_at) as first_occurrence,
          MAX(created_at) as last_occurrence,
          COUNT(DISTINCT workspace_id) as affected_workspaces,
          COUNT(DISTINCT user_id) as affected_users
        FROM error_logs
        WHERE created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY message, severity, category
        ORDER BY count DESC
        LIMIT ${limit}
      `;

      return result.map((row, index) => ({
        id: `error-${index}`,
        severity: row.severity as MonitoringErrorSeverity,
        category: row.category as MonitoringErrorCategory,
        message: row.message,
        count: parseInt(row.count) || 0,
        firstOccurrence: new Date(row.first_occurrence),
        lastOccurrence: new Date(row.last_occurrence),
        affectedWorkspaces: parseInt(row.affected_workspaces) || 0,
        affectedUsers: parseInt(row.affected_users) || 0,
      }));
    } catch (error) {
      console.error('Failed to get top errors:', error);
      return [];
    }
  }

  /**
   * Get errors for a specific workspace
   */
  static async getWorkspaceErrors(
    workspaceId: string,
    timeRange: '1h' | '24h' | '7d' = '24h'
  ): Promise<MonitoringErrorSummary[]> {
    try {
      const interval = this.getTimeInterval(timeRange);

      const result = await prisma.$queryRaw<any[]>`
        SELECT
          message,
          severity,
          category,
          COUNT(*) as count,
          MIN(created_at) as first_occurrence,
          MAX(created_at) as last_occurrence,
          COUNT(DISTINCT user_id) as affected_users
        FROM error_logs
        WHERE workspace_id = ${workspaceId}
        AND created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY message, severity, category
        ORDER BY count DESC
        LIMIT 20
      `;

      return result.map((row, index) => ({
        id: `workspace-error-${index}`,
        severity: row.severity as MonitoringErrorSeverity,
        category: row.category as MonitoringErrorCategory,
        message: row.message,
        count: parseInt(row.count) || 0,
        firstOccurrence: new Date(row.first_occurrence),
        lastOccurrence: new Date(row.last_occurrence),
        affectedWorkspaces: 1,
        affectedUsers: parseInt(row.affected_users) || 0,
      }));
    } catch (error) {
      console.error('Failed to get workspace errors:', error);
      return [];
    }
  }

  /**
   * Send error notification
   */
  private static async sendNotification(error: ErrorEvent): Promise<void> {
    try {
      const config = getMonitoringConfig();

      if (!config.errorReporting || config.alertWebhooks.length === 0) {
        return;
      }

      const notification = this.formatNotification(error);

      // Send to all configured webhooks
      const promises = config.alertWebhooks.map(async (webhookUrl) => {
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(notification),
          });

          if (!response.ok) {
            console.error(`Failed to send notification to ${webhookUrl}:`, response.statusText);
          }
        } catch (err) {
          console.error(`Error sending notification to ${webhookUrl}:`, err);
        }
      });

      await Promise.allSettled(promises);
    } catch (err) {
      console.error('Failed to send error notification:', err);
    }
  }

  /**
   * Format notification message
   */
  private static formatNotification(error: ErrorEvent): any {
    const emoji = this.getSeverityEmoji(error.severity);
    const timestamp = error.timestamp || new Date();

    return {
      text: `${emoji} ${error.severity.toUpperCase()} Error Detected`,
      attachments: [
        {
          color: this.getSeverityColor(error.severity),
          fields: [
            {
              title: 'Category',
              value: error.category,
              short: true,
            },
            {
              title: 'Severity',
              value: error.severity,
              short: true,
            },
            {
              title: 'Message',
              value: error.message,
              short: false,
            },
            {
              title: 'Workspace ID',
              value: error.workspaceId || 'N/A',
              short: true,
            },
            {
              title: 'Time',
              value: timestamp.toISOString(),
              short: true,
            },
          ],
          footer: 'Affilitics Error Tracker',
          ts: Math.floor(timestamp.getTime() / 1000),
        },
      ],
    };
  }

  /**
   * Check if notification should be sent
   */
  private static shouldNotify(error: ErrorEvent, errorKey: string): boolean {
    // Don't notify for low severity errors
    if (error.severity === MonitoringErrorSeverity.LOW || error.severity === MonitoringErrorSeverity.INFO) {
      return false;
    }

    // Check cooldown period
    const lastNotification = this.lastNotificationTime.get(errorKey);
    if (lastNotification && Date.now() - lastNotification < this.NOTIFICATION_COOLDOWN) {
      return false;
    }

    // Always notify for critical errors
    if (error.severity === MonitoringErrorSeverity.CRITICAL) {
      return true;
    }

    // Check error count threshold for high/medium errors
    const errorCount = this.errorCounts.get(errorKey) || 0;
    return errorCount >= 5; // Notify after 5 occurrences
  }

  /**
   * Get unique error key for deduplication
   */
  private static getErrorKey(error: ErrorEvent): string {
    return `${error.category}-${error.message.substring(0, 50)}`;
  }

  /**
   * Log error to console
   */
  private static logError(error: ErrorEvent): void {
    const timestamp = error.timestamp || new Date();
    const prefix = `[${timestamp.toISOString()}] [${error.severity.toUpperCase()}] [${error.category}]`;

    switch (error.severity) {
      case MonitoringErrorSeverity.CRITICAL:
      case MonitoringErrorSeverity.HIGH:
        console.error(`${prefix} ${error.message}`, error.stack || '');
        break;
      case MonitoringErrorSeverity.MEDIUM:
        console.warn(`${prefix} ${error.message}`);
        break;
      default:
        console.log(`${prefix} ${error.message}`);
    }
  }

  /**
   * Calculate error rate
   */
  private static calculateErrorRate(totalErrors: number, timeRange: '1h' | '24h' | '7d'): number {
    const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : 168;
    return totalErrors / hours;
  }

  /**
   * Get time interval for SQL queries
   */
  private static getTimeInterval(timeRange: '1h' | '24h' | '7d'): string {
    switch (timeRange) {
      case '1h': return '1 hour';
      case '24h': return '1 day';
      case '7d': return '7 days';
      default: return '1 day';
    }
  }

  /**
   * Get severity emoji
   */
  private static getSeverityEmoji(severity: MonitoringErrorSeverity): string {
    switch (severity) {
      case MonitoringErrorSeverity.CRITICAL: return '🔴';
      case MonitoringErrorSeverity.HIGH: return '🟠';
      case MonitoringErrorSeverity.MEDIUM: return '🟡';
      case MonitoringErrorSeverity.LOW: return '🟢';
      case MonitoringErrorSeverity.INFO: return '🔵';
      default: return '⚪';
    }
  }

  /**
   * Get severity color for notifications
   */
  private static getSeverityColor(severity: MonitoringErrorSeverity): string {
    switch (severity) {
      case MonitoringErrorSeverity.CRITICAL: return 'danger';
      case MonitoringErrorSeverity.HIGH: return 'warning';
      case MonitoringErrorSeverity.MEDIUM: return '#FFA500';
      case MonitoringErrorSeverity.LOW: return 'good';
      case MonitoringErrorSeverity.INFO: return '#0099FF';
      default: return '#CCCCCC';
    }
  }

  /**
   * Get default error stats
   */
  private static getDefaultErrorStats(): ErrorStats {
    return {
      totalErrors: 0,
      criticalErrors: 0,
      highErrors: 0,
      mediumErrors: 0,
      lowErrors: 0,
      errorRate: 0,
      topErrors: [],
      errorsByCategory: {},
    };
  }

  /**
   * Clean up old error logs
   */
  static async cleanupOldErrors(retentionDays: number = 30): Promise<void> {
    try {
      await prisma.$queryRaw`
        DELETE FROM error_logs
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
      `;
    } catch (error) {
      console.error('Failed to cleanup old errors:', error);
    }
  }

  /**
   * Reset error counts (for testing or maintenance)
   */
  static resetCounts(): void {
    this.errorCounts.clear();
    this.lastNotificationTime.clear();
  }
}

// Helper function for easy error tracking
export const trackError = (
  message: string,
  severity: MonitoringErrorSeverity = MonitoringErrorSeverity.MEDIUM,
  category: MonitoringErrorCategory = MonitoringErrorCategory.UNKNOWN,
  context?: Record<string, any>
): void => {
  ErrorTracker.trackError({
    message,
    severity,
    category,
    context,
    stack: new Error().stack,
  }).catch(err => console.error('Failed to track error:', err));
};

// Helper function for tracking errors from caught exceptions
export const trackException = (
  error: Error,
  severity: MonitoringErrorSeverity = MonitoringErrorSeverity.HIGH,
  category: MonitoringErrorCategory = MonitoringErrorCategory.UNKNOWN,
  context?: Record<string, any>
): void => {
  ErrorTracker.trackError({
    message: error.message,
    severity,
    category,
    stack: error.stack,
    context,
  }).catch(err => console.error('Failed to track exception:', err));
};
