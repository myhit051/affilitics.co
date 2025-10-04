/**
 * Import Error Service
 * 
 * Comprehensive error logging, tracking, and recovery service for import operations.
 * Provides structured error handling with detailed context and recovery strategies.
 */

import { 
  ImportErrorType, 
  ErrorSeverity, 
  ErrorCategory,
  RecoveryStrategy,
  getErrorConfig,
  isRetryableError,
  getRetryStrategy,
  hasCriticalErrors
} from '../constants/import-error-types.js'

export interface ImportErrorContext {
  jobId: string
  workspaceId: string
  platform: string
  filename: string
  batchNumber?: number
  timestamp: Date
  userAgent?: string
  ipAddress?: string
}

export interface ImportErrorDetails {
  errorType: ImportErrorType
  rowNumber: number
  columnName?: string
  fieldName?: string
  fieldValue?: any
  errorMessage: string
  stackTrace?: string
  additionalContext?: Record<string, any>
}

export interface ProcessingError extends ImportErrorDetails {
  id?: string
  context: ImportErrorContext
  severity: ErrorSeverity
  category: ErrorCategory
  recoveryStrategy: RecoveryStrategy
  retryCount?: number
  maxRetries?: number
  createdAt: Date
  resolvedAt?: Date
  dismissed?: boolean
}

export interface ErrorSummary {
  totalErrors: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  infoCount: number
  categoryCounts: Record<ErrorCategory, number>
  typeCounts: Record<ImportErrorType, number>
  retryableCount: number
  autoSkippableCount: number
  blockerCount: number
}

export interface RetryConfiguration {
  enabled: boolean
  maxRetries: number
  initialDelayMs: number
  backoffMultiplier: number
  jitterMs?: number
}

export class ImportErrorService {
  private db: any // Will be injected with Prisma client
  private retryConfig: RetryConfiguration

  constructor(db: any, retryConfig?: Partial<RetryConfiguration>) {
    this.db = db
    this.retryConfig = {
      enabled: true,
      maxRetries: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      jitterMs: 100,
      ...retryConfig
    }
  }

