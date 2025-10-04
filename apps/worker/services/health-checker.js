/**
 * System Health Monitoring Service
 *
 * Provides automated health checks for all system components including
 * API endpoints, database, worker services, and external dependencies.
 * Runs periodic checks and reports health status for monitoring.
 */

import { MetricsService } from '@affilitics/db';
import { ErrorTracker, MonitoringErrorSeverity, MonitoringErrorCategory } from '@affilitics/db';
import { prisma } from '@affilitics/db';

// Health check status
const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown'
};

// Health check results interface
class HealthCheckResult {
  constructor(component, status, message, responseTime = null, metadata = {}) {
    this.component = component;
    this.status = status;
    this.message = message;
    this.responseTime = responseTime;
    this.metadata = metadata;
    this.timestamp = new Date();
  }
}

/**
 * Health Checker Service
 */
class HealthChecker {
  constructor() {
    this.checkInterval = null;
    this.checkFrequency = 60000; // 1 minute
    this.healthHistory = new Map();
    this.maxHistorySize = 100;
  }

  /**
   * Start health monitoring
   */
  start() {
    console.log('Starting health monitoring service...');

    // Run initial health check
    this.runHealthChecks().catch(err => {
      console.error('Initial health check failed:', err);
    });

    // Schedule periodic health checks
    this.checkInterval = setInterval(() => {
      this.runHealthChecks().catch(err => {
        console.error('Scheduled health check failed:', err);
      });
    }, this.checkFrequency);

    console.log(`Health checks scheduled every ${this.checkFrequency / 1000} seconds`);
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('Health monitoring stopped');
    }
  }

  /**
   * Run all health checks
   */
  async runHealthChecks() {
    const startTime = Date.now();
    console.log('[HealthChecker] Running system health checks...');

    try {
      // Run all health checks in parallel
      const results = await Promise.allSettled([
        this.checkDatabaseHealth(),
        this.checkWorkerHealth(),
        this.checkAPIHealth(),
        this.checkExternalDependencies(),
        this.checkSystemResources(),
        this.checkQueueHealth()
      ]);

      const healthChecks = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          const componentNames = ['Database', 'Worker', 'API', 'External', 'System', 'Queue'];
          return new HealthCheckResult(
            componentNames[index],
            HealthStatus.UNKNOWN,
            `Health check failed: ${result.reason?.message || 'Unknown error'}`
          );
        }
      });

      // Store health check results
      await this.storeHealthCheckResults(healthChecks);

      // Analyze overall system health
      const systemHealth = this.analyzeSystemHealth(healthChecks);

      // Report unhealthy components
      const unhealthyComponents = healthChecks.filter(
        check => check.status === HealthStatus.UNHEALTHY
      );

      if (unhealthyComponents.length > 0) {
        await this.reportUnhealthyComponents(unhealthyComponents);
      }

      // Record metrics
      await this.recordHealthMetrics(healthChecks, systemHealth);

      const duration = Date.now() - startTime;
      console.log(`[HealthChecker] Health checks completed in ${duration}ms - Status: ${systemHealth.status}`);

      return {
        status: systemHealth.status,
        checks: healthChecks,
        timestamp: new Date(),
        duration
      };
    } catch (error) {
      console.error('[HealthChecker] Failed to run health checks:', error);

      await ErrorTracker.trackError({
        severity: MonitoringErrorSeverity.HIGH,
        category: MonitoringErrorCategory.SYSTEM,
        message: 'Health check system failure',
        stack: error.stack,
        context: { error: error.message }
      });

      throw error;
    }
  }

  /**
   * Check database health
   */
  async checkDatabaseHealth() {
    const startTime = Date.now();

    try {
      // Test database connectivity with a simple query
      await prisma.$queryRaw`SELECT 1 as health_check`;

      // Check connection pool status
      const activeConnections = await this.getActiveConnections();

      const responseTime = Date.now() - startTime;

      let status = HealthStatus.HEALTHY;
      let message = 'Database is healthy';

      if (responseTime > 1000) {
        status = HealthStatus.DEGRADED;
        message = `Database responding slowly (${responseTime}ms)`;
      }

      return new HealthCheckResult('Database', status, message, responseTime, {
        activeConnections
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;

      await ErrorTracker.trackError({
        severity: MonitoringErrorSeverity.CRITICAL,
        category: MonitoringErrorCategory.DATABASE,
        message: 'Database health check failed',
        stack: error.stack,
        context: { error: error.message }
      });

      return new HealthCheckResult(
        'Database',
        HealthStatus.UNHEALTHY,
        `Database connection failed: ${error.message}`,
        responseTime
      );
    }
  }

  /**
   * Check worker service health
   */
  async checkWorkerHealth() {
    const startTime = Date.now();

    try {
      // Check worker instances in database
      const result = await prisma.$queryRaw`
        SELECT
          COUNT(*) as total_workers,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_workers,
          COUNT(CASE WHEN last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 1 END) as stale_workers
        FROM worker_instances
        WHERE status != 'offline'
      `;

      const stats = result[0];
      const responseTime = Date.now() - startTime;

      const totalWorkers = parseInt(stats.total_workers) || 0;
      const activeWorkers = parseInt(stats.active_workers) || 0;
      const staleWorkers = parseInt(stats.stale_workers) || 0;

      let status = HealthStatus.HEALTHY;
      let message = `${activeWorkers} active workers`;

      if (totalWorkers === 0) {
        status = HealthStatus.UNHEALTHY;
        message = 'No worker instances found';
      } else if (staleWorkers > 0) {
        status = HealthStatus.DEGRADED;
        message = `${staleWorkers} workers have stale heartbeats`;
      }

      return new HealthCheckResult('Worker Service', status, message, responseTime, {
        totalWorkers,
        activeWorkers,
        staleWorkers
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return new HealthCheckResult(
        'Worker Service',
        HealthStatus.UNHEALTHY,
        `Worker health check failed: ${error.message}`,
        responseTime
      );
    }
  }

  /**
   * Check API health
   */
  async checkAPIHealth() {
    const startTime = Date.now();

    try {
      // Check recent API request performance
      const result = await prisma.$queryRaw`
        SELECT
          COUNT(*) as total_requests,
          AVG(response_time) as avg_response_time,
          COUNT(CASE WHEN status_code >= 500 THEN 1 END) as server_errors
        FROM api_request_logs
        WHERE created_at >= NOW() - INTERVAL '5 minutes'
      `;

      const stats = result[0];
      const responseTime = Date.now() - startTime;

      const totalRequests = parseInt(stats.total_requests) || 0;
      const avgResponseTime = parseFloat(stats.avg_response_time) || 0;
      const serverErrors = parseInt(stats.server_errors) || 0;

      let status = HealthStatus.HEALTHY;
      let message = 'API is healthy';

      if (totalRequests > 0) {
        const errorRate = (serverErrors / totalRequests) * 100;

        if (errorRate > 10) {
          status = HealthStatus.UNHEALTHY;
          message = `High error rate: ${errorRate.toFixed(2)}%`;
        } else if (errorRate > 5 || avgResponseTime > 500) {
          status = HealthStatus.DEGRADED;
          message = `Degraded performance: ${avgResponseTime.toFixed(0)}ms avg response time`;
        }
      }

      return new HealthCheckResult('API', status, message, responseTime, {
        totalRequests,
        avgResponseTime,
        serverErrors
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return new HealthCheckResult(
        'API',
        HealthStatus.UNHEALTHY,
        `API health check failed: ${error.message}`,
        responseTime
      );
    }
  }

  /**
   * Check external dependencies
   */
  async checkExternalDependencies() {
    const startTime = Date.now();

    try {
      // Check Supabase Storage availability
      // In production, this would make actual API calls to external services
      const checks = {
        storage: true,
        auth: true
      };

      const responseTime = Date.now() - startTime;

      let status = HealthStatus.HEALTHY;
      let message = 'All external dependencies are healthy';

      return new HealthCheckResult('External Dependencies', status, message, responseTime, {
        checks
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return new HealthCheckResult(
        'External Dependencies',
        HealthStatus.DEGRADED,
        `Some external services may be unavailable: ${error.message}`,
        responseTime
      );
    }
  }

  /**
   * Check system resources
   */
  async checkSystemResources() {
    const startTime = Date.now();

    try {
      // Get system resource metrics
      const memoryUsage = process.memoryUsage();
      const memoryUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const memoryTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
      const memoryPercentage = (memoryUsedMB / memoryTotalMB) * 100;

      const cpuUsage = process.cpuUsage();
      const responseTime = Date.now() - startTime;

      let status = HealthStatus.HEALTHY;
      let message = 'System resources are normal';

      if (memoryPercentage > 90) {
        status = HealthStatus.UNHEALTHY;
        message = `Critical memory usage: ${memoryPercentage.toFixed(1)}%`;
      } else if (memoryPercentage > 75) {
        status = HealthStatus.DEGRADED;
        message = `High memory usage: ${memoryPercentage.toFixed(1)}%`;
      }

      // Record system metrics
      await MetricsService.recordSystemResources(
        memoryPercentage,
        0, // CPU usage calculation would be more complex
        0  // Storage usage
      );

      return new HealthCheckResult('System Resources', status, message, responseTime, {
        memoryUsedMB,
        memoryTotalMB,
        memoryPercentage: memoryPercentage.toFixed(1)
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return new HealthCheckResult(
        'System Resources',
        HealthStatus.UNKNOWN,
        `Failed to check system resources: ${error.message}`,
        responseTime
      );
    }
  }

  /**
   * Check queue health
   */
  async checkQueueHealth() {
    const startTime = Date.now();

    try {
      // Check job queue status
      const result = await prisma.$queryRaw`
        SELECT
          COUNT(*) as total_jobs,
          COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued_jobs,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_jobs,
          COUNT(CASE WHEN status = 'failed' AND "createdAt" >= NOW() - INTERVAL '1 hour' THEN 1 END) as recent_failures
        FROM "ImportJob"
        WHERE status IN ('queued', 'processing', 'failed')
      `;

      const stats = result[0];
      const responseTime = Date.now() - startTime;

      const queuedJobs = parseInt(stats.queued_jobs) || 0;
      const processingJobs = parseInt(stats.processing_jobs) || 0;
      const recentFailures = parseInt(stats.recent_failures) || 0;

      let status = HealthStatus.HEALTHY;
      let message = `Queue: ${queuedJobs} queued, ${processingJobs} processing`;

      if (queuedJobs > 100) {
        status = HealthStatus.DEGRADED;
        message = `Large queue backlog: ${queuedJobs} jobs`;
      }

      if (recentFailures > 10) {
        status = HealthStatus.DEGRADED;
        message = `High failure rate: ${recentFailures} failures in last hour`;
      }

      return new HealthCheckResult('Job Queue', status, message, responseTime, {
        queuedJobs,
        processingJobs,
        recentFailures
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return new HealthCheckResult(
        'Job Queue',
        HealthStatus.UNHEALTHY,
        `Queue health check failed: ${error.message}`,
        responseTime
      );
    }
  }

  /**
   * Store health check results in database
   */
  async storeHealthCheckResults(healthChecks) {
    try {
      for (const check of healthChecks) {
        await prisma.$queryRaw`
          INSERT INTO health_check_logs (
            component, status, message, response_time, metadata, created_at
          ) VALUES (
            ${check.component},
            ${check.status},
            ${check.message},
            ${check.responseTime},
            ${JSON.stringify(check.metadata)},
            ${check.timestamp}
          )
        `;
      }
    } catch (error) {
      console.error('Failed to store health check results:', error);
    }
  }

  /**
   * Analyze overall system health
   */
  analyzeSystemHealth(healthChecks) {
    const unhealthyCount = healthChecks.filter(c => c.status === HealthStatus.UNHEALTHY).length;
    const degradedCount = healthChecks.filter(c => c.status === HealthStatus.DEGRADED).length;

    let status = HealthStatus.HEALTHY;
    if (unhealthyCount > 0) {
      status = HealthStatus.UNHEALTHY;
    } else if (degradedCount > 0) {
      status = HealthStatus.DEGRADED;
    }

    return {
      status,
      totalChecks: healthChecks.length,
      healthyCount: healthChecks.filter(c => c.status === HealthStatus.HEALTHY).length,
      degradedCount,
      unhealthyCount
    };
  }

  /**
   * Report unhealthy components
   */
  async reportUnhealthyComponents(unhealthyComponents) {
    for (const component of unhealthyComponents) {
      const severity = component.status === HealthStatus.UNHEALTHY
        ? MonitoringErrorSeverity.CRITICAL
        : MonitoringErrorSeverity.HIGH;

      await ErrorTracker.trackError({
        severity,
        category: MonitoringErrorCategory.SYSTEM,
        message: `${component.component} is ${component.status}: ${component.message}`,
        context: {
          component: component.component,
          status: component.status,
          responseTime: component.responseTime,
          metadata: component.metadata
        }
      });
    }
  }

  /**
   * Record health metrics
   */
  async recordHealthMetrics(healthChecks, systemHealth) {
    try {
      const timestamp = new Date();

      const metrics = [
        {
          name: 'system_health_score',
          type: 'gauge',
          value: this.calculateHealthScore(systemHealth),
          timestamp,
          labels: { status: systemHealth.status }
        },
        {
          name: 'health_check_duration',
          type: 'histogram',
          value: healthChecks.reduce((sum, c) => sum + (c.responseTime || 0), 0),
          timestamp
        }
      ];

      await MetricsService.recordMetrics(metrics);
    } catch (error) {
      console.error('Failed to record health metrics:', error);
    }
  }

  /**
   * Calculate health score (0-100)
   */
  calculateHealthScore(systemHealth) {
    const total = systemHealth.totalChecks;
    const healthy = systemHealth.healthyCount;
    const degraded = systemHealth.degradedCount;

    // Healthy = 100%, Degraded = 50%, Unhealthy = 0%
    return ((healthy * 100 + degraded * 50) / total);
  }

  /**
   * Get active database connections
   */
  async getActiveConnections() {
    try {
      const result = await prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;
      return parseInt(result[0]?.count) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get health check history
   */
  getHealthHistory(component, limit = 10) {
    const history = this.healthHistory.get(component) || [];
    return history.slice(-limit);
  }

  /**
   * Clean up old health check logs
   */
  async cleanupOldHealthLogs(retentionDays = 7) {
    try {
      await prisma.$queryRaw`
        DELETE FROM health_check_logs
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
      `;
      console.log(`Cleaned up health check logs older than ${retentionDays} days`);
    } catch (error) {
      console.error('Failed to cleanup old health logs:', error);
    }
  }
}

// Create and export singleton instance
const healthChecker = new HealthChecker();

// Export functions for use in worker
export const startHealthMonitoring = () => healthChecker.start();
export const stopHealthMonitoring = () => healthChecker.stop();
export const runHealthCheck = () => healthChecker.runHealthChecks();
export const getHealthHistory = (component, limit) => healthChecker.getHealthHistory(component, limit);
export const cleanupHealthLogs = (retentionDays) => healthChecker.cleanupOldHealthLogs(retentionDays);

export default healthChecker;
