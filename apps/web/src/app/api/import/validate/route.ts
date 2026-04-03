import { NextRequest } from 'next/server'
import { withWorkspaceValidation } from '@/lib/auth/workspace-middleware'
import { prisma } from '@aff/db'
import { createServiceClient } from '@/lib/supabase/server'
import { getPlatformConfig } from '@/lib/import/platform-configs'
import { createCSVValidator } from '@/lib/import/csv-validator'
import { detectPlatform, PlatformDetectionUtils } from '@/lib/import/platform-detection'
import { getValidationCache } from '@/lib/import/validation-cache'
import { verifyCSRFEnhanced, CSRFError, logCSRFEvent } from '@/lib/security/csrf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withWorkspaceValidation(
  async (req: NextRequest, context) => {
    const { workspaceId, user } = context
    
    // Security: CSRF Protection for validation endpoint
    try {
      await verifyCSRFEnhanced(req, user.id, {
        enableOriginValidation: true,
        enableRateLimit: true,
        enableDoubleSubmit: false
      })
    } catch (error) {
      if (error instanceof CSRFError) {
        logCSRFEvent('VALIDATE_CSRF_FAILED', {
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
    
    try {
      const body = await req.json()
      const { jobId, preview = false } = body

    if (!jobId) {
      return new Response(JSON.stringify({
        error: 'Missing job ID',
        details: 'Job ID is required for validation'
      }), { status: 400 })
    }

    // Get import job details using Prisma
    const job = await prisma.importJob.findFirst({
      where: {
        id: jobId,
        workspaceId
      },
      select: {
        id: true,
        workspaceId: true,
        platform: true,
        filename: true,
        size: true,
        status: true,
        hash: true,
        // validationResult: true,
        // validationSummary: true
      }
    })
    
    if (!job) {
      return new Response(JSON.stringify({
        error: 'Import job not found',
        details: 'The specified import job does not exist or does not belong to your workspace'
      }), { status: 404 })
    }

    // Check if already validated
    if (job.status === 'validated' || job.status === 'processing' || job.status === 'completed') {
      if ((job as any).validationResult) {
        return new Response(JSON.stringify({
          success: true,
          cached: true,
          ...(job as any).validationResult,
          summary: (job as any).validationSummary
        }), { status: 200 })
      }
    }

    // Download file from storage
    const supa = createServiceClient()
    const bucket = process.env.SUPABASE_STORAGE_BUCKET!
    
    if (!(job as any).storagePath) {
      return new Response(JSON.stringify({
        error: 'Storage path not found',
        details: 'File storage path is missing from the job record'
      }), { status: 500 })
    }
    
    const { data: fileData, error: downloadError } = await supa
      .storage.from(bucket)
      .download((job as any).storagePath)

    if (downloadError || !fileData) {
      console.error('File download error:', downloadError)
      return new Response(JSON.stringify({
        error: 'File not accessible',
        details: 'Could not retrieve the uploaded file for validation'
      }), { status: 500 })
    }

    // Convert blob to text
    const csvContent = await fileData.text()
    
    if (!csvContent || csvContent.trim().length === 0) {
      return new Response(JSON.stringify({
        error: 'Empty file content',
        details: 'The uploaded file appears to be empty'
      }), { status: 400 })
    }

    // Auto-detect platform if not specified or for validation
    let detectedPlatform = job.platform
    let platformDetection = null
    
    if (preview || !job.platform) {
      const detection = await detectPlatform(csvContent, {
        sampleSize: 50,
        strictMode: false
      })
      
      platformDetection = {
        detected: detection.detectedPlatform,
        confidence: detection.confidence,
        suggestions: detection.suggestions,
        analysis: detection.analysis
      }
      
      // Use detected platform if confidence is high enough
      if (detection.detectedPlatform && PlatformDetectionUtils.isDetectionReliable(detection)) {
        detectedPlatform = detection.detectedPlatform
      }
    }

    // Get platform configuration
    const platformConfig = getPlatformConfig(detectedPlatform || 'shopee')

    // Get existing data for duplicate detection using Prisma
    const existingData = await prisma.affiliateOrder.findMany({
      where: {
        workspaceId,
        platform: detectedPlatform
      },
      select: {
        orderId: true,
        // productId: true,
        // commissionAmount: true,
        // orderDate: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10000
    })

    // Create enhanced CSV validator
    const validator = createCSVValidator()
    const cache = getValidationCache()
    
    // Check cache first
    const cacheKey = cache.generateCacheKey(
      csvContent,
      detectedPlatform || 'unknown',
      {
        preview,
        enableStreaming: false,
        validateBusinessRules: true
      },
      { jobId, workspaceId }
    )
    
    let parseResult = await cache.get(cacheKey)
    
    if (!parseResult) {
      // Parse and validate CSV with enhanced validator
      parseResult = await validator.validateCSV(csvContent, platformConfig, {
        enableStreaming: false, // Use in-memory for API validation
        preview,
        previewRows: preview ? 100 : undefined,
        maxErrors: 1000,
        existingData,
        validateBusinessRules: true,
        enableCache: true
      })
      
      // Cache the result
      await cache.set(cacheKey, parseResult, {
        ttl: 30 * 60 * 1000, // 30 minutes
        tags: [detectedPlatform || 'unknown', 'validation'],
        metadata: { jobId, workspaceId, preview }
      })
    }

    // Generate enhanced validation report
    const validationReport = {
      isValid: parseResult.errors.filter((e: any) => e.severity === 'error').length === 0,
      criticalErrors: parseResult.errors.filter((e: any) => e.severity === 'error'),
      warnings: parseResult.warnings || parseResult.errors.filter((e: any) => e.severity === 'warning'),
      summary: `Processed ${parseResult.summary.totalRows} rows. ${parseResult.summary.validRows} valid, ${parseResult.summary.invalidRows} invalid.`,
      stats: {
        processingTime: parseResult.summary.processingTime,
        throughput: parseResult.summary.throughput,
        memoryUsage: parseResult.summary.memoryUsage,
        errorsByType: parseResult.summary.errorsByType
      }
    }

    // Update job status and store validation results using Prisma
    const jobUpdate = {
      status: validationReport.isValid ? 'validated' : 'validation_failed',
      platform: detectedPlatform, // Update platform if auto-detected
      validationResult: {
        headers: parseResult.headers,
        errors: parseResult.errors,
        warnings: parseResult.warnings || [],
        summary: parseResult.summary,
        sampleData: preview ? parseResult.data.slice(0, 5) : [],
        platformDetection,
        validationHash: parseResult.validationHash,
        stats: validationReport.stats
      },
      validationSummary: validationReport.summary,
      totalRows: parseResult.summary.totalRows,
      validRows: parseResult.summary.validRows,
      errorCount: validationReport.criticalErrors.length,
      warningCount: validationReport.warnings.length,
      validatedAt: new Date()
    }

    await prisma.importJob.update({
      where: { id: jobId },
      data: jobUpdate
    })

    // Store detailed errors and warnings if any
    const allIssues = [...validationReport.criticalErrors, ...validationReport.warnings]
    
    if (allIssues.length > 0) {
      const errorInserts = allIssues.map(issue => ({
        jobId,
        workspaceId,
        rowNumber: issue.row,
        columnName: issue.column || null,
        fieldName: issue.field || null,
        errorType: issue.type,
        errorMessage: issue.message,
        fieldValue: issue.value ? String(issue.value) : null,
        severity: issue.severity || 'error',
        suggestion: issue.suggestion || null,
        context: issue.context ? JSON.stringify(issue.context) : null
      }))

      // Insert errors in batches using Prisma
      for (let i = 0; i < errorInserts.length; i += 100) {
        const batch = errorInserts.slice(i, i + 100)
        await prisma.importError.createMany({
          data: batch as any,
          skipDuplicates: true
        })
      }
    }

    const response = {
      success: true,
      jobId,
      isValid: validationReport.isValid,
      platform: detectedPlatform,
      originalPlatform: job.platform,
      filename: job.filename,
      headers: parseResult.headers,
      summary: parseResult.summary,
      validationSummary: validationReport.summary,
      criticalErrors: validationReport.criticalErrors,
      warnings: validationReport.warnings,
      canProceed: validationReport.isValid,
      sampleData: preview ? parseResult.data.slice(0, 5) : [],
      requiredHeaders: platformConfig.requiredHeaders,
      optionalHeaders: platformConfig.optionalHeaders || [],
      
      // Enhanced validation data
      platformDetection,
      stats: validationReport.stats,
      validationHash: parseResult.validationHash,
      cached: !!await cache.get(cacheKey),
      
      // Error categorization
      errorBreakdown: {
        byType: validationReport.stats.errorsByType,
        bySeverity: {
          errors: validationReport.criticalErrors.length,
          warnings: validationReport.warnings.length,
          info: allIssues.filter((i: any) => i.severity === 'info').length
        },
        byCategory: {}
      },
      
      // Suggestions for improvement
      suggestions: [],
      
      // Quality metrics
      quality: {
        structureScore: platformDetection?.analysis?.structureScore || 0,
        dataQualityScore: platformDetection?.analysis?.dataQualityScore || 0,
        completenessRatio: parseResult.summary.validRows / parseResult.summary.totalRows,
        duplicateRatio: parseResult.summary.duplicateRows / parseResult.summary.totalRows
      }
    }

    // Execute helper functions to populate response data
    const categorizeIssues = (issues: any[]) => {
      return issues.reduce((acc: any, issue) => {
        const category = getIssueCategory(issue)
        acc[category] = (acc[category] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    }

    const getIssueCategory = (issue: any) => {
      if (issue.field && issue.field.toLowerCase().includes('commission')) return 'commission'
      if (issue.field && (issue.field.toLowerCase().includes('date') || issue.field.toLowerCase().includes('time'))) return 'dates'
      if (issue.type === 'duplicate') return 'duplicates'
      if (issue.type === 'missing') return 'missing_data'
      if (issue.type === 'invalid_format') return 'format'
      return 'other'
    }

    const generateImprovementSuggestions = (parseResult: any, platformDetection: any) => {
      const suggestions = []
      
      if (platformDetection && platformDetection.confidence < 0.8) {
        suggestions.push({
          type: 'platform_detection',
          message: 'Platform detection confidence is low',
          action: 'Verify that your CSV follows the expected format for ' + (detectedPlatform || 'the selected platform')
        })
      }
      
      if (parseResult.summary.duplicateRows > 0) {
        suggestions.push({
          type: 'duplicates',
          message: `Found ${parseResult.summary.duplicateRows} duplicate records`,
          action: 'Remove duplicate entries before importing to avoid data conflicts'
        })
      }
      
      const errorRate = parseResult.errors.length / parseResult.summary.totalRows
      if (errorRate > 0.1) {
        suggestions.push({
          type: 'data_quality',
          message: `High error rate (${(errorRate * 100).toFixed(1)}%)`,
          action: 'Review and fix data quality issues before proceeding with import'
        })
      }
      
      return suggestions
    }

    // Update response with calculated values
    response.errorBreakdown.byCategory = categorizeIssues(allIssues)
    (response as any).suggestions = generateImprovementSuggestions(parseResult, platformDetection)

    return new Response(JSON.stringify(response), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Validation error:', error)
    
    if (error instanceof Response) {
      return error // Re-throw auth errors
    }

    return new Response(JSON.stringify({
      error: 'Validation failed',
      details: 'An error occurred during file validation'
    }), { status: 500 })
    }
  },
  {
    logAction: 'import_validation_request',
    requirePermissions: ['import_files']
  }
)

export const GET = withWorkspaceValidation(
  async (req: NextRequest, context) => {
    try {
      const { workspaceId } = context
      const { searchParams } = new URL(req.url)
      const jobId = searchParams.get('jobId')

    if (!jobId) {
      return new Response(JSON.stringify({
        error: 'Missing job ID',
        details: 'Job ID is required'
      }), { status: 400 })
    }

    // Get validation results using Prisma
    const job = await prisma.importJob.findFirst({
      where: {
        id: jobId,
        workspaceId
      },
      select: {
        id: true,
        platform: true,
        filename: true,
        // originalFilename: true,
        status: true,
        // validationResult: true,
        // validationSummary: true,
        // totalRows: true,
        // validRows: true,
        // errorCount: true,
        // validatedAt: true
      }
    })
    
    if (!job) {
      return new Response(JSON.stringify({
        error: 'Import job not found'
      }), { status: 404 })
    }

    if (!(job as any).validationResult) {
      return new Response(JSON.stringify({
        error: 'Validation not completed',
        details: 'File has not been validated yet'
      }), { status: 400 })
    }

    const validationData = (job as any).validationResult

    return new Response(JSON.stringify({
      success: true,
      jobId: job.id,
      platform: job.platform,
      filename: job.filename,
      status: job.status,
      totalRows: (job as any).totalRows,
      validRows: (job as any).validRows,
      errorCount: (job as any).errorCount,
      validatedAt: (job as any).validatedAt,
      summary: (job as any).validationSummary,
      headers: validationData.headers,
      errors: validationData.errors,
      sampleData: validationData.sampleData || []
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Get validation error:', error)
    
    if (error instanceof Response) {
      return error
    }

    return new Response(JSON.stringify({
      error: 'Failed to retrieve validation results'
    }), { status: 500 })
    }
  },
  {
    logAction: 'import_validation_get',
    requirePermissions: ['read_data']
  }
)