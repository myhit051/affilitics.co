/**
 * Job Retry API Endpoint
 * 
 * Handles job retry requests according to error-handling.yaml contract.
 * Requires authentication and workspace validation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  SecurityService, 
  MetricsService,
  ImportJobService
} from '@affilitics/db';

// Job retry response type matching contract
type JobRetryResponse = {
  jobId: string;
  retryCount: number;
  status: 'retry_queued' | 'retry_failed' | 'max_retries_exceeded';
};

// Error response type matching contract
type ErrorResponse = {
  error: string;
  message: string;
  code: string;
  details?: Record<string, any>;
  timestamp: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
): Promise<NextResponse> {
  const startTime = Date.now();
  const { jobId } = params;
  
  try {
    // Extract and validate authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      await recordMetrics('POST', `/api/jobs/${jobId}/retry`, 401, Date.now() - startTime);
      return createErrorResponse(
        'AUTHENTICATION_REQUIRED',
        'Authentication required',
        'Authentication token must be provided',
        401
      );
    }

    // Validate authentication token
    const authResult = await SecurityService.validateAuthToken(authHeader);
    if (!authResult.success || !authResult.user) {
      await recordMetrics('POST', `/api/jobs/${jobId}/retry`, 401, Date.now() - startTime);
      return createErrorResponse(
        'INVALID_TOKEN',
        'Invalid authentication token',
        'The provided authentication token is invalid or expired',
        401
      );
    }

    // Validate jobId parameter
    if (!jobId || typeof jobId !== 'string') {
      await recordMetrics('POST', `/api/jobs/${jobId}/retry`, 400, Date.now() - startTime);
      return createErrorResponse(
        'INVALID_JOB_ID',
        'Invalid job ID',
        'Job ID must be a valid string',
        400
      );
    }

    // Get workspace context (in a real app, this might come from query params or be inferred)
    // For now, we'll try to get it from the job itself
    let workspaceId: string;
    try {
      const job = await ImportJobService.getEnhancedJob(jobId);
      workspaceId = job.workspaceId;
    } catch (error) {
      await recordMetrics('POST', `/api/jobs/${jobId}/retry`, 404, Date.now() - startTime);
      return createErrorResponse(
        'JOB_NOT_FOUND',
        'Job not found',
        'The specified job could not be found',
        404
      );
    }

    // Validate workspace access
    const workspaceValidation = await SecurityService.validateWorkspaceAccess(
      authResult.user.id,
      workspaceId
    );

    if (!workspaceValidation.valid) {
      await recordMetrics('POST', `/api/jobs/${jobId}/retry`, 403, Date.now() - startTime);
      return createErrorResponse(
        'ACCESS_DENIED',
        'Access denied',
        'You do not have permission to access this job',
        403
      );
    }

    // Attempt to retry the job
    const retryResult = await ImportJobService.retryJob(jobId, workspaceId);
    
    if (!retryResult.success) {
      const statusCode = getStatusCodeFromRetryResult(retryResult);
      await recordMetrics('POST', `/api/jobs/${jobId}/retry`, statusCode, Date.now() - startTime);
      
      return createErrorResponse(
        getErrorCodeFromRetryResult(retryResult),
        'Cannot retry job',
        retryResult.message,
        statusCode,
        {
          canRetry: retryResult.canRetry,
          retryCount: retryResult.retryCount,
          nextRetryAt: retryResult.nextRetryAt?.toISOString(),
        }
      );
    }

    // Audit the retry action
    await SecurityService.auditSecurityEvent(
      'job_retry_requested',
      authResult.user.id,
      workspaceId,
      {
        jobId,
        retryCount: retryResult.retryCount,
        ipAddress: getClientIP(request),
        userAgent: request.headers.get('user-agent'),
      }
    );

    // Record successful API metrics
    const responseTime = Date.now() - startTime;
    await recordMetrics('POST', `/api/jobs/${jobId}/retry`, 200, responseTime, workspaceId);

    // Return success response
    const response: JobRetryResponse = {
      jobId,
      retryCount: retryResult.retryCount,
      status: 'retry_queued',
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Job retry endpoint error:', error);
    
    // Record error metrics
    const responseTime = Date.now() - startTime;
    await recordMetrics('POST', `/api/jobs/${jobId}/retry`, 500, responseTime);

    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      'Failed to process job retry request',
      500
    );
  }
}

/**
 * Get HTTP status code based on retry result
 */
function getStatusCodeFromRetryResult(retryResult: any): number {
  if (retryResult.message.includes('not found') || retryResult.message.includes('access denied')) {
    return 404;
  }
  
  if (retryResult.message.includes('cannot be retried') || 
      retryResult.message.includes('maximum retry attempts')) {
    return 400;
  }
  
  if (retryResult.message.includes('not yet available')) {
    return 429; // Too Many Requests
  }
  
  return 400; // Bad Request (default)
}

/**
 * Get error code based on retry result
 */
function getErrorCodeFromRetryResult(retryResult: any): string {
  if (retryResult.message.includes('not found')) {
    return 'JOB_NOT_FOUND';
  }
  
  if (retryResult.message.includes('access denied')) {
    return 'ACCESS_DENIED';
  }
  
  if (retryResult.message.includes('cannot be retried')) {
    return 'JOB_NOT_RETRYABLE';
  }
  
  if (retryResult.message.includes('maximum retry attempts')) {
    return 'MAX_RETRIES_EXCEEDED';
  }
  
  if (retryResult.message.includes('not yet available')) {
    return 'RETRY_TOO_SOON';
  }
  
  return 'RETRY_FAILED';
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
 * Create standardized error response
 */
function createErrorResponse(
  code: string,
  error: string,
  message: string,
  status: number,
  details?: Record<string, any>
): NextResponse {
  const errorResponse: ErrorResponse = {
    error,
    message,
    code,
    details,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(errorResponse, { status });
}

/**
 * Record API metrics
 */
async function recordMetrics(
  method: string,
  path: string,
  statusCode: number,
  responseTime: number,
  workspaceId?: string
): Promise<void> {
  try {
    await MetricsService.recordAPIRequest(method, path, statusCode, responseTime, workspaceId);
  } catch (error) {
    console.error('Failed to record API metrics:', error);
  }
}