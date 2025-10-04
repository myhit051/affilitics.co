/**
 * Structured Logging and Log Aggregation Service
 *
 * Provides centralized, structured logging with multiple log levels,
 * contextual information, and integration with monitoring systems.
 * Supports JSON-formatted logs for easy parsing and analysis.
 */

import { getMonitoringConfig } from './config-service.js';
import { prisma } from '../index.js';

// Log levels
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

// Log level priority for filtering
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.FATAL]: 4
};

// Log entry interface
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: LogContext;
  metadata?: Record<string, any>;
}

// Contextual information
export interface LogContext {
  service?: string;
  workspaceId?: string;
  userId?: string;
  requestId?: string;
  sessionId?: string;
  jobId?: string;
  correlationId?: string;
  environment?: string;
}

// Log query options
export interface LogQueryOptions {
  level?: LogLevel;
  service?: string;
  workspaceId?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

// Log statistics
export interface LogStatistics {
  total: number;
  byLevel: Record<LogLevel, number>;
  byService: Record<string, number>;
  timeRange: {
    start: Date;
    end: Date;
  };
}

/**
 * Structured Logger Service
 */
export class Logger {
  private static currentLevel: LogLevel = LogLevel.INFO;
  private static context: LogContext = {};
  private static enableConsole: boolean = true;
  private static enableDatabase: boolean = true;

  /**
   * Initialize logger with configuration
   */
  static initialize(config?: {
    level?: LogLevel;
    context?: LogContext;
    enableConsole?: boolean;
    enableDatabase?: boolean;
  }): void {
    if (config?.level) {
      this.currentLevel = config.level;
    }
    if (config?.context) {
      this.context = { ...this.context, ...config.context };
    }
    if (config?.enableConsole !== undefined) {
      this.enableConsole = config.enableConsole;
    }
    if (config?.enableDatabase !== undefined) {
      this.enableDatabase = config.enableDatabase;
    }

    // Set environment from config
    this.context.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Set global context for all logs
   */
  static setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Set log level
   */
  static setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * Create a child logger with additional context
   */
  static child(context: LogContext): ChildLogger {
    return new ChildLogger({ ...this.context, ...context });
  }

  /**
   * Debug level log
   */
  static debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Info level log
   */
  static info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Warning level log
   */
  static warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Error level log
   */
  static error(message: string, error?: Error | string, metadata?: Record<string, any>): void {
    const enrichedMetadata = { ...metadata };

    if (error instanceof Error) {
      enrichedMetadata.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    } else if (typeof error === 'string') {
      enrichedMetadata.error = error;
    }

    this.log(LogLevel.ERROR, message, enrichedMetadata);
  }

  /**
   * Fatal level log
   */
  static fatal(message: string, error?: Error | string, metadata?: Record<string, any>): void {
    const enrichedMetadata = { ...metadata };

    if (error instanceof Error) {
      enrichedMetadata.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    } else if (typeof error === 'string') {
      enrichedMetadata.error = error;
    }

    this.log(LogLevel.FATAL, message, enrichedMetadata);
  }

  /**
   * Core logging method
   */
  private static log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, any>
  ): void {
    // Check if log level is enabled
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: this.context,
      metadata
    };

    // Output to console if enabled
    if (this.enableConsole) {
      this.writeToConsole(logEntry);
    }

    // Store in database if enabled (async, non-blocking)
    if (this.enableDatabase) {
      this.writeToDatabase(logEntry).catch(err => {
        console.error('Failed to write log to database:', err);
      });
    }
  }

