import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@aff/db'
import { createImportErrorService } from '@aff/db'
import { 
  IMPORT_JOB_STATUS,
  validateStatusTransition 
} from '@aff/db'


import { verifyCSRFEnhanced, CSRFError, logCSRFEvent } from '@/lib/security/csrf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Retry failed import job with comprehensive error recovery
 */
export async function POST(req: NextRequest) {
  const errorService = createImportErrorService(prisma)
  const startTime = Date.now()
  
  try {
    const { user, workspaceId } = await getAuthContext()
    
    // Security: CSRF Protection for retry endpoint
    try {
      await verifyCSRFEnhanced(req, user.id, {
        enableOriginValidation: true,
        enableRateLimit: true,
        enableDoubleSubmit: false
      })
    } catch (error) {
      if (error instanceof CSRFError) {
        logCSRFEvent('RETRY_CSRF_FAILED', {
          workspaceId,
          error: error.message,
          statusCode: error.statusCode,
          origin: req.headers.get('origin'),
          userAgent: req.headers.get('user-agent')
        })
        return new Response(JSON.stringify({ 
          error: 'CSRF verification failed',
          details: error.message
        }), { status: error.statusCode })
      }
      throw error
    }
    
    const body = await req.json()
    const { 
      jobId, 
      retryStrategy = 'auto', // 'auto', 'manual', 'force'
      skipErrors = false,
      maxRetries = 3,
      delayMs = 1000
    } = body

    // Validate required parameters
    if (!jobId) {
      return new Response(JSON.stringify({
        error: 'Missing job ID',
        details: 'Job ID is required for retry operation',
        code: 'MISSING_JOB_ID'
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
      return new Response(JSON.stringify({
        error: 'Invalid job ID format',
        details: 'Job ID must be a valid UUID',
        code: 'INVALID_JOB_ID_FORMAT'
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Get job details
    const job = await prisma.$queryRaw<Array<{
      id: string
      workspace_id: string
      platform: string
      filename: string
      original_filename: string
      status: string
      retry_count: number
      max_retries: number
      error_count: number
      created_at: Date
      started_at: Date | null
      completed_at: Date | null
    }>>`
      SELECT 
        id, workspace_id, platform, filename, original_filename,
        status, retry_count, max_retries, error_count,
        created_at, started_at, completed_at
      FROM import_jobs 
      WHERE id = ${jobId}::uuid AND workspace_id = ${workspaceId}::uuid
    `

    if (job.length === 0) {
      return new Response(JSON.stringify({
        error: 'Import job not found',
        details: 'The specified import job does not exist or you do not have permission to access it',
        code: 'JOB_NOT_FOUND'
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const jobData = job[0]

    // Check if job can be retried
    const retryableStatuses = ['failed', 'validation_failed']
    if (!retryableStatuses.includes(jobData.status)) {
      return new Response(JSON.stringify({
        error: 'Job cannot be retried',
        details: `Job status is '${jobData.status}'. Only failed jobs can be retried.`,
        code: 'NON_RETRYABLE_STATUS',
        currentStatus: jobData.status,
        allowedStatuses: retryableStatuses
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check retry limits
    const effectiveMaxRetries = Math.min(maxRetries, 10) // Cap at 10 retries
    if (jobData.retry_count >= effectiveMaxRetries && retryStrategy !== 'force') {
      return new Response(JSON.stringify({
        error: 'Retry limit exceeded',
        details: `Job has already been retried ${jobData.retry_count} times (max: ${effectiveMaxRetries})`,
        code: 'RETRY_LIMIT_EXCEEDED',
        currentRetries: jobData.retry_count,
        maxRetries: effectiveMaxRetries,
        suggestion: 'Use retryStrategy=force to override limit or review errors first'
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Get error analysis
    const errorSummary = await errorService.getErrorSummary(jobId)
    const retryableErrors = await errorService.getRetryableErrors(jobId)
    const hasBlockingErrors = await errorService.hasBlockingErrors(jobId)

    // Determine retry feasibility
    let retryFeasible = true
    const retryReasons: string[] = []
    const warnings: string[] = []

    if (hasBlockingErrors && !skipErrors && retryStrategy !== 'force') {
      retryFeasible = false
      retryReasons.push(`Job has ${errorSummary.blockerCount} blocking errors`)
    }

    if (retryableErrors.length === 0 && errorSummary.totalErrors > 0 && retryStrategy === 'auto') {
      retryFeasible = false
      retryReasons.push('No retryable errors found')
    }

    if (retryableErrors.length > 0) {
      warnings.push(`${retryableErrors.length} errors will be automatically retried`)
    }

    if (errorSummary.totalErrors - retryableErrors.length > 0) {
      warnings.push(`${errorSummary.totalErrors - retryableErrors.length} errors will be skipped`)
    }

    // If not feasible and not forcing, return analysis
    if (!retryFeasible && retryStrategy !== 'force') {
      const recommendations = await errorService.getRecoveryRecommendations(jobId)
      
      return new Response(JSON.stringify({
        error: 'Retry not recommended',
        details: 'Retry is not recommended based on current error analysis',
        code: 'RETRY_NOT_RECOMMENDED',
        analysis: {
          totalErrors: errorSummary.totalErrors,
          blockingErrors: errorSummary.blockerCount,
          retryableErrors: retryableErrors.length,
          reasons: retryReasons
        },
        recommendations: recommendations.slice(0, 3),
        options: {
          forceRetry: 'Use retryStrategy=force to retry anyway',
          skipErrors: 'Use skipErrors=true to skip non-retryable errors',
          reviewErrors: 'Review and fix errors before retrying'
        }
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Calculate retry delay with exponential backoff
    const baseDelay = Math.max(delayMs, 100)
    const backoffMultiplier = 1.5
    const calculatedDelay = baseDelay * Math.pow(backoffMultiplier, jobData.retry_count)
    const jitterMs = Math.random() * 200
    const finalDelay = Math.min(calculatedDelay + jitterMs, 30000) // Cap at 30 seconds

    // Update job for retry
    const retryContext = {
      retryStrategy,
      skipErrors,
      previousRetryCount: jobData.retry_count,
      retryableErrorCount: retryableErrors.length,
      blockingErrorCount: errorSummary.blockerCount,
      initiatedBy: 'api',
      timestamp: new Date()
    }

    await prisma.$transaction(async (tx: any) => {
      // Validate status transition
      try {
        validateStatusTransition(
          jobData.status as any,
          IMPORT_JOB_STATUS.QUEUED,
          jobId
        )
      } catch (error) {
        throw new Error(`Invalid status transition: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      // Update job status and retry information
      await tx.$executeRaw`
        UPDATE import_jobs 
        SET 
          status = ${IMPORT_JOB_STATUS.QUEUED},
          retry_count = retry_count + 1,
          started_at = NULL,
          completed_at = NULL,
          processing_summary = ${JSON.stringify({
            retryAttempt: jobData.retry_count + 1,
            retryContext,
            previousErrors: errorSummary.totalErrors,
            retryableErrors: retryableErrors.length,
            scheduledDelay: finalDelay,
            retryInitiatedAt: new Date().toISOString()
          })}
        WHERE id = ${jobId}::uuid
      `

      // Mark retryable errors for retry
      if (retryableErrors.length > 0) {
        const retryPromises = retryableErrors.map((error: any) => 
          errorService.markForRetry(error.id!)
        )
        await Promise.all(retryPromises)
      }

      // If skipping errors, dismiss non-retryable errors
      if (skipErrors && errorSummary.totalErrors > retryableErrors.length) {
        await tx.$executeRaw`
          UPDATE import_errors 
          SET dismissed = true,
              dismissed_at = NOW(),
              resolution = 'Auto-dismissed during retry with skipErrors=true'
          WHERE job_id = ${jobId}::uuid 
            AND retry_count >= max_retries
            AND NOT dismissed
        `
      }
    })

    // Calculate retry schedule
    const retryAt = new Date(Date.now() + finalDelay)
    const processingTime = Date.now() - startTime

    return new Response(JSON.stringify({
      success: true,
      jobId,
      action: 'retry_scheduled',
      retryDetails: {
        retryCount: jobData.retry_count + 1,
        maxRetries: effectiveMaxRetries,
        strategy: retryStrategy,
        scheduledDelay: finalDelay,
        retryAt: retryAt.toISOString(),
        skipErrors
      },
      errorAnalysis: {
        totalErrors: errorSummary.totalErrors,
        retryableErrors: retryableErrors.length,
        blockingErrors: errorSummary.blockerCount,
        willRetry: retryableErrors.length,
        willSkip: skipErrors ? errorSummary.totalErrors - retryableErrors.length : 0
      },
      warnings,
      nextSteps: [
        `Job will be automatically retried in ${Math.round(finalDelay / 1000)} seconds`,
        retryableErrors.length > 0 ? `${retryableErrors.length} errors will be retried` : null,
        skipErrors && errorSummary.totalErrors > retryableErrors.length ? 
          `${errorSummary.totalErrors - retryableErrors.length} errors will be skipped` : null,
        'Monitor job status for retry progress'
      ].filter(Boolean),
      meta: {
        processingTime,
        timestamp: new Date().toISOString()
      }
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Retry operation error:', error)
    
    if (error instanceof Response) {
      return error
    }

    return new Response(JSON.stringify({
      error: 'Retry operation failed',
      details: 'An unexpected error occurred while setting up the retry operation',
      code: 'RETRY_OPERATION_FAILED',
      processingTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && {
        debugInfo: error instanceof Error ? error.message : String(error)
      })
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * Get retry status and recommendations for a job
 */
export async function GET(req: NextRequest) {
  const errorService = createImportErrorService(prisma)
  
  try {
    const { workspaceId } = await getAuthContext()
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return new Response(JSON.stringify({
        error: 'Missing job ID',
        details: 'Job ID is required',
        code: 'MISSING_JOB_ID'
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Get job details
    const job = await prisma.$queryRaw<Array<{
      id: string
      status: string
      retry_count: number
      max_retries: number
      error_count: number
      processing_summary: any
    }>>`
      SELECT 
        id, status, retry_count, max_retries, error_count, processing_summary
      FROM import_jobs 
      WHERE id = ${jobId}::uuid AND workspace_id = ${workspaceId}::uuid
    `

    if (job.length === 0) {
      return new Response(JSON.stringify({
        error: 'Import job not found',
        code: 'JOB_NOT_FOUND'
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const jobData = job[0]
    
    // Get error analysis
    const errorSummary = await errorService.getErrorSummary(jobId)
    const retryableErrors = await errorService.getRetryableErrors(jobId)
    const hasBlockingErrors = await errorService.hasBlockingErrors(jobId)
    const recommendations = await errorService.getRecoveryRecommendations(jobId)

    // Determine retry feasibility
    const canRetry = ['failed', 'validation_failed'].includes(jobData.status)
    const hasRetryCapacity = jobData.retry_count < jobData.max_retries
    const hasRetryableErrors = retryableErrors.length > 0
    const recommendRetry = canRetry && hasRetryCapacity && (hasRetryableErrors || !hasBlockingErrors)

    return new Response(JSON.stringify({
      success: true,
      jobId,
      retryStatus: {
        canRetry,
        recommendRetry,
        currentRetries: jobData.retry_count,
        maxRetries: jobData.max_retries,
        hasCapacity: hasRetryCapacity,
        status: jobData.status
      },
      errorAnalysis: {
        totalErrors: errorSummary.totalErrors,
        retryableErrors: retryableErrors.length,
        blockingErrors: errorSummary.blockerCount,
        hasBlockingErrors,
        hasRetryableErrors
      },
      retryOptions: {
        auto: {
          feasible: recommendRetry && hasRetryableErrors,
          description: 'Automatically retry only retryable errors'
        },
        skipErrors: {
          feasible: canRetry && hasRetryCapacity,
          description: 'Retry with non-retryable errors skipped'
        },
        force: {
          feasible: canRetry,
          description: 'Force retry regardless of error analysis (not recommended)'
        }
      },
      recommendations: recommendations.slice(0, 5),
      lastRetryInfo: jobData.processing_summary?.retryContext || null
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Get retry status error:', error)
    
    return new Response(JSON.stringify({
      error: 'Failed to get retry status',
      details: 'An error occurred while retrieving retry information',
      code: 'GET_RETRY_STATUS_FAILED'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}