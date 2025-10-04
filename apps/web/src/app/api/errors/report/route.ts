/**
 * Error Reporting API Endpoint
 * 
 * Handles error report submissions according to error-handling.yaml contract.
 * Requires authentication and provides structured error tracking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  SecurityService, 
  MetricsService,
  prisma 
} from '@affilitics/db';

// Error report type matching contract
type ErrorReport = {
  errorType: 'validation' | 'processing' | 'system' | 'network';
  message: string;
  stackTrace?: string;
  context?: Record<string, any>;
  userAgent?: string;
  url?: string;
  timestamp?: string;
};

// Error response type
type ErrorReportResponse = {
  errorId: string;
  status: 'reported' | 'investigating' | 'resolved';
};

// Error response format
type ErrorResponse = {
  error: string;
  message: string;
  code: string;
  details?: Record<string, any>;
  timestamp: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Extract and validate authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      await recordMetrics('POST', '/api/errors/report', 401, Date.now() - startTime);
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
      await recordMetrics('POST', '/api/errors/report', 401, Date.now() - startTime);
      return createErrorResponse(
        'INVALID_TOKEN',
        'Invalid authentication token',
        'The provided authentication token is invalid or expired',
        401
      );
    }

    // Parse and validate request body
    let errorReport: ErrorReport;
    try {
      errorReport = await request.json();
    } catch (parseError) {
      await recordMetrics('POST', '/api/errors/report', 400, Date.now() - startTime);
      return createErrorResponse(
        'INVALID_JSON',
        'Invalid JSON in request body',
        'Request body must be valid JSON',
        400
      );
    }

    // Validate required fields
    const validation = validateErrorReport(errorReport);
    if (!validation.valid) {
      await recordMetrics('POST', '/api/errors/report', 400, Date.now() - startTime);
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid error report data',
        validation.errors.join(', '),
        400,
        { validationErrors: validation.errors }
      );
    }

    // Sanitize input data
    const sanitizedReport = SecurityService.sanitizeInput(errorReport);

    // Extract additional context from request
    const userAgent = request.headers.get('user-agent') || sanitizedReport.userAgent;
    const clientIP = getClientIP(request);
    const referer = request.headers.get('referer') || sanitizedReport.url;

    // Create error report record
    const errorRecord = await createErrorRecord(
      sanitizedReport,
      authResult.user.id,
      userAgent,
      clientIP,
      referer
    );

    // Audit the error report
    await SecurityService.auditSecurityEvent(
      'error_reported',
      authResult.user.id,
      undefined,
      {
        errorId: errorRecord.id,
        errorType: sanitizedReport.errorType,
        ipAddress: clientIP,
        userAgent,
      }
    );

    // Record API metrics
    const responseTime = Date.now() - startTime;
    await recordMetrics('POST', '/api/errors/report', 201, responseTime);

    // Return success response
    const response: ErrorReportResponse = {
      errorId: errorRecord.id,
      status: determineInitialStatus(sanitizedReport.errorType),
    };

    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    console.error('Error reporting endpoint error:', error);
    
    // Record error metrics
    const responseTime = Date.now() - startTime;
    await recordMetrics('POST', '/api/errors/report', 500, responseTime);

    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      'Failed to process error report',
      500
    );
  }
}

/**
 * Validate error report data
 */
function validateErrorReport(report: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (!report.errorType) {
    errors.push('errorType is required');
  } else if (!['validation', 'processing', 'system', 'network'].includes(report.errorType)) {
    errors.push('errorType must be one of: validation, processing, system, network');
  }

  if (!report.message) {
    errors.push('message is required');
  } else if (typeof report.message !== 'string') {
    errors.push('message must be a string');
  } else if (report.message.length > 2000) {
    errors.push('message must be less than 2000 characters');
  }

  // Validate optional fields
  if (report.stackTrace && typeof report.stackTrace !== 'string') {
    errors.push('stackTrace must be a string');
  } else if (report.stackTrace && report.stackTrace.length > 10000) {
    errors.push('stackTrace must be less than 10000 characters');
  }

  if (report.context && typeof report.context !== 'object') {
    errors.push('context must be an object');
  }

  if (report.userAgent && typeof report.userAgent !== 'string') {
    errors.push('userAgent must be a string');
  }

  if (report.url && typeof report.url !== 'string') {
    errors.push('url must be a string');
  }

  if (report.timestamp && !isValidISO8601(report.timestamp)) {
    errors.push('timestamp must be a valid ISO 8601 date string');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create error record in database
 */
async function createErrorRecord(
  report: ErrorReport,
  userId: string,
  userAgent: string | null,
  clientIP: string,
  referer: string | null
): Promise<{ id: string }> {
  try {
    const errorId = SecurityService.generateSecureToken(16);
    
    await prisma.$queryRaw`
      INSERT INTO error_reports (
        id, user_id, error_type, message, stack_trace, context,
        user_agent, url, client_ip, referer, status, severity,
        created_at, updated_at
      ) VALUES (
        ${errorId},
        ${userId},
        ${report.errorType},
        ${report.message},
        ${report.stackTrace},
        ${JSON.stringify(report.context || {})},
        ${userAgent},
        ${report.url || referer},
        ${clientIP},
        ${referer},
        'reported',
        ${determineSeverity(report.errorType, report.message)},
        ${report.timestamp ? new Date(report.timestamp) : new Date()},
        NOW()
      )
    `;

    return { id: errorId };
  } catch (error) {
    console.error('Failed to create error record:', error);
    throw new Error('Failed to save error report');
  }
}

/**
 * Determine initial status based on error type
 */
function determineInitialStatus(errorType: string): 'reported' | 'investigating' | 'resolved' {
  // Critical system errors start with investigating status
  if (errorType === 'system') {
    return 'investigating';
  }
  
  // All others start as reported
  return 'reported';
}

/**
 * Determine error severity
 */
function determineSeverity(errorType: string, message: string): 'low' | 'medium' | 'high' | 'critical' {
  // System errors are high priority
  if (errorType === 'system') {
    return 'high';
  }
  
  // Processing errors are medium priority
  if (errorType === 'processing') {
    return 'medium';
  }
  
  // Check for critical keywords in message
  const criticalKeywords = ['crash', 'fatal', 'corrupt', 'security', 'breach'];
  if (criticalKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
    return 'critical';
  }
  
  // Default to low priority
  return 'low';
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
 * Validate ISO 8601 date string
 */
function isValidISO8601(dateString: string): boolean {
  try {
    const date = new Date(dateString);
    return date.toISOString() === dateString;
  } catch {
    return false;
  }
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
  responseTime: number
): Promise<void> {
  try {
    await MetricsService.recordAPIRequest(method, path, statusCode, responseTime);
  } catch (error) {
    console.error('Failed to record API metrics:', error);
  }
}