import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@aff/db'
import { createImportErrorService } from '@aff/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Get comprehensive error analytics and insights
 */
export async function GET(req: NextRequest) {
  const errorService = createImportErrorService(prisma)
  const startTime = Date.now()
  
  try {
    const { workspaceId } = await getAuthContext()
    const { searchParams } = new URL(req.url)
    
    // Parse query parameters
    const days = Math.min(Math.max(1, parseInt(searchParams.get('days') || '30')), 365)
    const platform = searchParams.get('platform')
    const includeResolved = searchParams.get('includeResolved') !== 'false'
    const groupBy = (searchParams.get('groupBy') || 'day') as 'day' | 'week' | 'month'
    const jobId = searchParams.get('jobId') // Optional: analytics for specific job
    
    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - days)

    // Base query conditions
    const _baseConditions = {
      workspace: workspaceId,
      since: sinceDate,
      platform,
      includeResolved,
      jobId
    }

    // Get basic analytics from the service
    const basicAnalytics = await errorService.getErrorAnalytics(workspaceId, days)

    // Get detailed error trends with enhanced grouping
    const trendQuery = `
      SELECT 
        ${groupBy === 'day' ? 'DATE(ie.created_at)' :
          groupBy === 'week' ? 'DATE_TRUNC(\'week\', ie.created_at)' :
          'DATE_TRUNC(\'month\', ie.created_at)'} as period,
        ie.severity,
        ie.category,
        ie.error_type,
        COUNT(*) as count,
        COUNT(DISTINCT ie.job_id) as affected_jobs,
        COUNT(*) FILTER (WHERE ie.resolved_at IS NOT NULL) as resolved_count,
        COUNT(*) FILTER (WHERE ie.dismissed) as dismissed_count,
        COUNT(*) FILTER (WHERE ie.retry_count > 0) as retried_count,
        AVG(ie.retry_count) as avg_retry_count
      FROM import_errors ie
      JOIN import_jobs ij ON ie.job_id = ij.id
      WHERE ij.workspace_id = $1::uuid
        AND ie.created_at >= $2
        ${platform ? 'AND ij.platform = $3' : ''}
        ${jobId ? `AND ie.job_id = ${jobId ? '$' + (platform ? '4' : '3') : ''}::uuid` : ''}
        ${!includeResolved ? 'AND ie.resolved_at IS NULL' : ''}
      GROUP BY period, ie.severity, ie.category, ie.error_type
      ORDER BY period DESC, count DESC
    `

    const trendParams = [workspaceId, sinceDate, platform, jobId].filter(Boolean)
    const trends = await prisma.$queryRawUnsafe(trendQuery, ...trendParams)

    // Get error hotspots (files with most errors)
    const hotspotsQuery = `
      SELECT 
        ij.id as job_id,
        ij.filename,
        ij.original_filename,
        ij.platform,
        ij.created_at as job_created_at,
        COUNT(ie.id) as total_errors,
        COUNT(DISTINCT ie.error_type) as error_types,
        COUNT(*) FILTER (WHERE ie.severity = 'critical') as critical_errors,
        COUNT(*) FILTER (WHERE ie.resolved_at IS NOT NULL) as resolved_errors,
        MAX(ie.created_at) as last_error_at,
        AVG(ie.retry_count) as avg_retry_count
      FROM import_jobs ij
      LEFT JOIN import_errors ie ON ij.id = ie.job_id
      WHERE ij.workspace_id = $1::uuid
        AND ij.created_at >= $2
        ${platform ? 'AND ij.platform = $3' : ''}
        ${!includeResolved ? 'AND (ie.resolved_at IS NULL OR ie.id IS NULL)' : ''}
      GROUP BY ij.id, ij.filename, ij.original_filename, ij.platform, ij.created_at
      HAVING COUNT(ie.id) > 0
      ORDER BY total_errors DESC, critical_errors DESC
      LIMIT 20
    `

    const hotspotsParams = [workspaceId, sinceDate, platform].filter(Boolean)
    const hotspots = await prisma.$queryRawUnsafe(hotspotsQuery, ...hotspotsParams)

    // Get error patterns (common combinations)
    const patternsQuery = `
      WITH error_combinations AS (
        SELECT 
          ie.job_id,
          ie.error_type,
          ie.severity,
          ie.category,
          COUNT(*) as error_count,
          ARRAY_AGG(DISTINCT ie.row_no ORDER BY ie.row_no) as affected_rows
        FROM import_errors ie
        JOIN import_jobs ij ON ie.job_id = ij.id
        WHERE ij.workspace_id = $1::uuid
          AND ie.created_at >= $2
          ${platform ? 'AND ij.platform = $3' : ''}
          ${!includeResolved ? 'AND ie.resolved_at IS NULL' : ''}
        GROUP BY ie.job_id, ie.error_type, ie.severity, ie.category
        HAVING COUNT(*) >= 2
      )
      SELECT 
        error_type,
        severity,
        category,
        COUNT(DISTINCT job_id) as jobs_affected,
        SUM(error_count) as total_occurrences,
        AVG(error_count) as avg_per_job,
        COUNT(DISTINCT job_id) * 1.0 / (
          SELECT COUNT(DISTINCT job_id) 
          FROM import_errors ie2 
          JOIN import_jobs ij2 ON ie2.job_id = ij2.id 
          WHERE ij2.workspace_id = $1::uuid AND ie2.created_at >= $2
        ) * 100 as occurrence_rate
      FROM error_combinations
      GROUP BY error_type, severity, category
      ORDER BY occurrence_rate DESC, total_occurrences DESC
      LIMIT 15
    `

    const patternsParams = [workspaceId, sinceDate, platform].filter(Boolean)
    const patterns = await prisma.$queryRawUnsafe(patternsQuery, ...patternsParams)

    // Get resolution insights
    const resolutionQuery = `
      SELECT 
        ie.error_type,
        ie.recovery_strategy,
        COUNT(*) as total_errors,
        COUNT(*) FILTER (WHERE ie.resolved_at IS NOT NULL) as resolved_errors,
        COUNT(*) FILTER (WHERE ie.dismissed) as dismissed_errors,
        COUNT(*) FILTER (WHERE ie.retry_count > 0) as retried_errors,
        AVG(EXTRACT(EPOCH FROM (ie.resolved_at - ie.created_at))/3600) 
          FILTER (WHERE ie.resolved_at IS NOT NULL) as avg_resolution_hours,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ie.retry_count) as median_retries
      FROM import_errors ie
      JOIN import_jobs ij ON ie.job_id = ij.id
      WHERE ij.workspace_id = $1::uuid
        AND ie.created_at >= $2
        ${platform ? 'AND ij.platform = $3' : ''}
      GROUP BY ie.error_type, ie.recovery_strategy
      ORDER BY total_errors DESC
    `

    const resolutionParams = [workspaceId, sinceDate, platform].filter(Boolean)
    const resolutionInsights = await prisma.$queryRawUnsafe(resolutionQuery, ...resolutionParams)

    // Get performance metrics
    const performanceQuery = `
      SELECT 
        DATE_TRUNC('${groupBy}', ij.created_at) as period,
        COUNT(DISTINCT ij.id) as total_jobs,
        COUNT(DISTINCT ij.id) FILTER (WHERE ij.status = 'completed') as successful_jobs,
        COUNT(DISTINCT ij.id) FILTER (WHERE ij.status = 'failed') as failed_jobs,
        COUNT(DISTINCT ij.id) FILTER (WHERE ij.error_count > 0) as jobs_with_errors,
        AVG(ij.error_count) as avg_errors_per_job,
        SUM(ij.processed_rows) as total_rows_processed,
        AVG(ij.retry_count) as avg_retries_per_job,
        AVG(EXTRACT(EPOCH FROM (ij.completed_at - ij.started_at))/60) 
          FILTER (WHERE ij.completed_at IS NOT NULL AND ij.started_at IS NOT NULL) as avg_processing_minutes
      FROM import_jobs ij
      WHERE ij.workspace_id = $1::uuid
        AND ij.created_at >= $2
        ${platform ? 'AND ij.platform = $3' : ''}
      GROUP BY period
      ORDER BY period DESC
    `

    const performanceParams = [workspaceId, sinceDate, platform].filter(Boolean)
    const performanceMetrics = await prisma.$queryRawUnsafe(performanceQuery, ...performanceParams)

    // Calculate insights and recommendations
    const insights = {
      dataQuality: {
        score: 0,
        factors: [] as string[],
        recommendations: [] as string[]
      },
      reliability: {
        score: 0,
        factors: [] as string[],
        recommendations: [] as string[]
      },
      efficiency: {
        score: 0,
        factors: [] as string[],
        recommendations: [] as string[]
      }
    }

    // Calculate data quality score
    const totalErrors = (trends as any[]).reduce((sum: any, t) => sum + Number(t.count), 0)
    const totalJobs = (performanceMetrics as any[]).reduce((sum: any, p) => sum + Number(p.total_jobs), 0)
    const criticalErrorRate = (trends as any[]).filter((t: any) => t.severity === 'critical').reduce((sum: any, t) => sum + Number(t.count), 0) / Math.max(totalErrors, 1)
    
    insights.dataQuality.score = Math.max(0, Math.min(100, 100 - (totalErrors / Math.max(totalJobs, 1)) * 10 - criticalErrorRate * 50))
    
    if (criticalErrorRate > 0.1) {
      insights.dataQuality.factors.push(`${Math.round(criticalErrorRate * 100)}% of errors are critical`)
      insights.dataQuality.recommendations.push('Focus on data validation before import')
    }
    
    if (totalErrors / Math.max(totalJobs, 1) > 5) {
      insights.dataQuality.factors.push('High average errors per job')
      insights.dataQuality.recommendations.push('Implement stricter data quality checks')
    }

    // Calculate reliability score
    const successRate = (performanceMetrics as any[]).reduce((sum: any, p) => sum + Number(p.successful_jobs), 0) / Math.max(totalJobs, 1)
    const avgRetries = (performanceMetrics as any[]).reduce((sum: any, p) => sum + Number(p.avg_retries_per_job || 0), 0) / Math.max((performanceMetrics as any[]).length, 1)
    
    insights.reliability.score = Math.round(successRate * 100 - avgRetries * 10)
    
    if (successRate < 0.9) {
      insights.reliability.factors.push(`${Math.round(successRate * 100)}% success rate`)
      insights.reliability.recommendations.push('Investigate common failure patterns')
    }

    // Calculate efficiency score  
    const avgProcessingTime = (performanceMetrics as any[]).reduce((sum: any, p) => sum + Number(p.avg_processing_minutes || 0), 0) / Math.max((performanceMetrics as any[]).length, 1)
    const retryRate = avgRetries / Math.max(totalJobs, 1)
    
    insights.efficiency.score = Math.max(0, Math.min(100, 100 - avgProcessingTime - retryRate * 20))
    
    if (avgProcessingTime > 5) {
      insights.efficiency.factors.push(`Average processing time: ${Math.round(avgProcessingTime)} minutes`)
      insights.efficiency.recommendations.push('Optimize batch processing or increase resources')
    }

    const processingTime = Date.now() - startTime

    return new Response(JSON.stringify({
      success: true,
      analytics: {
        overview: {
          period: {
            days,
            from: sinceDate.toISOString(),
            to: new Date().toISOString()
          },
          totals: {
            jobs: totalJobs,
            errors: totalErrors,
            platforms: Array.from(new Set((hotspots as any[]).map(h => h.platform))).length,
            errorTypes: Array.from(new Set((trends as any[]).map(t => t.error_type))).length
          },
          rates: {
            successRate: Math.round(successRate * 100),
            errorRate: Math.round((totalErrors / Math.max(totalJobs, 1)) * 100) / 100,
            resolutionRate: Math.round(basicAnalytics.resolutionStats.totalResolved / Math.max(totalErrors, 1) * 100)
          }
        },
        trends: trends,
        hotspots: hotspots,
        patterns: patterns,
        resolution: resolutionInsights,
        performance: performanceMetrics,
        insights,
        recommendations: {
          immediate: insights.dataQuality.recommendations.concat(insights.reliability.recommendations).slice(0, 3),
          longTerm: insights.efficiency.recommendations.concat([
            'Implement automated error monitoring',
            'Set up data quality metrics dashboard',
            'Create error prevention workflows'
          ]).slice(0, 3)
        }
      },
      filters: {
        days,
        platform,
        includeResolved,
        groupBy,
        jobId
      },
      meta: {
        processingTime,
        timestamp: new Date().toISOString(),
        cacheHint: `max-age=${Math.max(300, days * 10)}` // Longer cache for longer periods
      }
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${Math.max(300, days * 10)}`
      }
    })

  } catch (error) {
    console.error('Analytics error:', error)
    
    return new Response(JSON.stringify({
      error: 'Analytics failed',
      details: 'An error occurred while generating error analytics',
      code: 'ANALYTICS_FAILED',
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
 * Generate error analytics report (PDF/CSV export)
 */
export async function POST(req: NextRequest) {
  try {
    const { workspaceId: _workspaceId } = await getAuthContext()
    const body = await req.json()
    const { 
      format = 'json', // 'json', 'csv', 'pdf'
      days = 30,
      platform,
      includeDetails = false
    } = body

    // Get analytics data (reuse GET logic)
    const analyticsReq = new Request(req.url + `?days=${days}&platform=${platform || ''}&includeResolved=true`)
    const analyticsResponse = await GET(analyticsReq as NextRequest)
    const analyticsData = await analyticsResponse.json()

    if (!analyticsData.success) {
      return analyticsResponse
    }

    switch (format) {
      case 'csv':
        // Generate CSV report
        const csvData = generateCSVReport(analyticsData.analytics)
        return new Response(csvData, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="error_analytics_${new Date().toISOString().split('T')[0]}.csv"`
          }
        })

      case 'json':
      default:
        return new Response(JSON.stringify({
          success: true,
          report: analyticsData.analytics,
          generatedAt: new Date().toISOString(),
          format,
          parameters: { days, platform, includeDetails }
        }), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="error_analytics_${new Date().toISOString().split('T')[0]}.json"`
          }
        })
    }

  } catch (error) {
    console.error('Report generation error:', error)
    
    return new Response(JSON.stringify({
      error: 'Report generation failed',
      details: 'An error occurred while generating the analytics report',
      code: 'REPORT_GENERATION_FAILED'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * Generate CSV report from analytics data
 */
function generateCSVReport(analytics: any): string {
  const lines: string[] = []
  
  // Header
  lines.push('Error Analytics Report')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`Period: ${analytics.overview.period.days} days`)
  lines.push('')
  
  // Overview
  lines.push('OVERVIEW')
  lines.push('Metric,Value')
  lines.push(`Total Jobs,${analytics.overview.totals.jobs}`)
  lines.push(`Total Errors,${analytics.overview.totals.errors}`)
  lines.push(`Success Rate,${analytics.overview.rates.successRate}%`)
  lines.push(`Error Rate,${analytics.overview.rates.errorRate}`)
  lines.push('')
  
  // Top Error Types
  lines.push('TOP ERROR PATTERNS')
  lines.push('Error Type,Severity,Category,Jobs Affected,Total Occurrences,Occurrence Rate')
  analytics.patterns.forEach((pattern: any) => {
    lines.push(`${pattern.error_type},${pattern.severity},${pattern.category},${pattern.jobs_affected},${pattern.total_occurrences},${Math.round(pattern.occurrence_rate * 100) / 100}%`)
  })
  lines.push('')
  
  // Recommendations
  lines.push('RECOMMENDATIONS')
  lines.push('Priority,Recommendation')
  analytics.recommendations.immediate.forEach((rec: string) => {
    lines.push(`High,"${rec}"`)
  })
  analytics.recommendations.longTerm.forEach((rec: string) => {
    lines.push(`Medium,"${rec}"`)
  })
  
  return lines.join('\n')
}