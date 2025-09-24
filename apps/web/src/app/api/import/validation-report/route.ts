/**
 * Comprehensive CSV Validation Report API
 * Generates detailed validation reports with analytics and suggestions
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createCSVValidator } from '@/lib/import/csv-validator'
import { getPlatformConfig, getPlatformValidationSummary } from '@/lib/import/platform-configs'
import { detectPlatform, PlatformDetectionUtils } from '@/lib/import/platform-detection'
import { getBusinessRuleCategories } from '@/lib/import/business-rules'
import { createClient } from '@/lib/supabase/server'

const validationReportSchema = z.object({
  csvContent: z.string().min(1, 'CSV content is required'),
  platform: z.string().optional(),
  options: z.object({
    includeBusinessRules: z.boolean().default(true),
    includeDataQuality: z.boolean().default(true),
    includePlatformAnalysis: z.boolean().default(true),
    includeRecommendations: z.boolean().default(true),
    detailedErrors: z.boolean().default(true),
    maxRows: z.number().min(10).max(10000).default(1000),
    reportFormat: z.enum(['json', 'summary']).default('json')
  }).default({})
})

export async function POST(request: NextRequest) {
  try {
    // Authentication
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Parse request
    const body = await request.json()
    const validationResult = validationReportSchema.safeParse(body)

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
    const startTime = Date.now()

    // Content size validation
    const contentSize = Buffer.byteLength(csvContent, 'utf8')
    const maxSize = 50 * 1024 * 1024 // 50MB limit

    if (contentSize > maxSize) {
      return NextResponse.json(
        { 
          error: 'CSV content too large for analysis',
          maxSize,
          actualSize: contentSize
        },
        { status: 413 }
      )
    }

    const validator = createCSVValidator()
    
    // Platform detection and analysis
    let detectedPlatform = platform
    let platformDetectionResult = null
    let platformAnalysis = null

    if (options.includePlatformAnalysis) {
      try {
        platformDetectionResult = await detectPlatform(csvContent, {
          sampleSize: 100,
          strictMode: false
        } as any)
        
        if (!platform && platformDetectionResult.detectedPlatform) {
          detectedPlatform = platformDetectionResult.detectedPlatform
        }

        platformAnalysis = {
          detection: platformDetectionResult,
          summary: PlatformDetectionUtils.formatDetectionSummary(platformDetectionResult),
          isReliable: PlatformDetectionUtils.isDetectionReliable(platformDetectionResult)
        }
      } catch (error) {
        console.warn('Platform analysis failed:', error)
      }
    }

    // Get platform configuration
    let platformConfig = null
    let platformSummary = null

    if (detectedPlatform) {
      try {
        platformConfig = getPlatformConfig(detectedPlatform)
        platformSummary = getPlatformValidationSummary(detectedPlatform)
      } catch (error) {
        console.warn('Failed to load platform config:', error)
      }
    }

    // Perform validation
    const validationOptions = {
      preview: false,
      validateBusinessRules: options.includeBusinessRules,
      enableStreaming: contentSize > 5 * 1024 * 1024, // Use streaming for files > 5MB
      maxErrors: 1000,
      earlyExit: false,
      timeout: 120000 // 2 minutes
    }

    let csvValidationResult = null
    if (platformConfig) {
      csvValidationResult = await validator.validateCSV(
        csvContent,
        platformConfig,
        validationOptions
      )
    }

    // Data quality analysis
    let dataQualityAnalysis = null
    if (options.includeDataQuality && csvValidationResult) {
      dataQualityAnalysis = analyzeDataQuality(csvValidationResult)
    }

    // Business rules analysis
    let businessRulesAnalysis = null
    if (options.includeBusinessRules && detectedPlatform) {
      businessRulesAnalysis = analyzeBusinessRules(csvValidationResult, detectedPlatform)
    }

    // Generate recommendations
    let recommendations = null
    if (options.includeRecommendations) {
      recommendations = generateComprehensiveRecommendations({
        validation: csvValidationResult,
        platform: platformAnalysis,
        dataQuality: dataQualityAnalysis,
        businessRules: businessRulesAnalysis
      })
    }

    const processingTime = Date.now() - startTime

    // Build report
    const report = {
      metadata: {
        reportId: generateReportId(),
        timestamp: new Date().toISOString(),
        userId: user.id,
        processingTime,
        contentSize,
        reportVersion: '2.0.0'
      },
      platform: {
        detected: detectedPlatform,
        specified: platform,
        analysis: platformAnalysis,
        summary: platformSummary
      },
      validation: csvValidationResult ? {
        summary: csvValidationResult.summary,
        errors: options.detailedErrors ? csvValidationResult.errors : csvValidationResult.errors.slice(0, 20),
        warnings: options.detailedErrors ? csvValidationResult.warnings : csvValidationResult.warnings.slice(0, 20),
        errorSummary: summarizeErrors(csvValidationResult.errors),
        warningSummary: summarizeErrors(csvValidationResult.warnings)
      } : null,
      dataQuality: dataQualityAnalysis,
      businessRules: businessRulesAnalysis,
      recommendations,
      actions: generateActionItems(csvValidationResult, recommendations)
    }

    // Return summary format if requested
    if (options.reportFormat === 'summary') {
      return NextResponse.json(generateSummaryReport(report))
    }

    return NextResponse.json(report)

  } catch (error) {
    console.error('Validation report error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to generate validation report',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Analyze data quality metrics
 */