  /**
   * Log a single error with full context
   */
  async logError(
    details: ImportErrorDetails,
    context: ImportErrorContext
  ): Promise<string> {
    const config = getErrorConfig(details.errorType)
    const errorId = crypto.randomUUID()
    
    const processingError: ProcessingError = {
      ...details,
      id: errorId,
      context,
      severity: config.severity,
      category: config.category,
      recoveryStrategy: config.recoveryStrategy,
      retryCount: 0,
      maxRetries: this.retryConfig.enabled ? getRetryStrategy(details.errorType).maxRetries : 0,
      createdAt: new Date(),
      dismissed: false
    }

    try {
      await this.db.$executeRaw`
        INSERT INTO import_errors (
          id, job_id, row_no, field, message, sample, 
          error_type, severity, category, recovery_strategy,
          retry_count, max_retries, stack_trace, additional_context,
          created_at, dismissed
        ) VALUES (
          ${errorId}::uuid,
          ${context.jobId}::uuid,
          ${details.rowNumber},
          ${details.fieldName || details.columnName},
          ${details.errorMessage},
          ${details.fieldValue ? String(details.fieldValue).substring(0, 500) : null},
          ${details.errorType},
          ${config.severity},
          ${config.category},
          ${config.recoveryStrategy},
          0,
          ${processingError.maxRetries},
          ${details.stackTrace},
          ${details.additionalContext ? JSON.stringify(details.additionalContext) : null},
          NOW(),
          false
        )
      `

      // Update job error count
      await this.db.$executeRaw`
        UPDATE import_jobs 
        SET error_count = error_count + 1,
            last_error_at = NOW()
        WHERE id = ${context.jobId}::uuid
      `

      return errorId
    } catch (error) {
      console.error('Failed to log import error:', error)
      throw new Error(`Error logging failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Log multiple errors in a batch
   */
  async logErrors(
    errors: ImportErrorDetails[],
    context: ImportErrorContext
  ): Promise<string[]> {
    const errorIds: string[] = []
    
    // Process in chunks to avoid overwhelming the database
    const chunkSize = 50
    for (let i = 0; i < errors.length; i += chunkSize) {
      const chunk = errors.slice(i, i + chunkSize)
      const chunkIds = await Promise.all(
        chunk.map(error => this.logError(error, context))
      )
      errorIds.push(...chunkIds)
    }

    return errorIds
  }

  /**
   * Get comprehensive error summary for a job
   */
  async getErrorSummary(jobId: string): Promise<ErrorSummary> {
    const errors = await this.db.$queryRaw<Array<{
      error_type: ImportErrorType
      severity: ErrorSeverity
      category: ErrorCategory
      count: bigint
    }>>`
      SELECT 
        error_type,
        severity,
        category,
        COUNT(*) as count
      FROM import_errors 
      WHERE job_id = ${jobId}::uuid AND NOT dismissed
      GROUP BY error_type, severity, category
    `

    const summary: ErrorSummary = {
      totalErrors: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      infoCount: 0,
      categoryCounts: {
        data_quality: 0,
        business_logic: 0,
        system: 0,
        file: 0,
        platform: 0,
        unknown: 0
      },
      typeCounts: {} as Record<ImportErrorType, number>,
      retryableCount: 0,
      autoSkippableCount: 0,
      blockerCount: 0
    }

    for (const error of errors) {
      const count = Number(error.count)
      summary.totalErrors += count

      // Count by severity
      switch (error.severity) {
        case 'critical':
          summary.criticalCount += count
          break
        case 'high':
          summary.highCount += count
          break
        case 'medium':
          summary.mediumCount += count
          break
        case 'low':
          summary.lowCount += count
          break
        case 'info':
          summary.infoCount += count
          break
      }

      // Count by category
      summary.categoryCounts[error.category as ErrorCategory] += count

      // Count by type
      summary.typeCounts[error.error_type as keyof typeof summary.typeCounts] = count

      // Count special categories
      const config = getErrorConfig(error.error_type)
      if (config.retryable) {
        summary.retryableCount += count
      }
      if (config.autoSkippable) {
        summary.autoSkippableCount += count
      }
      if (config.severity === 'critical' && !config.autoSkippable) {
        summary.blockerCount += count
      }
    }

    return summary
  }

  /**
   * Check if job has blocking errors
   */
  async hasBlockingErrors(jobId: string): Promise<boolean> {
    const result = await this.db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM import_errors 
      WHERE job_id = ${jobId}::uuid 
        AND NOT dismissed
        AND severity = 'critical'
        AND error_type NOT IN (
          SELECT unnest(ARRAY[
            'duplicate_record'::text,
            'out_of_range'::text,
            'invalid_format'::text
          ])
        )
    `

    return Number(result[0]?.count || 0) > 0
  }

  /**
   * Get retryable errors for a job
   */
  async getRetryableErrors(jobId: string): Promise<ProcessingError[]> {
    const errors = await this.db.$queryRaw<Array<{
      id: string
      row_no: number
      field: string
      message: string
      sample: string
      error_type: ImportErrorType
      severity: ErrorSeverity
      category: ErrorCategory
      recovery_strategy: RecoveryStrategy
      retry_count: number
      max_retries: number
      stack_trace: string
      additional_context: string
      created_at: Date
    }>>`
      SELECT 
        id, row_no, field, message, sample, error_type,
        severity, category, recovery_strategy, retry_count, max_retries,
        stack_trace, additional_context, created_at
      FROM import_errors 
      WHERE job_id = ${jobId}::uuid 
        AND NOT dismissed
        AND retry_count < max_retries
        AND error_type IN (
          SELECT unnest(ARRAY[
            'processing_error'::text,
            'storage_error'::text,
            'network_error'::text,
            'timeout_error'::text,
            'platform_api_error'::text,
            'platform_rate_limit'::text
          ])
        )
      ORDER BY created_at ASC
    `

    return errors.map((error: any) => ({
      id: error.id,
      errorType: error.error_type,
      rowNumber: error.row_no,
      fieldName: error.field,
      fieldValue: error.sample,
      errorMessage: error.message,
      stackTrace: error.stack_trace,
      additionalContext: error.additional_context ? JSON.parse(error.additional_context) : undefined,
      context: {} as ImportErrorContext, // Will be populated separately if needed
      severity: error.severity,
      category: error.category,
      recoveryStrategy: error.recovery_strategy,
      retryCount: error.retry_count,
      maxRetries: error.max_retries,
      createdAt: error.created_at
    }))
  }

  /**
   * Mark error for retry
   */
  async markForRetry(errorId: string): Promise<void> {
    await this.db.$executeRaw`
      UPDATE import_errors 
      SET retry_count = retry_count + 1,
          last_retry_at = NOW()
      WHERE id = ${errorId}::uuid
        AND retry_count < max_retries
    `
  }

  /**
   * Resolve error
   */
  async resolveError(errorId: string, resolution?: string): Promise<void> {
    await this.db.$executeRaw`
      UPDATE import_errors 
      SET resolved_at = NOW(),
          resolution = ${resolution}
      WHERE id = ${errorId}::uuid
    `
  }

  /**
   * Dismiss errors
   */
  async dismissErrors(errorIds: string[]): Promise<number> {
    const result = await this.db.$executeRaw`
      UPDATE import_errors 
      SET dismissed = true,
          dismissed_at = NOW()
      WHERE id = ANY(${errorIds}::uuid[])
    `

    return result
  }

  /**
   * Clear all errors for a job
   */
  async clearJobErrors(jobId: string): Promise<number> {
    const result = await this.db.$executeRaw`
      DELETE FROM import_errors 
      WHERE job_id = ${jobId}::uuid
    `

    // Reset job error count
    await this.db.$executeRaw`
      UPDATE import_jobs 
      SET error_count = 0,
          last_error_at = NULL
      WHERE id = ${jobId}::uuid
    `

    return result
  }

  /**
   * Get error analytics for workspace
   */
  async getErrorAnalytics(workspaceId: string, days = 30): Promise<{
    errorTrends: Array<{ date: string, count: number, severity: ErrorSeverity }>
    topErrorTypes: Array<{ errorType: ImportErrorType, count: number, description: string }>
    platformErrors: Array<{ platform: string, count: number }>
    resolutionStats: {
      totalResolved: number
      avgResolutionTimeHours: number
      retrySuccessRate: number
    }
  }> {
    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - days)

    // Error trends by day
    const trends = await this.db.$queryRaw<Array<{
      date: string
      severity: ErrorSeverity
      count: bigint
    }>>`
      SELECT 
        DATE(ie.created_at) as date,
        ie.severity,
        COUNT(*) as count
      FROM import_errors ie
      JOIN import_jobs ij ON ie.job_id = ij.id
      WHERE ij.workspace_id = ${workspaceId}::uuid
        AND ie.created_at >= ${sinceDate}
      GROUP BY DATE(ie.created_at), ie.severity
      ORDER BY date DESC
    `

    // Top error types
    const topTypes = await this.db.$queryRaw<Array<{
      error_type: ImportErrorType
      count: bigint
    }>>`
      SELECT 
        ie.error_type,
        COUNT(*) as count
      FROM import_errors ie
      JOIN import_jobs ij ON ie.job_id = ij.id
      WHERE ij.workspace_id = ${workspaceId}::uuid
        AND ie.created_at >= ${sinceDate}
      GROUP BY ie.error_type
      ORDER BY count DESC
      LIMIT 10
    `

    // Platform error distribution
    const platformErrors = await this.db.$queryRaw<Array<{
      platform: string
      count: bigint
    }>>`
      SELECT 
        ij.platform,
        COUNT(*) as count
      FROM import_errors ie
      JOIN import_jobs ij ON ie.job_id = ij.id
      WHERE ij.workspace_id = ${workspaceId}::uuid
        AND ie.created_at >= ${sinceDate}
      GROUP BY ij.platform
      ORDER BY count DESC
    `

    // Resolution statistics
    const resolutionStats = await this.db.$queryRaw<Array<{
      total_resolved: bigint
      avg_resolution_hours: number
      total_retries: bigint
      successful_retries: bigint
    }>>`
      SELECT 
        COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) as total_resolved,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_hours,
        COUNT(*) FILTER (WHERE retry_count > 0) as total_retries,
        COUNT(*) FILTER (WHERE retry_count > 0 AND resolved_at IS NOT NULL) as successful_retries
      FROM import_errors ie
      JOIN import_jobs ij ON ie.job_id = ij.id
      WHERE ij.workspace_id = ${workspaceId}::uuid
        AND ie.created_at >= ${sinceDate}
    `

    const stats = resolutionStats[0]

    return {
      errorTrends: trends.map((t: any) => ({
        date: t.date,
        count: Number(t.count),
        severity: t.severity
      })),
      topErrorTypes: topTypes.map((t: any) => ({
        errorType: t.error_type,
        count: Number(t.count),
        description: getErrorConfig(t.error_type).description
      })),
      platformErrors: platformErrors.map((p: any) => ({
        platform: p.platform,
        count: Number(p.count)
      })),
      resolutionStats: {
        totalResolved: Number(stats?.total_resolved || 0),
        avgResolutionTimeHours: Number(stats?.avg_resolution_hours || 0),
        retrySuccessRate: stats?.total_retries ? 
          Number(stats.successful_retries) / Number(stats.total_retries) * 100 : 0
      }
    }
  }

  /**
   * Generate error recovery recommendations
   */
  async getRecoveryRecommendations(jobId: string): Promise<Array<{
    errorType: ImportErrorType
    count: number
    severity: ErrorSeverity
    recommendation: string
    action: 'fix_data' | 'retry' | 'skip' | 'manual_review' | 'abort'
    estimatedEffort: 'low' | 'medium' | 'high'
  }>> {
    const errorSummary = await this.getErrorSummary(jobId)
    const recommendations = []

    for (const [errorType, count] of Object.entries(errorSummary.typeCounts)) {
      const config = getErrorConfig(errorType as ImportErrorType)
      let recommendation = ''
      let action: any = 'manual_review'
      let estimatedEffort: any = 'medium'

      switch (config.recoveryStrategy) {
        case 'retry_automatic':
          recommendation = 'These errors can be automatically retried. The system will attempt to reprocess these records.'
          action = 'retry'
          estimatedEffort = 'low'
          break
        case 'skip_row':
          recommendation = 'These errors can be safely skipped. Records with these errors will be excluded from import.'
          action = 'skip'
          estimatedEffort = 'low'
          break
        case 'fix_data':
          recommendation = 'Data needs to be corrected in the source file before reimporting.'
          action = 'fix_data'
          estimatedEffort = 'high'
          break
        case 'abort_import':
          recommendation = 'This error type requires aborting the import. Please fix the issue and retry the entire import.'
          action = 'abort'
          estimatedEffort = 'high'
          break
        default:
          recommendation = 'Manual review required to determine the best course of action.'
          action = 'manual_review'
          estimatedEffort = 'medium'
      }

      recommendations.push({
        errorType: errorType as ImportErrorType,
        count,
        severity: config.severity,
        recommendation,
        action,
        estimatedEffort
      })
    }

    return recommendations.sort((a, b) => b.count - a.count)
  }
}

/**
 * Factory function to create ImportErrorService instance
 */
export function createImportErrorService(db: any, config?: Partial<RetryConfiguration>) {
  return new ImportErrorService(db, config)
}