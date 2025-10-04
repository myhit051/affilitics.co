/**
 * Worker Health API Endpoint
 * 
 * Provides detailed worker service status and metrics according to health-monitoring.yaml contract.
 * Requires authentication and returns worker performance data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  WorkerService, 
  SecurityService, 
  MetricsService 
} from '@affilitics/db';

// Performance metrics type matching contract
type PerformanceMetrics = {
  averageProcessingTime: number;
  successRate: number;
  throughput: number;
};

// Worker health response type
type WorkerHealthResponse = {
  status: 'idle' | 'processing' | 'error' | 'offline';
  activeJobs: number;
  queueLength: number;
  lastProcessed: string;
  performance: PerformanceMetrics;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Extract and validate authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      await recordMetrics('GET', '/api/health/worker', 401, Date.now() - startTime);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate authentication token
    const authResult = await SecurityService.validateAuthToken(authHeader);
    if (!authResult.success || !authResult.user) {
      await recordMetrics('GET', '/api/health/worker', 401, Date.now() - startTime);
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    // Get worker health status
    const workerHealth = await getWorkerHealthStatus();
    
    // Record successful API metrics
    const responseTime = Date.now() - startTime;
    await recordMetrics('GET', '/api/health/worker', 200, responseTime);

    return NextResponse.json(workerHealth, { status: 200 });

  } catch (error) {
    console.error('Worker health endpoint error:', error);
    
    // Record error metrics
    const responseTime = Date.now() - startTime;
    await recordMetrics('GET', '/api/health/worker', 500, responseTime);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to retrieve worker health status',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Get comprehensive worker health status
 */
async function getWorkerHealthStatus(): Promise<WorkerHealthResponse> {
  try {
    // Get worker health data
    const workerHealthData = await WorkerService.getWorkerHealth();
    
    // Aggregate metrics from all workers
    const aggregatedMetrics = aggregateWorkerMetrics(workerHealthData);
    
    // Determine overall worker status
    const overallStatus = determineWorkerStatus(workerHealthData);
    
    // Get active jobs and queue information
    const { activeJobs, queueLength } = await getJobStatistics();
    
    // Get last processed job timestamp
    const lastProcessed = await getLastProcessedTimestamp();

    return {
      status: overallStatus,
      activeJobs,
      queueLength,
      lastProcessed,
      performance: aggregatedMetrics,
    };

  } catch (error) {
    console.error('Failed to get worker health status:', error);
    
    // Return default unhealthy status
    return {
      status: 'error',
      activeJobs: 0,
      queueLength: 0,
      lastProcessed: new Date().toISOString(),
      performance: {
        averageProcessingTime: 0,
        successRate: 0,
        throughput: 0,
      },
    };
  }
}

/**
 * Aggregate performance metrics from all workers
 */
function aggregateWorkerMetrics(workerHealthData: any[]): PerformanceMetrics {
  if (workerHealthData.length === 0) {
    return {
      averageProcessingTime: 0,
      successRate: 100,
      throughput: 0,
    };
  }

  const totalWorkers = workerHealthData.length;
  const healthyWorkers = workerHealthData.filter(w => w.isHealthy);

  // Calculate weighted averages
  const totalProcessingTime = workerHealthData.reduce(
    (sum, worker) => sum + worker.performance.averageProcessingTime, 0
  );
  const totalSuccessRate = healthyWorkers.reduce(
    (sum, worker) => sum + worker.performance.successRate, 0
  );
  const totalThroughput = workerHealthData.reduce(
    (sum, worker) => sum + worker.performance.throughput, 0
  );

  return {
    averageProcessingTime: totalProcessingTime / totalWorkers,
    successRate: healthyWorkers.length > 0 ? totalSuccessRate / healthyWorkers.length : 0,
    throughput: totalThroughput,
  };
}

/**
 * Determine overall worker status based on individual worker health
 */
function determineWorkerStatus(
  workerHealthData: any[]
): 'idle' | 'processing' | 'error' | 'offline' {
  if (workerHealthData.length === 0) {
    return 'offline';
  }

  const healthyWorkers = workerHealthData.filter(w => w.isHealthy);
  const processingWorkers = workerHealthData.filter(w => w.activeJobs > 0);
  const errorWorkers = workerHealthData.filter(w => w.errors.length > 0);

  // Determine status priority: error > processing > idle > offline
  if (errorWorkers.length > 0) {
    return 'error';
  }
  
  if (processingWorkers.length > 0) {
    return 'processing';
  }
  
  if (healthyWorkers.length > 0) {
    return 'idle';
  }
  
  return 'offline';
}

/**
 * Get current job statistics
 */
async function getJobStatistics(): Promise<{ activeJobs: number; queueLength: number }> {
  try {
    const result = await WorkerService.getActiveWorkers();
    
    // Calculate totals from all workers
    const activeJobs = result.reduce((sum, worker) => sum + worker.currentJobs, 0);
    
    // Get queue length from job assignments
    const queueData = await WorkerService.getWorkerHealth();
    const queueLength = queueData.reduce((sum, worker) => sum + worker.queueLength, 0);

    return { activeJobs, queueLength };
  } catch (error) {
    console.error('Failed to get job statistics:', error);
    return { activeJobs: 0, queueLength: 0 };
  }
}

/**
 * Get timestamp of last processed job
 */
async function getLastProcessedTimestamp(): Promise<string> {
  try {
    const workers = await WorkerService.getActiveWorkers();
    
    // Find the most recent lastJob timestamp
    let lastProcessed = new Date(0); // Start with epoch
    
    for (const worker of workers) {
      if (worker.lastJob && worker.lastHeartbeat > lastProcessed) {
        lastProcessed = worker.lastHeartbeat;
      }
    }

    // If no jobs found, use current time
    if (lastProcessed.getTime() === 0) {
      lastProcessed = new Date();
    }

    return lastProcessed.toISOString();
  } catch (error) {
    console.error('Failed to get last processed timestamp:', error);
    return new Date().toISOString();
  }
}

/**
 * Record API metrics
 */
async function recordMetrics(
  method: string,
  path: string,
  statusCode: number,
  responseTime: number
): Promise<void> {
  try {
    await MetricsService.recordAPIRequest(method, path, statusCode, responseTime);
  } catch (error) {
    console.error('Failed to record API metrics:', error);
  }
}