function analyzeDataQuality(validationResult: any) {
  const { data, errors, warnings, summary } = validationResult
  
  if (!data || data.length === 0) {
    return {
      score: 0,
      issues: ['No data to analyze'],
      metrics: {}
    }
  }

  const totalFields = data.length * Object.keys(data[0]).length
  const filledFields = data.reduce((count: number, row: any) => {
    return count + Object.values(row).filter((value: any) => 
      value !== null && value !== undefined && String(value).trim() !== ''
    ).length
  }, 0)

  const completenessRatio = totalFields > 0 ? filledFields / totalFields : 0
  const errorRate = summary.totalRows > 0 ? errors.length / summary.totalRows : 0
  const warningRate = summary.totalRows > 0 ? warnings.length / summary.totalRows : 0

  // Calculate data quality score (0-100)
  let score = 100
  score -= errorRate * 50 // Reduce score by error rate
  score -= warningRate * 20 // Reduce score by warning rate
  score -= (1 - completenessRatio) * 30 // Reduce score by incomplete data
  score = Math.max(0, Math.round(score))

  const issues: string[] = []
  if (completenessRatio < 0.8) issues.push('High rate of missing data')
  if (errorRate > 0.1) issues.push('High error rate')
  if (warningRate > 0.2) issues.push('Many data quality warnings')

  // Analyze data consistency
  const consistencyMetrics = analyzeDataConsistency(data)

  return {
    score,
    grade: getQualityGrade(score),
    issues,
    metrics: {
      completeness: Math.round(completenessRatio * 100),
      errorRate: Math.round(errorRate * 100),
      warningRate: Math.round(warningRate * 100),
      consistency: consistencyMetrics,
      totalRows: summary.totalRows,
      validRows: summary.validRows
    },
    recommendations: getDataQualityRecommendations(score, issues)
  }
}

/**
 * Analyze business rules compliance
 */
function analyzeBusinessRules(validationResult: any, platform: string) {
  if (!validationResult) return null

  const businessRuleCategories = getBusinessRuleCategories()
  const { errors } = validationResult

  const businessRuleErrors = errors.filter((error: any) => error.type === 'business_rule')
  const businessRuleViolations = categorizeBusinessRuleViolations(businessRuleErrors)

  return {
    totalViolations: businessRuleErrors.length,
    categories: businessRuleViolations,
    compliance: {
      commission: calculateComplianceRate(businessRuleErrors, 'commission'),
      dates: calculateComplianceRate(businessRuleErrors, 'date'),
      products: calculateComplianceRate(businessRuleErrors, 'product'),
      currency: calculateComplianceRate(businessRuleErrors, 'currency')
    },
    recommendations: getBusinessRuleRecommendations(businessRuleViolations, platform)
  }
}

/**
 * Generate comprehensive recommendations
 */
function generateComprehensiveRecommendations(analysis: any): any {
  const recommendations = {
    priority: [] as any[],
    dataQuality: [] as any[],
    platform: [] as any[],
    businessRules: [] as any[],
    performance: [] as any[]
  }

  // Priority recommendations (critical issues)
  if (analysis.validation?.errors?.length > 0) {
    const criticalErrors = analysis.validation.errors.filter((e: any) => e.severity === 'error')
    if (criticalErrors.length > 0) {
      recommendations.priority.push({
        type: 'critical',
        message: `Fix ${criticalErrors.length} critical errors before importing`,
        action: 'Review and correct data validation errors',
        impact: 'high'
      })
    }
  }

  // Platform recommendations
  if (analysis.platform?.analysis?.isReliable === false) {
    recommendations.platform.push({
      type: 'platform_detection',
      message: 'Platform detection confidence is low',
      action: 'Manually verify platform or adjust CSV format',
      impact: 'medium'
    })
  }

  // Data quality recommendations
  if (analysis.dataQuality?.score < 70) {
    recommendations.dataQuality.push({
      type: 'data_quality',
      message: `Data quality score is ${analysis.dataQuality.score}/100`,
      action: 'Improve data completeness and consistency',
      impact: 'medium'
    })
  }

  return recommendations
}

