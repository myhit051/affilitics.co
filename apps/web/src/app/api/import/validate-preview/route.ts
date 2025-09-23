/**
 * CSV Validation Preview API Endpoint
 * Provides real-time validation feedback for CSV files with preview functionality
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createCSVValidator } from '@/lib/import/csv-validator'
import { getPlatformConfig, isValidPlatform } from '@/lib/import/platform-configs'
import { detectPlatform } from '@/lib/import/platform-detection'
import { getValidationCache } from '@/lib/import/validation-cache'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/security/rate-limit'

const validatePreviewSchema = z.object({
  csvContent: z.string().min(1, 'CSV content is required'),
  platform: z.string().optional(),
  options: z.object({
    previewRows: z.number().min(1).max(1000).default(100),
    enableAutoDetection: z.boolean().default(true),
    validateBusinessRules: z.boolean().default(true),
    enableCache: z.boolean().default(true),
    strictMode: z.boolean().default(false),
    timeout: z.number().min(1000).max(60000).default(30000)
  }).default({})
})

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 30, // 30 requests per minute
      keyGenerator: (req) => req.ip || 'anonymous'
    })

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded', 
          retryAfter: rateLimitResult.retryAfter 
        },
        { status: 429 }
      )
    }

    // Authentication check
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validationResult = validatePreviewSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request parameters',
          details: validationResult.error.errors
        },
        { status: 400 }
      )
    }

    const { csvContent, platform, options } = validationResult.data

    // Validate CSV content size
    const contentSize = Buffer.byteLength(csvContent, 'utf8')
    const maxSize = 10 * 1024 * 1024 // 10MB limit for preview

    if (contentSize > maxSize) {
      return NextResponse.json(
        { 
          error: 'CSV content too large for preview',
          maxSize,
          actualSize: contentSize,
          suggestion: 'Use file upload for larger files'
        },
        { status: 413 }
      )
    }

    const validator = createCSVValidator()
    const cache = getValidationCache()
    
    let detectedPlatform = platform
    let platformDetectionResult = null

    // Platform auto-detection if not specified
    if (!platform && options.enableAutoDetection) {
      try {
        platformDetectionResult = await detectPlatform(csvContent, {
          sampleSize: Math.min(options.previewRows, 50),
          strictMode: options.strictMode
        })
        
        if (platformDetectionResult.detectedPlatform) {
          detectedPlatform = platformDetectionResult.detectedPlatform
        }
      } catch (detectionError) {
        console.warn('Platform detection failed:', detectionError)
        // Continue without platform detection
      }
    }

    // Validate platform
    if (detectedPlatform && !isValidPlatform(detectedPlatform)) {
      return NextResponse.json(
        { 
          error: 'Unsupported platform',
          platform: detectedPlatform,
          supportedPlatforms: ['shopee', 'lazada', 'tiktok']
        },
        { status: 400 }
      )
    }

    // Get platform configuration
    let platformConfig
    try {
      platformConfig = detectedPlatform 
        ? getPlatformConfig(detectedPlatform)
        : null
    } catch (configError) {
      return NextResponse.json(
        { 
          error: 'Failed to load platform configuration',
          platform: detectedPlatform
        },
        { status: 500 }
      )
    }

    if (!platformConfig) {
      return NextResponse.json(
        { 
          error: 'Platform configuration required',
          suggestion: 'Specify a platform or ensure your CSV matches a supported format',
          platformDetection: platformDetectionResult
        },
        { status: 400 }
      )
    }

    // Validation options
    const validationOptions = {
      preview: true,
      previewRows: options.previewRows,
      validateBusinessRules: options.validateBusinessRules,
      enableCache: options.enableCache,
      enableStreaming: false, // Disable for preview
      timeout: options.timeout,
      earlyExit: true,
      maxErrors: 100 // Limit errors for preview
    }

    // Perform validation
    const startTime = Date.now()
    const csvValidationResult = await validator.validateCSV(
      csvContent,
      platformConfig,
      validationOptions
    )

    const processingTime = Date.now() - startTime

    // Prepare response with enhanced metadata
    const response = {
      success: true,
      platform: detectedPlatform,
      platformDetection: platformDetectionResult,
      validation: {
        ...csvValidationResult,
        processingTime,
        preview: true,
        previewRows: options.previewRows,
        totalRowsInFile: csvValidationResult.summary.totalRows
      },
      metadata: {
        fileSize: contentSize,
        processingTime,
        cacheHit: false, // TODO: implement cache hit detection
        validationVersion: '2.0.0'
      },
      recommendations: generateRecommendations(csvValidationResult, platformDetectionResult)
    }

    // Cache the result if enabled
    if (options.enableCache && csvValidationResult.errors.length < 50) {
      try {
        const cacheKey = cache.generateCacheKey(
          csvContent,
          detectedPlatform || 'unknown',
          validationOptions
        )
        await cache.set(cacheKey, csvValidationResult, {
          ttl: 15 * 60 * 1000, // 15 minutes for preview
          tags: ['preview', detectedPlatform || 'unknown'],
          metadata: { userId: user.id, timestamp: Date.now() }
        })
      } catch (cacheError) {
        console.warn('Failed to cache validation result:', cacheError)
        // Continue without caching
      }
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Validation preview error:', error)
    
    return NextResponse.json(
      { 
        error: 'Internal server error during validation',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

/**
 * Generate recommendations based on validation results
 */
function generateRecommendations(
  csvValidationResult: any,
  platformDetection: any
): string[] {
  const recommendations: string[] = []
  
  const { errors, warnings, summary } = csvValidationResult
  
  // Error-based recommendations
  if (errors.length > 0) {
    const errorTypes = Object.keys(summary.errorsByType || {})
    
    if (errorTypes.includes('missing')) {
      recommendations.push('Add missing required fields before importing')
    }
    
    if (errorTypes.includes('invalid_format')) {
      recommendations.push('Check data formats (dates, numbers, currencies)')
    }
    
    if (errorTypes.includes('duplicate')) {
      recommendations.push('Remove or resolve duplicate records')
    }
    
    if (errorTypes.includes('business_rule')) {
      recommendations.push('Review business rule violations (commission rates, date ranges)')
    }
  }
  
  // Platform detection recommendations
  if (platformDetection && platformDetection.confidence < 0.8) {
    recommendations.push('Low platform confidence - verify CSV format matches expected platform')
  }
  
  // Performance recommendations
  if (summary.totalRows > 1000) {
    recommendations.push('Consider processing large files in smaller batches')
  }
  
  // Data quality recommendations
  const errorRate = summary.totalRows > 0 ? errors.length / summary.totalRows : 0
  if (errorRate > 0.1) {
    recommendations.push('High error rate detected - review data quality before import')
  }
  
  if (warnings.length > errors.length * 2) {
    recommendations.push('Many warnings found - review data for potential issues')
  }
  
  return recommendations
}

/**
 * Handle OPTIONS request for CORS
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}