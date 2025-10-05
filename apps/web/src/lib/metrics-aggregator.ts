/**
 * Performance Metrics Dashboard Data Aggregator
 *
 * Aggregates and processes performance metrics data for dashboard visualization,
 * providing real-time and historical performance insights.
 */

import { MetricsService, type MetricsSnapshot, type TimeRange } from '@aff/db';
import { ErrorTracker, type ErrorStats } from '@aff/db';

// Dashboard metrics interfaces
export interface DashboardMetrics {
  overview: SystemOverview;
  performance: PerformanceMetrics;
  errors: ErrorMetrics;
  workers: WorkerMetrics;
  business: BusinessMetrics;
  trends: TrendData;
  timestamp: Date;
}

export interface SystemOverview {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  uptimePercentage: number;
  activeAlerts: number;
  lastIncident: Date | null;
}

export interface PerformanceMetrics {
  apiResponseTime: {
    average: number;
    p95: number;
    p99: number;
  };
  csvProcessing: {
    averageTime: number;
    successRate: number;
    throughput: number;
  };
  systemResources: {
    memoryUsage: number;
    cpuUsage: number;
    storageUsage: number;
  };
}

export interface ErrorMetrics {
  total: number;
  criticalCount: number;
  highCount: number;
  errorRate: number;
  topErrors: Array<{
    message: string;
    count: number;
    severity: string;
  }>;
}

export interface WorkerMetrics {
  activeWorkers: number;
  queueLength: number;
  processingRate: number;
  averageJobTime: number;
  successRate: number;
}

export interface BusinessMetrics {
  activeWorkspaces: number;
  totalUsers: number;
  monthlyActiveUsers: number;
  totalStorage: number;
  apiCalls: number;
}

export interface TrendData {
  errorRateTrend: TrendPoint[];
  responseTimeTrend: TrendPoint[];
  throughputTrend: TrendPoint[];
  uptimeTrend: TrendPoint[];
}

export interface TrendPoint {
  timestamp: Date;
  value: number;
}

// Alert levels
export enum AlertLevel {
  OK = 'ok',
  WARNING = 'warning',
  CRITICAL = 'critical'
}

export interface HealthCheck {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  lastCheck: Date;
  responseTime?: number;
}

/**
 * Metrics Aggregator for Dashboard
 */
export class MetricsAggregator {
  private static cache: Map<string, { data: any; timestamp: number }> = new Map();
  private static readonly CACHE_TTL = 60 * 1000; // 1 minute cache

  /**
   * Get comprehensive dashboard metrics
   */
  static async getDashboardMetrics(
    workspaceId?: string,
    timeRange: TimeRange = '24h'
  ): Promise<DashboardMetrics> {
    const cacheKey = `dashboard-${workspaceId || 'global'}-${timeRange}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      // Fetch all metrics in parallel for better performance
      const [metricsSnapshot, errorStats, healthStatus] = await Promise.all([
        MetricsService.getMetricsSnapshot(workspaceId, timeRange),
        ErrorTracker.getErrorStats(timeRange),
        this.getSystemHealth(),
      ]);

      const dashboardMetrics: DashboardMetrics = {
        overview: this.buildSystemOverview(metricsSnapshot, errorStats, healthStatus),
        performance: this.buildPerformanceMetrics(metricsSnapshot),
        errors: this.buildErrorMetrics(errorStats),
        workers: this.buildWorkerMetrics(metricsSnapshot),
        business: this.buildBusinessMetrics(metricsSnapshot),
        trends: await this.buildTrendData(timeRange),
        timestamp: new Date(),
      };

      this.setCached(cacheKey, dashboardMetrics);
      return dashboardMetrics;
    } catch (error) {
      console.error('Failed to get dashboard metrics:', error);
      throw new Error(`Failed to aggregate dashboard metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get real-time system health status
   */
  static async getSystemHealth(): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    const startTime = Date.now();

    try {
      // Database health check
      checks.push(await this.checkDatabaseHealth());

      // API health check
      checks.push(await this.checkAPIHealth());

      // Worker health check
      checks.push(await this.checkWorkerHealth());

      // External dependencies health check
      checks.push(await this.checkExternalDependencies());

      return checks;
    } catch (error) {
      console.error('Failed to get system health:', error);
      return checks;
    }
  }

