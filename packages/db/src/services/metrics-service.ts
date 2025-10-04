/**
 * Monitoring Metrics Collection Service
 * 
 * Provides comprehensive metrics collection, aggregation, and monitoring
 * for system performance, health, and business metrics.
 */

import { prisma } from '../index.js';
import { getMonitoringConfig } from './config-service.js';

// Metric types and interfaces
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary'
}

export interface MetricPoint {
  name: string;
  type: MetricType;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
  workspaceId?: string;
}

export interface CSVProcessingMetrics {
  totalProcessed: number;
  successRate: number;
  averageFileSize: number;
  averageProcessingTime: number;
  errorRate: number;
  throughput: number;
}

export interface APIPerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

export interface SystemResourceMetrics {
  memoryUsage: number;
  cpuUsage: number;
  storageUsage: number;
  activeConnections: number;
  queueLength: number;
}

export interface WorkerMetrics {
  activeWorkers: number;
  totalJobs: number;
  avgProcessingTime: number;
  successRate: number;
  errorRate: number;
}

export interface BusinessMetrics {
  activeWorkspaces: number;
  totalUsers: number;
  monthlyActiveUsers: number;
  storageUsed: number;
  apiUsage: number;
}

// Aggregated metrics response
export interface MetricsSnapshot {
  timestamp: Date;
  csvProcessing: CSVProcessingMetrics;
  apiPerformance: APIPerformanceMetrics;
  systemResources: SystemResourceMetrics;
  worker: WorkerMetrics;
  business: BusinessMetrics;
}

// Time range for metrics queries
export type TimeRange = '1h' | '24h' | '7d' | '30d';

// Metrics Service implementation
export class MetricsService {
  private static readonly RETENTION_PERIODS = {
    raw: 24 * 60 * 60 * 1000,      // 24 hours
    hourly: 7 * 24 * 60 * 60 * 1000, // 7 days
    daily: 30 * 24 * 60 * 60 * 1000, // 30 days
    monthly: 365 * 24 * 60 * 60 * 1000, // 1 year
  };

  /**
   * Record a single metric point
   */
  static async recordMetric(metric: MetricPoint): Promise<void> {
    try {
      if (!getMonitoringConfig().enableMetrics) {
        return;
      }

      await prisma.$queryRaw`
        INSERT INTO metrics (
          name, type, value, timestamp, labels, workspace_id, created_at
        ) VALUES (
          ${metric.name},
          ${metric.type},
          ${metric.value},
          ${metric.timestamp},
          ${JSON.stringify(metric.labels || {})},
          ${metric.workspaceId},
          NOW()
        )
      `;
    } catch (error) {
      console.error('Failed to record metric:', error);
    }
  }

  /**
   * Record multiple metrics in batch
   */
  static async recordMetrics(metrics: MetricPoint[]): Promise<void> {
    try {
      if (!getMonitoringConfig().enableMetrics || metrics.length === 0) {
        return;
      }

      const values = metrics.map(m => 
        `(${JSON.stringify(m.name)}, ${JSON.stringify(m.type)}, ${m.value}, ${JSON.stringify(m.timestamp)}, ${JSON.stringify(JSON.stringify(m.labels || {}))}, ${m.workspaceId ? JSON.stringify(m.workspaceId) : 'NULL'}, NOW())`
      ).join(',');

      await prisma.$queryRaw`
        INSERT INTO metrics (name, type, value, timestamp, labels, workspace_id, created_at)
        VALUES ${values}
      `;
    } catch (error) {
      console.error('Failed to record metrics batch:', error);
    }
  }

