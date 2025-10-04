/**
 * Performance Metrics API Endpoint
 * 
 * Provides system performance metrics according to health-monitoring.yaml contract.
 * Requires authentication and supports time range filtering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  SecurityService, 
  MetricsService,
  TimeRange 
} from '@affilitics/db';

// Performance metrics response type matching contract
type PerformanceMetricsResponse = {
  csvProcessing: {
    totalProcessed: number;
    successRate: number;
    averageFileSize: number;
    averageProcessingTime: number;
  };
  apiPerformance: {
    requestCount: number;
    averageResponseTime: number;
    errorRate: number;
    p95ResponseTime: number;
  };
  systemResources: {
    memoryUsage: number;
    cpuUsage: number;
    storageUsage: number;
  };
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Extract and validate authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      await recordMetrics('GET', '/api/metrics/performance', 401, Date.now() - startTime);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate authentication token
    const authResult = await SecurityService.validateAuthToken(authHeader);
    if (!authResult.success || !authResult.user) {
      await recordMetrics('GET', '/api/metrics/performance', 401, Date.now() - startTime);
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    // Extract and validate query parameters
    const url = new URL(request.url);
    const timeRange = validateTimeRange(url.searchParams.get('timeRange'));
    const workspaceId = url.searchParams.get('workspaceId');

    // Validate workspace access if workspaceId is provided
    if (workspaceId) {
      const workspaceValidation = await SecurityService.validateWorkspaceAccess(
        authResult.user.id,
        workspaceId
      );

      if (!workspaceValidation.valid) {
        await recordMetrics('GET', '/api/metrics/performance', 403, Date.now() - startTime);
        return NextResponse.json(
          { 
            error: 'Access denied',
            message: 'You do not have permission to access this workspace metrics'
          },
          { status: 403 }
        );
      }
    }

    // Get performance metrics
    const metrics = await getPerformanceMetrics(timeRange, workspaceId);
    
    // Audit the metrics access
    await SecurityService.auditSecurityEvent(
      'metrics_accessed',
      authResult.user.id,
      workspaceId || undefined,
      {
        timeRange,
        ipAddress: getClientIP(request),
        userAgent: request.headers.get('user-agent'),
      }
    );

    // Record successful API metrics
    const responseTime = Date.now() - startTime;
    await recordMetrics('GET', '/api/metrics/performance', 200, responseTime, workspaceId);

    return NextResponse.json(metrics, { status: 200 });

  } catch (error) {
    console.error('Performance metrics endpoint error:', error);
    
    // Record error metrics
    const responseTime = Date.now() - startTime;
    await recordMetrics('GET', '/api/metrics/performance', 500, responseTime);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to retrieve performance metrics',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Validate and normalize time range parameter
 */
function validateTimeRange(timeRangeParam: string | null): TimeRange {
  const validTimeRanges: TimeRange[] = ['1h', '24h', '7d', '30d'];
  
  if (timeRangeParam && validTimeRanges.includes(timeRangeParam as TimeRange)) {
    return timeRangeParam as TimeRange;
  }
  
  return '24h'; // Default to 24 hours
}

/**
 * Get comprehensive performance metrics
 */
async function getPerformanceMetrics(
  timeRange: TimeRange,
  workspaceId?: string | null
): Promise<PerformanceMetricsResponse> {
  try {
    // Get metrics snapshot
    const snapshot = await MetricsService.getMetricsSnapshot(
      workspaceId || undefined,
      timeRange
    );

    // Transform to match contract schema
    const response: PerformanceMetricsResponse = {
      csvProcessing: {
        totalProcessed: snapshot.csvProcessing.totalProcessed,
        successRate: snapshot.csvProcessing.successRate,
        averageFileSize: snapshot.csvProcessing.averageFileSize,
        averageProcessingTime: snapshot.csvProcessing.averageProcessingTime,
      },
      apiPerformance: {
        requestCount: snapshot.apiPerformance.requestCount,
        averageResponseTime: snapshot.apiPerformance.averageResponseTime,
        errorRate: snapshot.apiPerformance.errorRate,
        p95ResponseTime: snapshot.apiPerformance.p95ResponseTime,
      },
      systemResources: {
        memoryUsage: snapshot.systemResources.memoryUsage,
        cpuUsage: snapshot.systemResources.cpuUsage,
        storageUsage: snapshot.systemResources.storageUsage,
      },
    };

    return response;
  } catch (error) {
    console.error('Failed to get performance metrics:', error);
    
    // Return default metrics on error
    return getDefaultMetrics();
  }
}

/**
 * Get default metrics for error cases
 */
function getDefaultMetrics(): PerformanceMetricsResponse {
  return {
    csvProcessing: {
      totalProcessed: 0,
      successRate: 100,
      averageFileSize: 0,
      averageProcessingTime: 0,
    },
    apiPerformance: {
      requestCount: 0,
      averageResponseTime: 0,
      errorRate: 0,
      p95ResponseTime: 0,
    },
    systemResources: {
      memoryUsage: 0,
      cpuUsage: 0,
      storageUsage: 0,
    },
  };
}

/**
 * Get client IP address
 */
function getClientIP(request: NextRequest): string {
  // Check various headers for real IP
  const xForwardedFor = request.headers.get('x-forwarded-for');
  const xRealIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  
  if (xRealIP) {
    return xRealIP;
  }
  
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  return 'unknown';
}

/**
 * Record API metrics
 */
async function recordMetrics(
  method: string,
  path: string,
  statusCode: number,
  responseTime: number,
  workspaceId?: string | null
): Promise<void> {
  try {
    await MetricsService.recordAPIRequest(
      method, 
      path, 
      statusCode, 
      responseTime, 
      workspaceId || undefined
    );
  } catch (error) {
    console.error('Failed to record API metrics:', error);
  }
}