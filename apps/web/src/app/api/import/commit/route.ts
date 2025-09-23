import { NextRequest } from 'next/server'
import { prisma } from '@aff/db'
import { getAuthContext } from '@/lib/auth'
import { supabaseAsService } from '@/lib/supabase'
import { parseCSVWithValidation, transformToStandardFormat } from '@/lib/import/csv-parser'
import { getPlatformConfig } from '@/lib/import/platform-configs'
import { verifyCSRFEnhanced, CSRFError, logCSRFEvent } from '@/lib/security/csrf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { user, workspaceId } = await getAuthContext()
    
    // Security: CSRF Protection for commit endpoint
    try {
      await verifyCSRFEnhanced(req, user.id, {
        enableOriginValidation: true,
        enableRateLimit: true,
        enableDoubleSubmit: false
      })
    } catch (error) {
      if (error instanceof CSRFError) {
        logCSRFEvent('COMMIT_CSRF_FAILED', {
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
    
    const body = await req.json().catch(() => ({}))
    const { jobId, dateFrom, dateTo, forceProcess = false } = body

    if (!jobId) {
      return new Response(JSON.stringify({ 
        error: 'Missing job ID',
        details: 'Job ID is required to start processing'
      }), { status: 400 })
    }

    // Get and validate import job
    const jobQuery = `
      SELECT 
        id, workspace_id, platform, filename, original_filename, 
        storage_path, size, status, hash, total_rows, valid_rows, error_count
      FROM import_jobs 
      WHERE id = $1 AND workspace_id = $2
    `
    const jobResult = await prisma.$queryRaw`
      SELECT 
        id, workspace_id, platform, filename, original_filename, 
        storage_path, size, status, hash, total_rows, valid_rows, error_count
      FROM import_jobs 
      WHERE id = ${jobId}::uuid AND workspace_id = ${workspaceId}::uuid
    `
    
    if ((jobResult as any[]).length === 0) {
      return new Response(JSON.stringify({
        error: 'Import job not found',
        details: 'The specified import job does not exist or does not belong to your workspace'
      }), { status: 404 })
    }

    const job = (jobResult as any[])[0]

    // Check job status
    if (!['validated', 'failed'].includes(job.status) && !forceProcess) {
      return new Response(JSON.stringify({
        error: 'Job not ready for processing',
        details: `Job status is '${job.status}'. Only validated jobs can be processed.`,
        currentStatus: job.status
      }), { status: 400 })
    }

    // If job has critical errors and not forcing, reject
    if (job.error_count > 0 && !forceProcess) {
      const criticalErrorsQuery = `
        SELECT COUNT(*) as critical_count
        FROM import_errors 
        WHERE job_id = $1 AND error_type IN ('missing', 'invalid_type')
      `
      const criticalResult = await prisma.$queryRaw`
        SELECT COUNT(*) as critical_count
        FROM import_errors 
        WHERE job_id = ${jobId}::uuid AND error_type IN ('missing', 'invalid_type')
      `
      const criticalCount = parseInt((criticalResult as any[])[0].critical_count)

      if (criticalCount > 0) {
        return new Response(JSON.stringify({
          error: 'Critical errors present',
          details: `Job has ${criticalCount} critical errors. Use forceProcess=true to proceed anyway.`,
          criticalErrorCount: criticalCount
        }), { status: 400 })
      }
    }

    // Update job status to processing
    await prisma.$executeRaw`
      UPDATE import_jobs 
      SET status = 'processing', started_at = NOW(), processed_rows = 0 
      WHERE id = ${jobId}::uuid
    `

    // Download and parse file
    const supa = supabaseAsService()
    const bucket = process.env.SUPABASE_STORAGE_BUCKET!
    
    const { data: fileData, error: downloadError } = await supa
      .storage.from(bucket)
      .download(job.storage_path)

    if (downloadError || !fileData) {
      await prisma.$executeRaw`
        UPDATE import_jobs SET status = 'failed', completed_at = NOW() WHERE id = ${jobId}::uuid
      `
      return new Response(JSON.stringify({
        error: 'File not accessible',
        details: 'Could not retrieve the uploaded file for processing'
      }), { status: 500 })
    }

    const csvContent = await fileData.text()
    const platformConfig = getPlatformConfig(job.platform)

    // Parse CSV data
    const parseResult = await parseCSVWithValidation(csvContent, platformConfig as any, {
      skipEmptyLines: true,
      trimWhitespace: true
    })

    if (parseResult.data.length === 0) {
      await prisma.$executeRaw`
        UPDATE import_jobs 
        SET status = 'failed', completed_at = NOW(),
            processing_summary = 'No valid data rows found'
        WHERE id = ${jobId}::uuid
      `
      return new Response(JSON.stringify({
        error: 'No data to process',
        details: 'The file contains no valid data rows'
      }), { status: 400 })
    }

    // Transform data to standard format
    const standardizedData = transformToStandardFormat(parseResult.data, platformConfig as any)

    // Process data in batches
    const batchSize = 100
    let processedCount = 0
    let insertedCount = 0
    let skippedCount = 0
    const errors: string[] = []

    for (let i = 0; i < standardizedData.length; i += batchSize) {
      const batch = standardizedData.slice(i, i + batchSize)
      
      try {
        // Use Prisma's createMany for batch inserts with better type safety
        await prisma.affiliateOrder.createMany({
          data: batch.map(row => ({
            workspaceId,
            platform: row._platform,
            orderId: row.order_id,
            productId: row.product_id,
            productName: row.product_name,
            shopName: row.shop_name,
            customerId: row.customer_id,
            quantity: row.quantity,
            unitPrice: row.unit_price,
            totalAmount: row.total_amount,
            commissionRate: row.commission_rate,
            commissionAmount: row.commission_amount,
            orderStatus: row.order_status,
            orderDate: row.order_date,
            eventDate: new Date(row.order_date || new Date()),
            importJobId: jobId
          })),
          skipDuplicates: true
        })
        insertedCount += batch.length

      } catch (batchError) {
        console.error(`Batch ${i / batchSize + 1} error:`, batchError)
        errors.push(`Batch ${i / batchSize + 1}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`)
        skippedCount += batch.length
      }

      processedCount += batch.length

      // Update progress
      await prisma.$executeRaw`
        UPDATE import_jobs SET processed_rows = ${processedCount} WHERE id = ${jobId}::uuid
      `
    }

    // Determine final status
    const finalStatus = errors.length === 0 ? 'completed' : (insertedCount > 0 ? 'completed' : 'failed')
    
    const processingSummary = {
      totalRows: standardizedData.length,
      processedRows: processedCount,
      insertedRows: insertedCount,
      skippedRows: skippedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 10), // Limit error details
      completedAt: new Date().toISOString()
    }

    // Update job with final status
    await prisma.$executeRaw`
      UPDATE import_jobs 
      SET 
        status = ${finalStatus},
        processed_rows = ${processedCount},
        completed_at = NOW(),
        processing_summary = ${JSON.stringify(processingSummary)}
      WHERE id = ${jobId}::uuid
    `

    // Refresh metrics if dates provided and processing was successful
    if (dateFrom && dateTo && finalStatus === 'completed') {
      try {
        // Call platform-specific transform function
        if (job.platform === 'shopee') {
          await prisma.$queryRaw`SELECT transform_shopee_aff(${workspaceId}::uuid, ${jobId}::uuid)`
        }
        // Add similar calls for other platforms as needed

        // Refresh daily metrics
        await prisma.$queryRaw`SELECT refresh_metrics_daily(${workspaceId}::uuid, ${dateFrom}::date, ${dateTo}::date)`
      } catch (metricsError) {
        console.error('Metrics refresh error:', metricsError)
        // Don't fail the import if metrics refresh fails
      }
    }

    return new Response(JSON.stringify({
      success: true,
      jobId,
      status: finalStatus,
      summary: {
        totalRows: standardizedData.length,
        processedRows: processedCount,
        insertedRows: insertedCount,
        skippedRows: skippedCount,
        successRate: processedCount > 0 ? Math.round((insertedCount / processedCount) * 100) : 0
      },
      errors: errors.length > 0 ? errors.slice(0, 5) : [],
      message: finalStatus === 'completed' 
        ? `Successfully processed ${insertedCount} records`
        : `Processing completed with ${errors.length} errors`
    }), { status: 200 })

  } catch (error) {
    console.error('Commit error:', error)
    
    if (error instanceof Response) {
      return error
    }

    // Update job status to failed if we have jobId
    const body = await req.json().catch(() => ({}))
    if (body.jobId) {
      try {
        await prisma.$executeRaw`
          UPDATE import_jobs 
          SET status = 'failed', completed_at = NOW(),
              processing_summary = 'Processing failed due to system error'
          WHERE id = ${body.jobId}::uuid
        `
      } catch (updateError) {
        console.error('Failed to update job status:', updateError)
      }
    }

    return new Response(JSON.stringify({
      error: 'Processing failed',
      details: 'An error occurred during data processing'
    }), { status: 500 })
  }
}

/**
 * Helper function to classify and handle different types of processing errors
 */
function classifyProcessingError(error: Error, rowNumber: number = 0): {
  errorType: string
  message: string
  retryable: boolean
} {
  const errorMessage = error.message.toLowerCase()
  
  // Database constraint errors
  if (errorMessage.includes('constraint') || errorMessage.includes('unique')) {
    return {
      errorType: 'constraint_violation',
      message: error.message,
      retryable: false
    }
  }
  
  // Data type errors
  if (errorMessage.includes('invalid input') || errorMessage.includes('type')) {
    return {
      errorType: 'invalid_data_type',
      message: error.message,
      retryable: false
    }
  }
  
  // Network/connectivity errors
  if (errorMessage.includes('connection') || errorMessage.includes('network')) {
    return {
      errorType: 'network_error',
      message: error.message,
      retryable: true
    }
  }
  
  // Timeout errors
  if (errorMessage.includes('timeout') || errorMessage.includes('time out')) {
    return {
      errorType: 'timeout_error',
      message: error.message,
      retryable: true
    }
  }
  
  // Memory errors
  if (errorMessage.includes('memory') || errorMessage.includes('out of memory')) {
    return {
      errorType: 'memory_error',
      message: error.message,
      retryable: false
    }
  }
  
  // Default to processing error
  return {
    errorType: 'processing_error',
    message: error.message,
    retryable: true
  }
}