  /**
   * Get CSV processing metrics
   */
  static async getCSVProcessingMetrics(
    workspaceId?: string,
    timeRange: TimeRange = '24h'
  ): Promise<CSVProcessingMetrics> {
    try {
      const timeFilter = this.getTimeFilter(timeRange);
      const workspaceFilter = workspaceId ? `AND ij."workspaceId" = '${workspaceId}'` : '';

      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*) as total_processed,
          COUNT(CASE WHEN ij.status = 'completed' THEN 1 END) as successful,
          COUNT(CASE WHEN ij.status = 'failed' THEN 1 END) as failed,
          COALESCE(AVG(ij.size), 0) as avg_file_size,
          COALESCE(AVG(
            CASE 
              WHEN ij."finishedAt" IS NOT NULL AND ij."startedAt" IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (ij."finishedAt" - ij."startedAt"))
              ELSE NULL
            END
          ), 0) as avg_processing_time
        FROM "ImportJob" ij
        WHERE ij."createdAt" >= NOW() - INTERVAL '${timeFilter}'
        ${workspaceFilter}
      `;

      const stats = result[0];
      const totalProcessed = parseInt(stats.total_processed) || 0;
      const successful = parseInt(stats.successful) || 0;
      const failed = parseInt(stats.failed) || 0;

      return {
        totalProcessed,
        successRate: totalProcessed > 0 ? (successful / totalProcessed) * 100 : 100,
        averageFileSize: parseFloat(stats.avg_file_size) || 0,
        averageProcessingTime: parseFloat(stats.avg_processing_time) || 0,
        errorRate: totalProcessed > 0 ? (failed / totalProcessed) * 100 : 0,
        throughput: totalProcessed / this.getHoursInTimeRange(timeRange),
      };
    } catch (error) {
      console.error('Failed to get CSV processing metrics:', error);
      return this.getDefaultCSVMetrics();
    }
  }

  /**
   * Get API performance metrics
   */
  static async getAPIPerformanceMetrics(timeRange: TimeRange = '24h'): Promise<APIPerformanceMetrics> {
    try {
      const timeFilter = this.getTimeFilter(timeRange);

      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*) as request_count,
          COALESCE(AVG(response_time), 0) as avg_response_time,
          COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
          COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time), 0) as p95_response_time,
          COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time), 0) as p99_response_time
        FROM api_request_logs
        WHERE created_at >= NOW() - INTERVAL '${timeFilter}'
      `;

      const stats = result[0];
      const requestCount = parseInt(stats.request_count) || 0;
      const errorCount = parseInt(stats.error_count) || 0;

