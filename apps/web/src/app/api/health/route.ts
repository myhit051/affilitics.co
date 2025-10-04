/**
 * Health Check API Endpoint
 * 
 * Provides system health status according to health-monitoring.yaml contract.
 * Returns overall system health including database, worker, and storage components.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getConfigForHealth, MetricsService } from '@affilitics/db';

// Component status type matching contract
type ComponentStatus = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: string;
  responseTime: number;
  errorRate: number;
};

// Health check response type
type HealthResponse = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  components: {
    database: ComponentStatus;
    worker: ComponentStatus;
    storage: ComponentStatus;
  };
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Perform health checks for all components
    const [databaseStatus, workerStatus, storageStatus] = await Promise.all([
      checkDatabaseHealth(),
      checkWorkerHealth(),
      checkStorageHealth(),
    ]);

    // Determine overall system status
    const overallStatus = determineOverallStatus([
      databaseStatus.status,
      workerStatus.status,
      storageStatus.status,
    ]);

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      components: {
        database: databaseStatus,
        worker: workerStatus,
        storage: storageStatus,
      },
    };

    // Record API metrics
    const responseTime = Date.now() - startTime;
    await MetricsService.recordAPIRequest(
      'GET',
      '/api/health',
      200,
      responseTime
    ).catch(console.error);

    // Return appropriate HTTP status based on health
    const httpStatus = overallStatus === 'healthy' ? 200 : 
                     overallStatus === 'degraded' ? 200 : 503;

    return NextResponse.json(response, { status: httpStatus });
  } catch (error) {
    console.error('Health check failed:', error);
    
    // Record error metrics
    const responseTime = Date.now() - startTime;
    await MetricsService.recordAPIRequest(
      'GET',
      '/api/health',
      500,
      responseTime
    ).catch(console.error);

    // Return unhealthy status on error
    const errorResponse: HealthResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      components: {
        database: {
          status: 'unhealthy',
          lastCheck: new Date().toISOString(),
          responseTime: Date.now() - startTime,
          errorRate: 100,
        },
        worker: {
          status: 'unhealthy',
          lastCheck: new Date().toISOString(),
          responseTime: 0,
          errorRate: 100,
        },
        storage: {
          status: 'unhealthy',
          lastCheck: new Date().toISOString(),
          responseTime: 0,
          errorRate: 100,
        },
      },
    };

    return NextResponse.json(errorResponse, { status: 503 });
  }
}

/**
 * Check database connectivity and performance
 */
async function checkDatabaseHealth(): Promise<ComponentStatus> {
  const startTime = Date.now();
  
  try {
    // Test basic connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    // Test more complex query to ensure database is working properly
    const testResult = await prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(*) as total_workspaces,
        (SELECT COUNT(*) FROM "ImportJob" WHERE "createdAt" >= NOW() - INTERVAL '24 hours') as recent_jobs
    `;
    
    const responseTime = Date.now() - startTime;
    
    // Determine status based on response time
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (responseTime < 100) {
      status = 'healthy';
    } else if (responseTime < 1000) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      lastCheck: new Date().toISOString(),
      responseTime,
      errorRate: 0,
    };
  } catch (error) {
    console.error('Database health check failed:', error);
    
    return {
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      errorRate: 100,
    };
  }
}

/**
 * Check worker service health
 */
async function checkWorkerHealth(): Promise<ComponentStatus> {
  const startTime = Date.now();
  
  try {
    // Check for active workers and their status
    const activeWorkers = await prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(*) as total_workers,
        COUNT(CASE WHEN last_heartbeat >= NOW() - INTERVAL '2 minutes' THEN 1 END) as healthy_workers,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error_workers
      FROM worker_instances
      WHERE created_at >= NOW() - INTERVAL '1 hour'
    `;

    const responseTime = Date.now() - startTime;
    const workerStats = activeWorkers[0];
    const totalWorkers = parseInt(workerStats.total_workers) || 0;
    const healthyWorkers = parseInt(workerStats.healthy_workers) || 0;
    const errorWorkers = parseInt(workerStats.error_workers) || 0;

    // Calculate health status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    let errorRate = 0;

    if (totalWorkers === 0) {
      // No workers - could be normal if no jobs are queued
      status = 'healthy';
    } else {
      errorRate = (errorWorkers / totalWorkers) * 100;
      const healthyRate = (healthyWorkers / totalWorkers) * 100;

      if (healthyRate >= 80) {
        status = 'healthy';
      } else if (healthyRate >= 50) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }
    }

    return {
      status,
      lastCheck: new Date().toISOString(),
      responseTime,
      errorRate,
    };
  } catch (error) {
    console.error('Worker health check failed:', error);
    
    return {
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      errorRate: 100,
    };
  }
}

/**
 * Check storage system health
 */
async function checkStorageHealth(): Promise<ComponentStatus> {
  const startTime = Date.now();
  
  try {
    // Check recent import jobs to verify storage accessibility
    const storageStats = await prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(*) as total_files,
        COUNT(CASE WHEN status = 'failed' AND error LIKE '%storage%' THEN 1 END) as storage_errors,
        COALESCE(AVG(size), 0) as avg_file_size
      FROM "ImportJob"
      WHERE "createdAt" >= NOW() - INTERVAL '1 hour'
    `;

    const responseTime = Date.now() - startTime;
    const stats = storageStats[0];
    const totalFiles = parseInt(stats.total_files) || 0;
    const storageErrors = parseInt(stats.storage_errors) || 0;

    // Calculate error rate
    const errorRate = totalFiles > 0 ? (storageErrors / totalFiles) * 100 : 0;

    // Determine status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (errorRate === 0) {
      status = 'healthy';
    } else if (errorRate < 10) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      lastCheck: new Date().toISOString(),
      responseTime,
      errorRate,
    };
  } catch (error) {
    console.error('Storage health check failed:', error);
    
    return {
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      errorRate: 100,
    };
  }
}

/**
 * Determine overall system status based on component statuses
 */
function determineOverallStatus(statuses: Array<'healthy' | 'degraded' | 'unhealthy'>): 'healthy' | 'degraded' | 'unhealthy' {
  if (statuses.includes('unhealthy')) {
    return 'unhealthy';
  }
  
  if (statuses.includes('degraded')) {
    return 'degraded';
  }
  
  return 'healthy';
}