  /**
   * Check if log level should be logged
   */
  private static shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.currentLevel];
  }

  /**
   * Write log to console with formatting
   */
  private static writeToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const service = entry.context?.service || 'APP';
    const prefix = `[${timestamp}] [${level}] [${service}]`;

    // Build log message
    let logMessage = `${prefix} ${entry.message}`;

    // Add context if present
    if (entry.context && Object.keys(entry.context).length > 0) {
      const contextInfo = Object.entries(entry.context)
        .filter(([key, value]) => value !== undefined && key !== 'service' && key !== 'environment')
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');

      if (contextInfo) {
        logMessage += ` | ${contextInfo}`;
      }
    }

    // Output based on log level
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(logMessage, entry.metadata || '');
        break;
      case LogLevel.INFO:
        console.log(logMessage, entry.metadata || '');
        break;
      case LogLevel.WARN:
        console.warn(logMessage, entry.metadata || '');
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(logMessage, entry.metadata || '');
        break;
    }
  }

  /**
   * Write log to database
   */
  private static async writeToDatabase(entry: LogEntry): Promise<void> {
    try {
      await prisma.$queryRaw`
        INSERT INTO application_logs (
          level, message, service, workspace_id, user_id,
          request_id, session_id, job_id, correlation_id,
          metadata, created_at
        ) VALUES (
          ${entry.level},
          ${entry.message},
          ${entry.context?.service || null},
          ${entry.context?.workspaceId || null},
          ${entry.context?.userId || null},
          ${entry.context?.requestId || null},
          ${entry.context?.sessionId || null},
          ${entry.context?.jobId || null},
          ${entry.context?.correlationId || null},
          ${JSON.stringify(entry.metadata || {})},
          ${entry.timestamp}
        )
      `;
    } catch (error) {
      // Silently fail to prevent infinite loop
      // Only log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Database logging failed:', error);
      }
    }
  }

  /**
   * Query logs from database
   */
  static async queryLogs(options: LogQueryOptions = {}): Promise<LogEntry[]> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];

      if (options.level) {
        conditions.push(`level = $${params.length + 1}`);
        params.push(options.level);
      }

      if (options.service) {
        conditions.push(`service = $${params.length + 1}`);
        params.push(options.service);
      }

      if (options.workspaceId) {
        conditions.push(`workspace_id = $${params.length + 1}`);
        params.push(options.workspaceId);
      }

      if (options.startTime) {
        conditions.push(`created_at >= $${params.length + 1}`);
        params.push(options.startTime);
      }

      if (options.endTime) {
        conditions.push(`created_at <= $${params.length + 1}`);
        params.push(options.endTime);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = options.limit || 100;
      const offset = options.offset || 0;

      const result = await prisma.$queryRaw<any[]>`
        SELECT
          level, message, service, workspace_id, user_id,
          request_id, session_id, job_id, correlation_id,
          metadata, created_at
        FROM application_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      return result.map(row => ({
        level: row.level as LogLevel,
        message: row.message,
        timestamp: new Date(row.created_at),
        context: {
          service: row.service,
          workspaceId: row.workspace_id,
          userId: row.user_id,
          requestId: row.request_id,
          sessionId: row.session_id,
          jobId: row.job_id,
          correlationId: row.correlation_id
        },
        metadata: row.metadata
      }));
    } catch (error) {
      console.error('Failed to query logs:', error);
      return [];
    }
  }

  /**
   * Get log statistics
   */
  static async getStatistics(
    startTime?: Date,
    endTime?: Date
  ): Promise<LogStatistics> {
    try {
      const start = startTime || new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = endTime || new Date();

      const result = await prisma.$queryRaw<any[]>`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN level = 'debug' THEN 1 END) as debug_count,
          COUNT(CASE WHEN level = 'info' THEN 1 END) as info_count,
          COUNT(CASE WHEN level = 'warn' THEN 1 END) as warn_count,
          COUNT(CASE WHEN level = 'error' THEN 1 END) as error_count,
          COUNT(CASE WHEN level = 'fatal' THEN 1 END) as fatal_count
        FROM application_logs
        WHERE created_at >= ${start} AND created_at <= ${end}
      `;

      const serviceResult = await prisma.$queryRaw<any[]>`
        SELECT service, COUNT(*) as count
        FROM application_logs
        WHERE created_at >= ${start} AND created_at <= ${end}
        AND service IS NOT NULL
        GROUP BY service
      `;

      const stats = result[0];
      const byService: Record<string, number> = {};
      serviceResult.forEach(row => {
        byService[row.service] = parseInt(row.count) || 0;
      });

      return {
        total: parseInt(stats.total) || 0,
        byLevel: {
          [LogLevel.DEBUG]: parseInt(stats.debug_count) || 0,
          [LogLevel.INFO]: parseInt(stats.info_count) || 0,
          [LogLevel.WARN]: parseInt(stats.warn_count) || 0,
          [LogLevel.ERROR]: parseInt(stats.error_count) || 0,
          [LogLevel.FATAL]: parseInt(stats.fatal_count) || 0
        },
        byService,
        timeRange: { start, end }
      };
    } catch (error) {
      console.error('Failed to get log statistics:', error);
      return {
        total: 0,
        byLevel: {
          [LogLevel.DEBUG]: 0,
          [LogLevel.INFO]: 0,
          [LogLevel.WARN]: 0,
          [LogLevel.ERROR]: 0,
          [LogLevel.FATAL]: 0
        },
        byService: {},
        timeRange: { start: new Date(), end: new Date() }
      };
    }
  }

  /**
   * Clean up old logs
   */
  static async cleanupOldLogs(retentionDays: number = 30): Promise<void> {
    try {
      await prisma.$queryRaw`
        DELETE FROM application_logs
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
      `;
      this.info('Cleaned up old logs', { retentionDays });
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }

  /**
   * Export logs to JSON
   */
  static async exportLogs(options: LogQueryOptions = {}): Promise<string> {
    const logs = await this.queryLogs(options);
    return JSON.stringify(logs, null, 2);
  }
}

/**
 * Child Logger with additional context
 */
export class ChildLogger {
  constructor(private context: LogContext) {}

  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  error(message: string, error?: Error | string, metadata?: Record<string, any>): void {
    const enrichedMetadata = { ...metadata };

    if (error instanceof Error) {
      enrichedMetadata.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    } else if (typeof error === 'string') {
      enrichedMetadata.error = error;
    }

    this.log(LogLevel.ERROR, message, enrichedMetadata);
  }

  fatal(message: string, error?: Error | string, metadata?: Record<string, any>): void {
    const enrichedMetadata = { ...metadata };

    if (error instanceof Error) {
      enrichedMetadata.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    } else if (typeof error === 'string') {
      enrichedMetadata.error = error;
    }

    this.log(LogLevel.FATAL, message, enrichedMetadata);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    const originalContext = Logger['context'];
    Logger['context'] = this.context;
    Logger['log'](level, message, metadata);
    Logger['context'] = originalContext;
  }
}

// Initialize logger with default configuration
const logLevelFromEnv = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
Logger.initialize({
  level: logLevelFromEnv,
  enableConsole: true,
  enableDatabase: process.env.NODE_ENV === 'production'
});

// Export singleton instance
export default Logger;

// Export helper functions
export const log = {
  debug: (message: string, metadata?: Record<string, any>) => Logger.debug(message, metadata),
  info: (message: string, metadata?: Record<string, any>) => Logger.info(message, metadata),
  warn: (message: string, metadata?: Record<string, any>) => Logger.warn(message, metadata),
  error: (message: string, error?: Error | string, metadata?: Record<string, any>) =>
    Logger.error(message, error, metadata),
  fatal: (message: string, error?: Error | string, metadata?: Record<string, any>) =>
    Logger.fatal(message, error, metadata)
};
