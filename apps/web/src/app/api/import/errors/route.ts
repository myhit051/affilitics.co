import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@aff/db'
import { createImportErrorService, ERROR_SEVERITY, getErrorUIConfig } from '@aff/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const errorService = createImportErrorService(prisma)
  
  try {
    const { workspaceId } = await getAuthContext()
    const { searchParams } = new URL(req.url)
    
    const jobId = searchParams.get('jobId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50')), 500)
    const errorType = searchParams.get('errorType')
    const search = searchParams.get('search')?.trim()
    const severity = searchParams.get('severity') as keyof typeof ERROR_SEVERITY | null
    const category = searchParams.get('category')
    const resolved = searchParams.get('resolved')
    const sortBy = searchParams.get('sortBy') || 'created_at'
    const sortOrder = (searchParams.get('sortOrder') || 'desc').toLowerCase()
    const includeContext = searchParams.get('includeContext') === 'true'

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

    // Verify job belongs to workspace
    const job = await prisma.importJob.findFirst({
      where: {
        id: jobId,
        workspaceId: workspaceId
      },
      select: {
        id: true,
        filename: true,
        platform: true
      }
    })

    if (!job) {
      return new Response(JSON.stringify({
        error: 'Import job not found',
        details: 'The specified import job does not exist or you do not have permission to access it',
        code: 'JOB_NOT_FOUND'
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }


    // Build comprehensive filter conditions
    const baseWhereConditions = {
      jobId: jobId,
      ...(errorType && { errorType }),
      ...(severity && { severity }),
      ...(category && { category }),
      ...(resolved === 'true' && { resolvedAt: { not: null } }),
      ...(resolved === 'false' && { resolvedAt: null }),
      ...(search && {
        OR: [
          { message: { contains: search, mode: 'insensitive' } },
          { sample: { contains: search, mode: 'insensitive' } },
          { field: { contains: search, mode: 'insensitive' } }
        ] as any
      })
    }
    
    // Get total count with enhanced filtering
    const totalErrors = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM import_errors 
      WHERE job_id = ${jobId}::uuid
        ${errorType ? `AND error_type = ${errorType}` : ``}
        ${severity ? `AND severity = ${severity}` : ``}
        ${category ? `AND category = ${category}` : ``}
        ${resolved === 'true' ? `AND resolved_at IS NOT NULL` : ``}
        ${resolved === 'false' ? `AND resolved_at IS NULL` : ``}
        ${search ? `AND (message ILIKE ${'%' + search + '%'} OR sample ILIKE ${'%' + search + '%'} OR field ILIKE ${'%' + search + '%'})` : ``}
    `

    // Calculate pagination
    const totalErrorCount = Number(totalErrors[0].count)
    const offset = (page - 1) * limit
    const totalPages = Math.ceil(totalErrorCount / limit)

    // Determine sort order
    const validSortFields = ['row_no', 'created_at', 'severity', 'error_type']
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at'
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC'
    
    // Get errors with enhanced query
    const errorsResult = await prisma.$queryRaw<Array<{
      id: string
      row_no: number
      field: string
      message: string
      sample: string
      error_type: string
      severity: string
      category: string
      recovery_strategy: string
      retry_count: number
      max_retries: number
      resolved_at: Date | null
      resolution: string | null
      dismissed: boolean
      stack_trace: string | null
      additional_context: any
      created_at: Date
    }>>`
      SELECT 
        id, row_no, field, message, sample, error_type,
        severity, category, recovery_strategy, retry_count, max_retries,
        resolved_at, resolution, dismissed, created_at
        ${includeContext ? `, stack_trace, additional_context` : ``}
      FROM import_errors 
      WHERE job_id = ${jobId}::uuid
        ${errorType ? `AND error_type = ${errorType}` : ``}
        ${severity ? `AND severity = ${severity}` : ``}
        ${category ? `AND category = ${category}` : ``}
        ${resolved === 'true' ? `AND resolved_at IS NOT NULL` : ``}
        ${resolved === 'false' ? `AND resolved_at IS NULL` : ``}
        ${search ? `AND (message ILIKE ${'%' + search + '%'} OR sample ILIKE ${'%' + search + '%'} OR field ILIKE ${'%' + search + '%'})` : ``}
      ORDER BY ${sortField} ${order}, created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    // Get comprehensive error statistics
    const errorSummary = await errorService.getErrorSummary(jobId)
    const recoveryRecommendations = await errorService.getRecoveryRecommendations(jobId)

    // Enhanced error type statistics with UI configuration
    const errorTypeStats = Object.entries(errorSummary.typeCounts).map(([type, count]) => {
      const config = getErrorUIConfig(errorSummary.typeCounts[type as keyof typeof errorSummary.typeCounts] as any)
      return {
        type,
        count,
        severity: Object.entries(errorSummary.typeCounts).find(([t, c]) => t === type)?.[1] || 'info',
        uiConfig: config
      }
    }).sort((a, b) => b.count - a.count)

    // Get enhanced error samples with more context
    const samplesResult = await prisma.$queryRaw<Array<{
      error_type: string
      row_no: number
      field: string
      sample: string
      message: string
      severity: string
    }>>`
      SELECT DISTINCT ON (error_type, row_no) 
        error_type, row_no, field, sample, message, severity
      FROM import_errors 
      WHERE job_id = ${jobId}::uuid
      ORDER BY error_type, row_no, created_at
    `
    
    // Group samples by error type with enhanced information
    const errorSamples = samplesResult.reduce((acc: any, row: any) => {
      if (!acc[row.error_type]) {
        acc[row.error_type] = []
      }
      if (acc[row.error_type].length < 5) { // Increase sample size
        acc[row.error_type].push({
          row: row.row_no,
          field: row.field,
          value: row.sample,
          message: row.message,
          severity: row.severity,
          uiConfig: getErrorUIConfig(row.severity as any)
        })
      }
      return acc
    }, {} as Record<string, any[]>)

    const response = {
      success: true,
      job: {
        id: job.id,
        filename: job.filename,
        platform: job.platform
      },
      errors: errorsResult.map((error: any) => ({
        id: error.id,
        row: error.row_no,
        field: error.field,
        type: error.error_type,
        message: error.message,
        value: error.sample,
        severity: error.severity,
        category: error.category,
        recoveryStrategy: error.recovery_strategy,
        retryCount: error.retry_count,
        maxRetries: error.max_retries,
        resolved: error.resolved_at !== null,
        resolvedAt: error.resolved_at,
        resolution: error.resolution,
        dismissed: error.dismissed,
        createdAt: error.created_at,
        uiConfig: getErrorUIConfig(error.severity as any),
        ...(includeContext && {
          stackTrace: error.stack_trace,
          additionalContext: error.additional_context
        })
      })),
      pagination: {
        page,
        limit,
        total: totalErrorCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        showing: Math.min(limit, totalErrorCount - offset)
      },
      summary: {
        total: errorSummary.totalErrors,
        critical: errorSummary.criticalCount,
        high: errorSummary.highCount,
        medium: errorSummary.mediumCount,
        low: errorSummary.lowCount,
        info: errorSummary.infoCount,
        retryable: errorSummary.retryableCount,
        blocking: errorSummary.blockerCount,
        categories: errorSummary.categoryCounts
      },
      statistics: {
        errorTypeBreakdown: errorTypeStats,
        errorSamples,
        recoveryRecommendations: recoveryRecommendations.slice(0, 5)
      },
      filters: {
        errorType,
        search,
        severity,
        category,
        resolved,
        sortBy,
        sortOrder
      },
      meta: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - Date.now() // Will be calculated properly
      }
    }

    return new Response(JSON.stringify(response), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Get errors error:', error)
    
    if (error instanceof Response) {
      return error
    }

    return new Response(JSON.stringify({
      error: 'Failed to retrieve errors',
      details: 'An unexpected error occurred while fetching import errors',
      code: 'FETCH_ERRORS_FAILED',
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

export async function POST(req: NextRequest) {
  const errorService = createImportErrorService(prisma)
  const startTime = Date.now()
  
  try {
    const { workspaceId } = await getAuthContext()
    const body = await req.json()
    const { jobId, action, errorIds, options = {} } = body

    // Enhanced parameter validation
    if (!jobId) {
      return new Response(JSON.stringify({
        error: 'Missing job ID',
        details: 'Job ID is required for all error actions',
        code: 'MISSING_JOB_ID'
      }), { status: 400 })
    }
    
    if (!action) {
      return new Response(JSON.stringify({
        error: 'Missing action',
        details: 'Action is required',
        code: 'MISSING_ACTION',
        supportedActions: ['export', 'dismiss', 'resolve', 'retry', 'clear_all', 'bulk_update']
      }), { status: 400 })
    }
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
      return new Response(JSON.stringify({
        error: 'Invalid job ID format',
        details: 'Job ID must be a valid UUID',
        code: 'INVALID_JOB_ID_FORMAT'
      }), { status: 400 })
    }

    // Verify job belongs to workspace
    const jobExists = await prisma.importJob.findFirst({
      where: {
        id: jobId,
        workspaceId: workspaceId
      },
      select: { id: true }
    })

    if (!jobExists) {
      return new Response(JSON.stringify({
        error: 'Import job not found',
        details: 'The specified import job does not exist or you do not have permission to access it',
        code: 'JOB_NOT_FOUND'
      }), { status: 404 })
    }

    switch (action) {
      case 'export':
        // Enhanced CSV export with comprehensive error information
        const exportResult = await prisma.$queryRaw<Array<{
          row_no: number
          field: string
          message: string
          sample: string
          error_type: string
          severity: string
          category: string
          recovery_strategy: string
          retry_count: number
          resolved_at: Date | null
          resolution: string | null
          dismissed: boolean
          created_at: Date
        }>>`
          SELECT 
            row_no, field, message, sample, error_type,
            severity, category, recovery_strategy, retry_count,
            resolved_at, resolution, dismissed, created_at
          FROM import_errors 
          WHERE job_id = ${jobId}::uuid
          ORDER BY row_no ASC, created_at ASC
        `

        // Generate enhanced CSV with more information
        const headers = [
          'Row', 'Field', 'Error Type', 'Severity', 'Category', 
          'Message', 'Sample Value', 'Recovery Strategy', 'Retry Count',
          'Resolved', 'Resolution', 'Dismissed', 'Created At'
        ]
        let csvContent = headers.join(',') + '\n'

        exportResult.forEach((error: any) => {
          const row = [
            error.row_no,
            error.field || '',
            error.error_type,
            error.severity,
            error.category,
            `"${error.message.replace(/"/g, '""')}"`,
            error.sample ? `"${String(error.sample).replace(/"/g, '""')}"` : '',
            error.recovery_strategy,
            error.retry_count,
            error.resolved_at ? 'Yes' : 'No',
            error.resolution ? `"${error.resolution.replace(/"/g, '""')}"` : '',
            error.dismissed ? 'Yes' : 'No',
            error.created_at.toISOString()
          ]
          csvContent += row.join(',') + '\n'
        })
        
        const filename = `import_errors_${jobId}_${new Date().toISOString().split('T')[0]}.csv`

        return new Response(csvContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': Buffer.byteLength(csvContent, 'utf8').toString()
          }
        })

      case 'dismiss':
        if (!errorIds || !Array.isArray(errorIds)) {
          return new Response(JSON.stringify({
            error: 'Invalid error IDs',
            details: 'errorIds must be an array of error IDs for dismiss action',
            code: 'INVALID_ERROR_IDS'
          }), { status: 400 })
        }
        
        if (errorIds.length === 0) {
          return new Response(JSON.stringify({
            error: 'No error IDs provided',
            details: 'At least one error ID must be provided for dismiss action',
            code: 'NO_ERROR_IDS'
          }), { status: 400 })
        }

        const dismissResult = await errorService.dismissErrors(errorIds)

        return new Response(JSON.stringify({
          success: true,
          action: 'dismiss',
          affected: dismissResult,
          message: `${dismissResult} error(s) dismissed successfully`,
          timestamp: new Date().toISOString()
        }), { status: 200 })

      case 'resolve':
        if (!errorIds || !Array.isArray(errorIds)) {
          return new Response(JSON.stringify({
            error: 'Invalid error IDs',
            details: 'errorIds must be an array of error IDs for resolve action',
            code: 'INVALID_ERROR_IDS'
          }), { status: 400 })
        }
        
        const resolution = options.resolution || 'Manually resolved'
        const resolvePromises = errorIds.map(errorId => 
          errorService.resolveError(errorId, resolution)
        )
        
        await Promise.all(resolvePromises)

        return new Response(JSON.stringify({
          success: true,
          action: 'resolve',
          affected: errorIds.length,
          message: `${errorIds.length} error(s) resolved successfully`,
          resolution,
          timestamp: new Date().toISOString()
        }), { status: 200 })
      
      case 'retry':
        if (!errorIds || !Array.isArray(errorIds)) {
          return new Response(JSON.stringify({
            error: 'Invalid error IDs',
            details: 'errorIds must be an array of error IDs for retry action',
            code: 'INVALID_ERROR_IDS'
          }), { status: 400 })
        }
        
        const retryPromises = errorIds.map(errorId => 
          errorService.markForRetry(errorId)
        )
        
        await Promise.all(retryPromises)

        return new Response(JSON.stringify({
          success: true,
          action: 'retry',
          affected: errorIds.length,
          message: `${errorIds.length} error(s) marked for retry`,
          nextStep: 'Errors will be automatically retried on next import attempt',
          timestamp: new Date().toISOString()
        }), { status: 200 })
        
      case 'clear_all':
        // Enhanced clear all with confirmation
        if (!options.confirmed) {
          const errorCount = await prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) as count FROM import_errors WHERE job_id = ${jobId}::uuid
          `
          
          return new Response(JSON.stringify({
            error: 'Confirmation required',
            details: `This will permanently delete ${Number(errorCount[0].count)} error(s). Add "confirmed": true to proceed.`,
            code: 'CONFIRMATION_REQUIRED',
            errorCount: Number(errorCount[0].count)
          }), { status: 400 })
        }
        
        const clearResult = await errorService.clearJobErrors(jobId)

        return new Response(JSON.stringify({
          success: true,
          action: 'clear_all',
          affected: clearResult,
          message: `All ${clearResult} error(s) cleared successfully`,
          warning: 'This action cannot be undone',
          timestamp: new Date().toISOString()
        }), { status: 200 })
      
      case 'bulk_update':
        if (!options.updates || !Array.isArray(options.updates)) {
          return new Response(JSON.stringify({
            error: 'Invalid updates',
            details: 'updates must be an array of update objects',
            code: 'INVALID_UPDATES',
            expectedFormat: 'updates: [{ errorId: string, action: "dismiss" | "resolve", resolution?: string }]'
          }), { status: 400 })
        }
        
        const bulkResults = {
          dismissed: 0,
          resolved: 0,
          errors: [] as string[]
        }
        
        for (const update of options.updates) {
          try {
            if (update.action === 'dismiss') {
              await errorService.dismissErrors([update.errorId])
              bulkResults.dismissed++
            } else if (update.action === 'resolve') {
              await errorService.resolveError(update.errorId, update.resolution)
              bulkResults.resolved++
            }
          } catch (error) {
            bulkResults.errors.push(`Failed to ${update.action} error ${update.errorId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }

        return new Response(JSON.stringify({
          success: bulkResults.errors.length === 0,
          action: 'bulk_update',
          results: bulkResults,
          message: `Bulk update completed: ${bulkResults.dismissed} dismissed, ${bulkResults.resolved} resolved${bulkResults.errors.length > 0 ? `, ${bulkResults.errors.length} failed` : ''}`,
          timestamp: new Date().toISOString()
        }), { status: bulkResults.errors.length === 0 ? 200 : 207 })

      default:
        return new Response(JSON.stringify({
          error: 'Invalid action',
          details: `Action '${action}' is not supported`,
          code: 'INVALID_ACTION',
          supportedActions: ['export', 'dismiss', 'resolve', 'retry', 'clear_all', 'bulk_update']
        }), { status: 400 })
    }

  } catch (error) {
    console.error('Error action error:', error)
    
    if (error instanceof Response) {
      return error
    }

    return new Response(JSON.stringify({
      error: 'Failed to perform action',
      details: 'An unexpected error occurred while performing the requested action',
      code: 'ACTION_FAILED',
      action: 'unknown',
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