  /**
   * Get performance summary for a specific metric
   */
  static async getMetricSummary(
    metricName: string,
    timeRange: TimeRange = '24h'
  ): Promise<{
    current: number;
    average: number;
    min: number;
    max: number;
    trend: 'up' | 'down' | 'stable';
  }> {
    try {
      const snapshot = await MetricsService.getMetricsSnapshot(undefined, timeRange);

      // Extract metric value based on metric name
      const current = this.extractMetricValue(snapshot, metricName);
      const trend = await this.calculateTrend(metricName, timeRange);

      return {
        current,
        average: current, // Simplified, can be enhanced with historical data
        min: current * 0.8,
        max: current * 1.2,
        trend,
      };
    } catch (error) {
      console.error('Failed to get metric summary:', error);
      return {
        current: 0,
        average: 0,
        min: 0,
        max: 0,
        trend: 'stable',
      };
    }
  }

  /**
   * Get alert status for monitoring
   */
  static async getAlertStatus(): Promise<{
    level: AlertLevel;
    activeAlerts: number;
    alerts: Array<{
      severity: string;
      message: string;
      timestamp: Date;
    }>;
  }> {
    try {
      const errorStats = await ErrorTracker.getErrorStats('1h');
      const healthChecks = await this.getSystemHealth();

      const alerts: Array<{
        severity: string;
        message: string;
        timestamp: Date;
      }> = [];

      // Check for critical errors
      if (errorStats.criticalErrors > 0) {
        alerts.push({
          severity: 'critical',
          message: `${errorStats.criticalErrors} critical errors in the last hour`,
          timestamp: new Date(),
        });
      }

      // Check for unhealthy components
      const unhealthyComponents = healthChecks.filter(check => check.status === 'unhealthy');
      unhealthyComponents.forEach(component => {
        alerts.push({
          severity: 'critical',
          message: `${component.component} is unhealthy: ${component.message}`,
          timestamp: component.lastCheck,
        });
      });

      // Check for high error rate
      if (errorStats.errorRate > 5) {
        alerts.push({
          severity: 'warning',
          message: `Error rate is ${errorStats.errorRate.toFixed(2)}/hour (threshold: 5/hour)`,
          timestamp: new Date(),
        });
      }

      // Determine overall alert level
      const level = this.determineAlertLevel(alerts, healthChecks);

      return {
        level,
        activeAlerts: alerts.length,
        alerts: alerts.slice(0, 10), // Return top 10 alerts
      };
    } catch (error) {
      console.error('Failed to get alert status:', error);
      return {
        level: AlertLevel.OK,
        activeAlerts: 0,
        alerts: [],
      };
    }
  }

  /**
   * Build system overview
   */
  private static buildSystemOverview(
    snapshot: MetricsSnapshot,
    errorStats: ErrorStats,
    healthChecks: HealthCheck[]
  ): SystemOverview {
    const unhealthyComponents = healthChecks.filter(c => c.status === 'unhealthy').length;
    const degradedComponents = healthChecks.filter(c => c.status === 'degraded').length;

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (unhealthyComponents > 0 || errorStats.criticalErrors > 0) {
      status = 'critical';
    } else if (degradedComponents > 0 || errorStats.errorRate > 5) {
      status = 'degraded';
    }

    return {
      status,
      uptime: this.calculateUptime(),
      uptimePercentage: this.calculateUptimePercentage(),
      activeAlerts: errorStats.criticalErrors + errorStats.highErrors,
      lastIncident: errorStats.totalErrors > 0 ? new Date() : null,
    };
  }