      return {
        requestCount,
        averageResponseTime: parseFloat(stats.avg_response_time) || 0,
        errorRate: requestCount > 0 ? (errorCount / requestCount) * 100 : 0,
        p95ResponseTime: parseFloat(stats.p95_response_time) || 0,
        p99ResponseTime: parseFloat(stats.p99_response_time) || 0,
      };
    } catch (error) {
      console.error('Failed to get API performance metrics:', error);
      return this.getDefaultAPIMetrics();
    }
  }

  /**
   * Get system resource metrics
   */
  static async getSystemResourceMetrics(): Promise<SystemResourceMetrics> {
    try {
      // Get latest system metrics
      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          COALESCE(AVG(CASE WHEN name = 'system_memory_usage' THEN value END), 0) as memory_usage,
          COALESCE(AVG(CASE WHEN name = 'system_cpu_usage' THEN value END), 0) as cpu_usage,
          COALESCE(AVG(CASE WHEN name = 'system_storage_usage' THEN value END), 0) as storage_usage,
          COALESCE(MAX(CASE WHEN name = 'active_connections' THEN value END), 0) as active_connections,
          COALESCE(MAX(CASE WHEN name = 'queue_length' THEN value END), 0) as queue_length
        FROM metrics
        WHERE timestamp >= NOW() - INTERVAL '5 minutes'
        AND name IN ('system_memory_usage', 'system_cpu_usage', 'system_storage_usage', 'active_connections', 'queue_length')
      `;

      const stats = result[0];

      return {
        memoryUsage: parseFloat(stats.memory_usage) || 0,
        cpuUsage: parseFloat(stats.cpu_usage) || 0,
        storageUsage: parseFloat(stats.storage_usage) || 0,
        activeConnections: parseInt(stats.active_connections) || 0,
        queueLength: parseInt(stats.queue_length) || 0,
      };
    } catch (error) {
      console.error('Failed to get system resource metrics:', error);
      return this.getDefaultSystemMetrics();
    }
  }

  /**
   * Get worker metrics
   */
  static async getWorkerMetrics(timeRange: TimeRange = '24h'): Promise<WorkerMetrics> {
    try {
      const timeFilter = this.getTimeFilter(timeRange);

      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(DISTINCT wi.instance_id) as active_workers,
          COALESCE(SUM(wi.total_processed), 0) as total_jobs,
          COALESCE(AVG(wpm.average_processing_time), 0) as avg_processing_time,
          COALESCE(AVG(wpm.success_rate), 100) as success_rate,
          COALESCE(AVG(wpm.error_rate), 0) as error_rate
        FROM worker_instances wi
        LEFT JOIN worker_performance_metrics wpm ON wi.instance_id = wpm.instance_id
        WHERE wi.last_heartbeat >= NOW() - INTERVAL '${timeFilter}'
        AND wi.status != 'offline'
      `;

      const stats = result[0];

      return {
        activeWorkers: parseInt(stats.active_workers) || 0,
        totalJobs: parseInt(stats.total_jobs) || 0,
        avgProcessingTime: parseFloat(stats.avg_processing_time) || 0,
        successRate: parseFloat(stats.success_rate) || 100,
        errorRate: parseFloat(stats.error_rate) || 0,
      };
    } catch (error) {
      console.error('Failed to get worker metrics:', error);
      return this.getDefaultWorkerMetrics();
    }
  }

  /**
   * Get business metrics
   */
  static async getBusinessMetrics(timeRange: TimeRange = '30d'): Promise<BusinessMetrics> {
    try {
      const timeFilter = this.getTimeFilter(timeRange);

      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(DISTINCT w.id) as active_workspaces,
          COUNT(DISTINCT m.user_id) as total_users,
          COUNT(DISTINCT CASE 
            WHEN ij."createdAt" >= NOW() - INTERVAL '30 days' 
            THEN ij."createdBy" 
          END) as monthly_active_users,
          COALESCE(SUM(ij.size), 0) as storage_used,
          COUNT(ij.id) as api_usage
        FROM "Workspace" w
        LEFT JOIN "Member" m ON w.id = m."workspaceId"
        LEFT JOIN "ImportJob" ij ON w.id = ij."workspaceId"
        WHERE w."createdAt" >= NOW() - INTERVAL '${timeFilter}'
      `;

      const stats = result[0];

      return {
        activeWorkspaces: parseInt(stats.active_workspaces) || 0,
        totalUsers: parseInt(stats.total_users) || 0,
        monthlyActiveUsers: parseInt(stats.monthly_active_users) || 0,
        storageUsed: parseInt(stats.storage_used) || 0,
        apiUsage: parseInt(stats.api_usage) || 0,
      };
    } catch (error) {
      console.error('Failed to get business metrics:', error);
      return this.getDefaultBusinessMetrics();
    }
  }

  /**
   * Get comprehensive metrics snapshot
   */
  static async getMetricsSnapshot(
    workspaceId?: string,
    timeRange: TimeRange = '24h'
  ): Promise<MetricsSnapshot> {
    try {
      const [csvMetrics, apiMetrics, systemMetrics, workerMetrics, businessMetrics] = await Promise.all([
        this.getCSVProcessingMetrics(workspaceId, timeRange),
        this.getAPIPerformanceMetrics(timeRange),
        this.getSystemResourceMetrics(),
        this.getWorkerMetrics(timeRange),
        this.getBusinessMetrics(timeRange),
      ]);

      return {
        timestamp: new Date(),
        csvProcessing: csvMetrics,
        apiPerformance: apiMetrics,
        systemResources: systemMetrics,
        worker: workerMetrics,
        business: businessMetrics,
      };
    } catch (error) {
      console.error('Failed to get metrics snapshot:', error);
      throw new Error(`Failed to retrieve metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Record API request metrics
   */
  static async recordAPIRequest(
    method: string,
    path: string,
    statusCode: number,
    responseTime: number,
    workspaceId?: string
  ): Promise<void> {
    try {
      await prisma.$queryRaw`
        INSERT INTO api_request_logs (
          method, path, status_code, response_time, workspace_id, created_at
        ) VALUES (
          ${method}, ${path}, ${statusCode}, ${responseTime}, ${workspaceId}, NOW()
        )
      `;

      // Record as metrics as well
      const labels = {
        method,
        path,
        status_code: statusCode.toString(),
      };

      await this.recordMetrics([
        {
          name: 'api_request_count',
          type: MetricType.COUNTER,
          value: 1,
          timestamp: new Date(),
          labels,
          workspaceId,
        },
        {
          name: 'api_response_time',
          type: MetricType.HISTOGRAM,
          value: responseTime,
          timestamp: new Date(),
          labels,
          workspaceId,
        },
      ]);
    } catch (error) {
      console.error('Failed to record API request metrics:', error);
    }
  }

  /**
   * Record system resource usage
   */
  static async recordSystemResources(
    memoryUsage: number,
    cpuUsage: number,
    storageUsage: number
  ): Promise<void> {
    try {
      const timestamp = new Date();
      await this.recordMetrics([
        {
          name: 'system_memory_usage',
          type: MetricType.GAUGE,
          value: memoryUsage,
          timestamp,
        },
        {
          name: 'system_cpu_usage',
          type: MetricType.GAUGE,
          value: cpuUsage,
          timestamp,
        },
        {
          name: 'system_storage_usage',
          type: MetricType.GAUGE,
          value: storageUsage,
          timestamp,
        },
      ]);
    } catch (error) {
      console.error('Failed to record system resources:', error);
    }
  }

  /**
   * Clean up old metrics based on retention policy
   */
  static async cleanupOldMetrics(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - this.RETENTION_PERIODS.raw);
      
      await prisma.$queryRaw`
        DELETE FROM metrics 
        WHERE created_at < ${cutoffDate}
      `;

      await prisma.$queryRaw`
        DELETE FROM api_request_logs 
        WHERE created_at < ${cutoffDate}
      `;
    } catch (error) {
      console.error('Failed to cleanup old metrics:', error);
    }
  }

  // Helper methods
  private static getTimeFilter(timeRange: TimeRange): string {
    switch (timeRange) {
      case '1h': return '1 hour';
      case '24h': return '1 day';
      case '7d': return '7 days';
      case '30d': return '30 days';
      default: return '1 day';
    }
  }

  private static getHoursInTimeRange(timeRange: TimeRange): number {
    switch (timeRange) {
      case '1h': return 1;
      case '24h': return 24;
      case '7d': return 168;
      case '30d': return 720;
      default: return 24;
    }
  }

  // Default metrics for error cases
  private static getDefaultCSVMetrics(): CSVProcessingMetrics {
    return {
      totalProcessed: 0,
      successRate: 100,
      averageFileSize: 0,
      averageProcessingTime: 0,
      errorRate: 0,
      throughput: 0,
    };
  }

  private static getDefaultAPIMetrics(): APIPerformanceMetrics {
    return {
      requestCount: 0,
      averageResponseTime: 0,
      errorRate: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
    };
  }

  private static getDefaultSystemMetrics(): SystemResourceMetrics {
    return {
      memoryUsage: 0,
      cpuUsage: 0,
      storageUsage: 0,
      activeConnections: 0,
      queueLength: 0,
    };
  }

  private static getDefaultWorkerMetrics(): WorkerMetrics {
    return {
      activeWorkers: 0,
      totalJobs: 0,
      avgProcessingTime: 0,
      successRate: 100,
      errorRate: 0,
    };
  }

  private static getDefaultBusinessMetrics(): BusinessMetrics {
    return {
      activeWorkspaces: 0,
      totalUsers: 0,
      monthlyActiveUsers: 0,
      storageUsed: 0,
      apiUsage: 0,
    };
  }
}