/**
 * Generate actionable items
 */
function generateActionItems(validationResult: any, recommendations: any): any[] {
  const actions: any[] = []

  if (validationResult?.errors?.length > 0) {
    actions.push({
      id: 'fix-errors',
      title: 'Fix Validation Errors',
      description: `Resolve ${validationResult.errors.length} validation errors`,
      priority: 'high',
      estimatedTime: Math.ceil(validationResult.errors.length / 10) + ' minutes',
      steps: [
        'Review error details in the validation report',
        'Correct data format issues',
        'Verify required fields are populated',
        'Re-validate the file'
      ]
    })
  }

  if (recommendations?.priority?.length > 0) {
    actions.push({
      id: 'address-critical',
      title: 'Address Critical Issues',
      description: 'Handle high-priority recommendations',
      priority: 'high',
      estimatedTime: '15-30 minutes',
      steps: recommendations.priority.map((r: any) => r.action)
    })
  }

  return actions
}

/**
 * Helper functions
 */
function generateReportId(): string {
  return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function getQualityGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

function analyzeDataConsistency(data: any[]): any {
  if (!data || data.length === 0) return {}

  const headers = Object.keys(data[0])
  const typeConsistency = {}

  headers.forEach(header => {
    const values = data.map((row: any) => row[header]).filter((v: any) => v != null)
    const typeArray: string[] = values.map((v: any) => typeof v)
    const uniqueTypes: string[] = []
    for (const type of typeArray) {
      if (!uniqueTypes.includes(type)) {
        uniqueTypes.push(type)
      }
    }
    (typeConsistency as any)[header] = {
      consistent: uniqueTypes.length === 1,
      types: uniqueTypes,
      fillRate: values.length / data.length
    }
  })

  return {
    fieldConsistency: typeConsistency,
    overallConsistency: Object.values(typeConsistency).filter((c: any) => c.consistent).length / headers.length
  }
}

function summarizeErrors(errors: any[]): any {
  const summary: any = {}
  errors.forEach(error => {
    summary[error.type] = (summary[error.type] || 0) + 1
  })
  return summary
}

function categorizeBusinessRuleViolations(errors: any[]): any {
  return errors.reduce((categories: any, error) => {
    const category = error.field?.toLowerCase().includes('commission') ? 'commission' :
                   error.field?.toLowerCase().includes('date') ? 'date' :
                   error.field?.toLowerCase().includes('status') ? 'status' : 'other'
    categories[category] = (categories[category] || 0) + 1
    return categories
  }, {})
}

function calculateComplianceRate(errors: any[], category: string): number {
  const categoryErrors = errors.filter((e: any) => 
    e.field?.toLowerCase().includes(category) || 
    e.message?.toLowerCase().includes(category)
  )
  return categoryErrors.length
}

function getDataQualityRecommendations(score: number, issues: string[]): string[] {
  const recommendations = []
  
  if (score < 70) {
    recommendations.push('Improve overall data quality before importing')
  }
  
  if (issues.includes('High rate of missing data')) {
    recommendations.push('Fill in missing required fields')
  }
  
  if (issues.includes('High error rate')) {
    recommendations.push('Review and correct data format errors')
  }
  
  return recommendations
}

function getBusinessRuleRecommendations(violations: any, platform: string): string[] {
  const recommendations = []
  
  if (violations.commission > 0) {
    recommendations.push(`Review commission rates for ${platform} compliance`)
  }
  
  if (violations.date > 0) {
    recommendations.push('Verify date formats and ranges')
  }
  
  return recommendations
}

function generateSummaryReport(fullReport: any): any {
  return {
    reportId: fullReport.metadata.reportId,
    timestamp: fullReport.metadata.timestamp,
    platform: fullReport.platform.detected,
    summary: {
      dataQuality: fullReport.dataQuality?.score || 0,
      totalErrors: fullReport.validation?.summary?.invalidRows || 0,
      totalWarnings: fullReport.validation?.warnings?.length || 0,
      recommendation: fullReport.dataQuality?.score > 80 ? 'Ready for import' : 'Needs improvement'
    },
    topIssues: fullReport.validation?.errors?.slice(0, 5) || [],
    nextSteps: fullReport.actions?.slice(0, 3) || []
  }
}

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