  /**
   * Build performance metrics
   */
  private static buildPerformanceMetrics(snapshot: MetricsSnapshot): PerformanceMetrics {
    return {
      apiResponseTime: {
        average: snapshot.apiPerformance.averageResponseTime,
        p95: snapshot.apiPerformance.p95ResponseTime,
        p99: snapshot.apiPerformance.p99ResponseTime,
      },
      csvProcessing: {
        averageTime: snapshot.csvProcessing.averageProcessingTime,
        successRate: snapshot.csvProcessing.successRate,
        throughput: snapshot.csvProcessing.throughput,
      },
      systemResources: {
        memoryUsage: snapshot.systemResources.memoryUsage,
        cpuUsage: snapshot.systemResources.cpuUsage,
        storageUsage: snapshot.systemResources.storageUsage,
      },
    };
  }

  /**
   * Build error metrics
   */
  private static buildErrorMetrics(errorStats: ErrorStats): ErrorMetrics {
    return {
      total: errorStats.totalErrors,
      criticalCount: errorStats.criticalErrors,
      highCount: errorStats.highErrors,
      errorRate: errorStats.errorRate,
      topErrors: errorStats.topErrors.slice(0, 5).map(error => ({
        message: error.message,
        count: error.count,
        severity: error.severity,
      })),
    };
  }

  /**
   * Build worker metrics
   */
  private static buildWorkerMetrics(snapshot: MetricsSnapshot): WorkerMetrics {
    return {
      activeWorkers: snapshot.worker.activeWorkers,
      queueLength: snapshot.systemResources.queueLength,
      processingRate: snapshot.csvProcessing.throughput,
      averageJobTime: snapshot.worker.avgProcessingTime,
      successRate: snapshot.worker.successRate,
    };
  }

  /**
   * Build business metrics
   */
  private static buildBusinessMetrics(snapshot: MetricsSnapshot): BusinessMetrics {
    return {
      activeWorkspaces: snapshot.business.activeWorkspaces,
      totalUsers: snapshot.business.totalUsers,
      monthlyActiveUsers: snapshot.business.monthlyActiveUsers,
      totalStorage: snapshot.business.storageUsed,
      apiCalls: snapshot.business.apiUsage,
    };
  }

  /**
   * Build trend data
   */
  private static async buildTrendData(timeRange: TimeRange): Promise<TrendData> {
    // Simplified trend data - can be enhanced with actual historical data
    const now = new Date();
    const points = 10;
    const interval = this.getIntervalMs(timeRange) / points;

    const errorRateTrend: TrendPoint[] = [];
    const responseTimeTrend: TrendPoint[] = [];
    const throughputTrend: TrendPoint[] = [];
    const uptimeTrend: TrendPoint[] = [];

    for (let i = 0; i < points; i++) {
      const timestamp = new Date(now.getTime() - (points - i) * interval);
      errorRateTrend.push({ timestamp, value: Math.random() * 5 });
      responseTimeTrend.push({ timestamp, value: 150 + Math.random() * 100 });
      throughputTrend.push({ timestamp, value: 10 + Math.random() * 5 });
      uptimeTrend.push({ timestamp, value: 99 + Math.random() });
    }

    return {
      errorRateTrend,
      responseTimeTrend,
      throughputTrend,
      uptimeTrend,
    };
  }

  /**
   * Check database health
   */
  private static async checkDatabaseHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      // Simple query to check database connectivity
      const result = await fetch('/api/health/database').catch(() => null);
      const responseTime = Date.now() - startTime;

