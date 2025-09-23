import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { prisma, IMPORT_JOB_STATUS, validateStatusTransition, isActiveStatus } from '@aff/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return new Response(JSON.stringify({
        error: 'Missing job ID',
        details: 'Job ID is required'
      }), { status: 400 })
    }

    // Security: Get import job status using Prisma to prevent SQL injection
    const job = await prisma.importJob.findFirst({
      where: {
        id: jobId,
        workspaceId: workspaceId
      },
      select: {
        id: true,
        workspaceId: true,
        platform: true,
        filename: true,
        size: true,
        status: true,
        hash: true,
        error: true,
        startedAt: true,
        finishedAt: true,
        createdBy: true,
        createdAt: true
      }
    })
    
    if (!job) {
      return new Response(JSON.stringify({
        error: 'Import job not found',
        details: 'The specified import job does not exist or does not belong to your workspace'
      }), { status: 404 })
    }

    // Calculate progress percentage based on status using secure constants
    let progress = 0
    switch (job.status) {
      case IMPORT_JOB_STATUS.QUEUED:
        progress = 10
        break
      case IMPORT_JOB_STATUS.VALIDATING:
        progress = 25
        break
      case IMPORT_JOB_STATUS.PROCESSING:
        progress = 50
        break
      case IMPORT_JOB_STATUS.COMPLETED:
        progress = 100
        break
      case IMPORT_JOB_STATUS.FAILED:
      case IMPORT_JOB_STATUS.VALIDATION_FAILED:
        progress = 25
        break
      case IMPORT_JOB_STATUS.CANCELLED:
        progress = 0
        break
      default:
        progress = 0
    }

    // Security: Get error summary using Prisma to prevent SQL injection
    let errorSummary = null
    if (job.error) {
      // Since we only have a single error field in the schema, we'll use that
      errorSummary = [{
        error_type: 'general',
        count: 1,
        messages: [job.error]
      }]
    }

    // Processing statistics are not available in current schema
    let processingStats = null

    const response = {
      success: true,
      job: {
        id: job.id,
        platform: job.platform,
        filename: job.filename,
        size: job.size,
        status: job.status,
        progress: Math.round(progress),
        errorCount: job.error ? 1 : 0,
        timestamps: {
          created: job.createdAt,
          started: job.startedAt,
          completed: job.finishedAt
        }
      },
      errorSummary,
      processingStats
    }

    // Estimated completion time not available with current schema

    return new Response(JSON.stringify(response), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Status check error:', error)
    
    if (error instanceof Response) {
      return error // Re-throw auth errors
    }

    return new Response(JSON.stringify({
      error: 'Failed to get import status',
      details: 'An error occurred while checking import status'
    }), { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const body = await req.json()
    const { jobId, action } = body

    if (!jobId || !action) {
      return new Response(JSON.stringify({
        error: 'Missing parameters',
        details: 'Both jobId and action are required'
      }), { status: 400 })
    }

    // Security: Verify job belongs to workspace using Prisma
    const jobCheck = await prisma.importJob.findFirst({
      where: {
        id: jobId,
        workspaceId: workspaceId
      },
      select: {
        id: true,
        status: true
      }
    })

    if (!jobCheck) {
      return new Response(JSON.stringify({
        error: 'Import job not found'
      }), { status: 404 })
    }

    const currentStatus = jobCheck.status

    switch (action) {
      case 'cancel':
        // Use secure status constants and validation
        if (!isActiveStatus(currentStatus as any)) {
          return new Response(JSON.stringify({
            error: 'Cannot cancel job',
            details: `Jobs with status '${currentStatus}' cannot be cancelled`
          }), { status: 400 })
        }

        try {
          // Validate status transition
          validateStatusTransition(currentStatus as any, IMPORT_JOB_STATUS.CANCELLED, jobId)
          
          await prisma.importJob.update({
            where: { id: jobId },
            data: {
              status: IMPORT_JOB_STATUS.CANCELLED,
              finishedAt: new Date(),
              error: 'Cancelled by user'
            }
          })
        } catch (error) {
          console.error(`Failed to cancel job ${jobId}:`, (error as Error).message)
          return new Response(JSON.stringify({
            error: 'Invalid status transition',
            details: (error as Error).message
          }), { status: 400 })
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Import job cancelled successfully'
        }), { status: 200 })

      case 'retry':
        if (currentStatus !== IMPORT_JOB_STATUS.FAILED) {
          return new Response(JSON.stringify({
            error: 'Cannot retry job',
            details: `Jobs with status '${currentStatus}' cannot be retried`
          }), { status: 400 })
        }

        try {
          // Validate status transition
          validateStatusTransition(currentStatus, IMPORT_JOB_STATUS.QUEUED, jobId)
          
          // Security: Reset job status using Prisma
          await prisma.importJob.update({
            where: { id: jobId },
            data: {
              status: IMPORT_JOB_STATUS.QUEUED,
              startedAt: null,
              finishedAt: null,
              error: null
            }
          })
        } catch (error) {
          console.error(`Failed to retry job ${jobId}:`, (error as Error).message)
          return new Response(JSON.stringify({
            error: 'Invalid status transition',
            details: (error as Error).message
          }), { status: 400 })
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Import job reset for retry'
        }), { status: 200 })

      case 'delete':
        if (currentStatus === IMPORT_JOB_STATUS.PROCESSING) {
          return new Response(JSON.stringify({
            error: 'Cannot delete job',
            details: 'Cannot delete jobs that are currently processing'
          }), { status: 400 })
        }

        // Security: Delete the job using Prisma
        await prisma.importJob.delete({
          where: { id: jobId }
        })

        return new Response(JSON.stringify({
          success: true,
          message: 'Import job deleted successfully'
        }), { status: 200 })

      default:
        return new Response(JSON.stringify({
          error: 'Invalid action',
          details: `Action '${action}' is not supported`
        }), { status: 400 })
    }

  } catch (error) {
    console.error('Status action error:', error)
    
    if (error instanceof Response) {
      return error
    }

    return new Response(JSON.stringify({
      error: 'Failed to perform action',
      details: 'An error occurred while performing the requested action'
    }), { status: 500 })
  }
}