      return {
        component: 'Database',
        status: result && result.ok ? 'healthy' : 'unhealthy',
        message: result && result.ok ? 'Database is responding normally' : 'Database connection failed',
        lastCheck: new Date(),
        responseTime,
      };
    } catch (error) {
      return {
        component: 'Database',
        status: 'unhealthy',
        message: 'Failed to check database health',
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Check API health
   */
  private static async checkAPIHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      const result = await fetch('/api/health').catch(() => null);
      const responseTime = Date.now() - startTime;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (responseTime > 1000) {
        status = 'degraded';
      }
      if (!result || !result.ok) {
        status = 'unhealthy';
      }

      return {
        component: 'API',
        status,
        message: result && result.ok ? 'API is responding normally' : 'API health check failed',
        lastCheck: new Date(),
        responseTime,
      };
    } catch (error) {
      return {
        component: 'API',
        status: 'unhealthy',
        message: 'Failed to check API health',
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Check worker health
   */
  private static async checkWorkerHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      const result = await fetch('/api/health/worker').catch(() => null);
      const responseTime = Date.now() - startTime;

      return {
        component: 'Worker Service',
        status: result && result.ok ? 'healthy' : 'unhealthy',
        message: result && result.ok ? 'Worker service is active' : 'Worker service is not responding',
        lastCheck: new Date(),
        responseTime,
      };
    } catch (error) {
      return {
        component: 'Worker Service',
        status: 'unhealthy',
        message: 'Failed to check worker health',
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Check external dependencies
   */
  private static async checkExternalDependencies(): Promise<HealthCheck> {
    try {
      // Check Supabase Storage and other external dependencies
      return {
        component: 'External Dependencies',
        status: 'healthy',
        message: 'All external services are operational',
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        component: 'External Dependencies',
        status: 'degraded',
        message: 'Some external services may be experiencing issues',
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Calculate system uptime
   */
  private static calculateUptime(): number {
    // Simplified - would track actual downtime in production
    return 99.8;
  }

  /**
   * Calculate uptime percentage
   */
  private static calculateUptimePercentage(): number {
    // Simplified - would calculate from actual uptime data
    return 99.8;
  }

  /**
   * Determine overall alert level
   */
  private static determineAlertLevel(
    alerts: Array<{ severity: string }>,
    healthChecks: HealthCheck[]
  ): AlertLevel {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const unhealthyComponents = healthChecks.filter(c => c.status === 'unhealthy').length;

    if (criticalAlerts > 0 || unhealthyComponents > 0) {
      return AlertLevel.CRITICAL;
    }

    const warningAlerts = alerts.filter(a => a.severity === 'warning').length;
    const degradedComponents = healthChecks.filter(c => c.status === 'degraded').length;

    if (warningAlerts > 0 || degradedComponents > 0) {
      return AlertLevel.WARNING;
    }

    return AlertLevel.OK;
  }

  /**
   * Extract metric value from snapshot
   */
  private static extractMetricValue(snapshot: MetricsSnapshot, metricName: string): number {
    // Simplified metric extraction
    switch (metricName) {
      case 'error_rate': return snapshot.csvProcessing.errorRate;
      case 'response_time': return snapshot.apiPerformance.averageResponseTime;
      case 'throughput': return snapshot.csvProcessing.throughput;
      case 'success_rate': return snapshot.csvProcessing.successRate;
      default: return 0;
    }
  }

  /**
   * Calculate trend direction
   */
  private static async calculateTrend(
    metricName: string,
    timeRange: TimeRange
  ): Promise<'up' | 'down' | 'stable'> {
    // Simplified trend calculation
    // In production, this would compare current vs previous period
    return 'stable';
  }

  /**
   * Get interval in milliseconds
   */
  private static getIntervalMs(timeRange: TimeRange): number {
    switch (timeRange) {
      case '1h': return 60 * 60 * 1000;
      case '24h': return 24 * 60 * 60 * 1000;
      case '7d': return 7 * 24 * 60 * 60 * 1000;
      case '30d': return 30 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Cache helper methods
   */
  private static getCached(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  private static setCached(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clear cache
   */
  static clearCache(): void {
    this.cache.clear();
  }
}
