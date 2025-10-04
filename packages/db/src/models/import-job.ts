/**
 * Enhanced Import Jobs Model with Retry Logic
 * 
 * Extends the existing ImportJob model with retry functionality,
 * progress tracking, and enhanced error handling for production reliability.
 */

import { prisma } from '../index.js';

// Enhanced job status with retry states
export enum ImportJobStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRY_QUEUED = 'retry_queued',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout'
}

// Retry strategy configuration
export interface RetryStrategy {
  maxAttempts: number;
  backoffType: 'linear' | 'exponential' | 'fixed';
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  jitter: boolean;
}

// Enhanced import job model
export interface EnhancedImportJob {
  id: string;
  workspaceId: string;
  platform: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  filePath: string;
  fileHash: string;
  mimeType: string;
  status: ImportJobStatus;
  progress: number; // 0-100
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  errorRows: number;
  retryCount: number;
  maxRetries: number;
  retryStrategy: RetryStrategy;
  lastRetryAt?: Date;
  nextRetryAt?: Date;
  priority: number; // 1-10, higher = more priority
  estimatedDuration?: number;
  actualDuration?: number;
  errorSummary?: ErrorSummary;
  metadata: Record<string, any>;
  createdBy: string;
  assignedWorker?: string;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Error summary for job failures
export interface ErrorSummary {
  totalErrors: number;
  errorTypes: Record<string, number>;
  criticalErrors: number;
  retryableErrors: number;
  sampleErrors: Array<{
    row: number;
    field?: string;
    message: string;
    errorType: string;
  }>;
  lastError?: string;
}

// Job retry result
export interface JobRetryResult {
  success: boolean;
  jobId: string;
  retryCount: number;
  nextRetryAt?: Date;
  message: string;
  canRetry: boolean;
}

// Enhanced Import Job Service
export class ImportJobService {
  private static readonly DEFAULT_RETRY_STRATEGY: RetryStrategy = {
    maxAttempts: 3,
    backoffType: 'exponential',
    baseDelay: 5000, // 5 seconds
    maxDelay: 300000, // 5 minutes
    jitter: true,
  };

  /**
   * Create a new import job with retry configuration
   */
  static async createJob(
    jobData: Omit<EnhancedImportJob, 'id' | 'createdAt' | 'updatedAt' | 'retryCount' | 'progress'>
  ): Promise<EnhancedImportJob> {
    try {
      const job = await prisma.importJob.create({
        data: {
          workspaceId: jobData.workspaceId,
          platform: jobData.platform,
          filename: jobData.filename,
          size: jobData.fileSize,
          status: jobData.status,
          createdBy: jobData.createdBy,
          hash: jobData.fileHash,
          // Additional fields will be handled via metadata for now
        },
      });

      // Extended data stored in a separate enhanced_import_jobs table
      await prisma.$queryRaw`
        INSERT INTO enhanced_import_jobs (
          job_id, original_filename, file_path, file_hash, mime_type,
          progress, total_rows, processed_rows, successful_rows, error_rows,
          retry_count, max_retries, retry_strategy, priority, metadata,
          assigned_worker, created_at, updated_at
        ) VALUES (
          ${job.id}, ${jobData.originalFilename}, ${jobData.filePath}, 
          ${jobData.fileHash}, ${jobData.mimeType}, 0, 0, 0, 0, 0,
          0, ${jobData.maxRetries}, ${JSON.stringify(jobData.retryStrategy)},
          ${jobData.priority}, ${JSON.stringify(jobData.metadata)},
          ${jobData.assignedWorker}, NOW(), NOW()
        )
      `;

      return this.getEnhancedJob(job.id);
    } catch (error) {
      throw new Error(`Failed to create import job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get enhanced job details
   */
  static async getEnhancedJob(jobId: string): Promise<EnhancedImportJob> {
    try {
      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          ij.*,
          eij.original_filename,
          eij.file_path,
          eij.file_hash,
          eij.mime_type,
          eij.progress,
          eij.total_rows,
          eij.processed_rows,
          eij.successful_rows,
          eij.error_rows,
          eij.retry_count,
          eij.max_retries,
          eij.retry_strategy,
          eij.last_retry_at,
          eij.next_retry_at,
          eij.priority,
          eij.estimated_duration,
          eij.actual_duration,
          eij.error_summary,
          eij.metadata,
          eij.assigned_worker
        FROM "ImportJob" ij
        LEFT JOIN enhanced_import_jobs eij ON ij.id = eij.job_id
        WHERE ij.id = ${jobId}
      `;

      if (result.length === 0) {
        throw new Error(`Job ${jobId} not found`);
      }

      return this.mapToEnhancedJob(result[0]);
    } catch (error) {
      throw new Error(`Failed to get job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update job progress
   */
  static async updateProgress(
    jobId: string,
    progress: number,
    processedRows: number,
    successfulRows: number,
    errorRows: number
  ): Promise<void> {
    try {
      await prisma.$queryRaw`
        UPDATE enhanced_import_jobs 
        SET 
          progress = ${progress},
          processed_rows = ${processedRows},
          successful_rows = ${successfulRows},
          error_rows = ${errorRows},
          updated_at = NOW()
        WHERE job_id = ${jobId}
      `;

      // Update main job status if completed
      if (progress >= 100) {
        const status = errorRows > 0 ? ImportJobStatus.COMPLETED : ImportJobStatus.COMPLETED;
        await prisma.importJob.update({
          where: { id: jobId },
          data: { 
            status,
            finishedAt: new Date(),
          },
        });
      }
    } catch (error) {
      throw new Error(`Failed to update progress: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark job as failed with error summary
   */
  static async markAsFailed(
    jobId: string,
    errorSummary: ErrorSummary,
    canRetry: boolean = true
  ): Promise<void> {
    try {
      const job = await this.getEnhancedJob(jobId);
      
      // Determine if we should retry
      const shouldRetry = canRetry && 
        job.retryCount < job.maxRetries && 
        errorSummary.retryableErrors > 0;

      const newStatus = shouldRetry ? ImportJobStatus.RETRY_QUEUED : ImportJobStatus.FAILED;
      const nextRetryAt = shouldRetry ? this.calculateNextRetry(job) : undefined;

      // Update enhanced job details
      await prisma.$queryRaw`
        UPDATE enhanced_import_jobs 
        SET 
          error_summary = ${JSON.stringify(errorSummary)},
          next_retry_at = ${nextRetryAt},
          updated_at = NOW()
        WHERE job_id = ${jobId}
      `;

      // Update main job status
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: newStatus,
          error: errorSummary.lastError,
          finishedAt: shouldRetry ? undefined : new Date(),
        },
      });
    } catch (error) {
      throw new Error(`Failed to mark job as failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retry a failed job
   */
  static async retryJob(jobId: string, workspaceId: string): Promise<JobRetryResult> {
    try {
      const job = await this.getEnhancedJob(jobId);

      // Validate job can be retried
      if (job.workspaceId !== workspaceId) {
        return {
          success: false,
          jobId,
          retryCount: job.retryCount,
          message: 'Job not found or access denied',
          canRetry: false,
        };
      }

      if (job.status !== ImportJobStatus.FAILED && job.status !== ImportJobStatus.RETRY_QUEUED) {
        return {
          success: false,
          jobId,
          retryCount: job.retryCount,
          message: 'Job cannot be retried in current state',
          canRetry: false,
        };
      }

      if (job.retryCount >= job.maxRetries) {
        return {
          success: false,
          jobId,
          retryCount: job.retryCount,
          message: 'Maximum retry attempts exceeded',
          canRetry: false,
        };
      }

      // Check if enough time has passed for retry
      if (job.nextRetryAt && new Date() < job.nextRetryAt) {
        return {
          success: false,
          jobId,
          retryCount: job.retryCount,
          nextRetryAt: job.nextRetryAt,
          message: `Retry not yet available. Next retry at: ${job.nextRetryAt.toISOString()}`,
          canRetry: true,
        };
      }

      // Increment retry count and reset job state
      const newRetryCount = job.retryCount + 1;
      const nextRetryAt = newRetryCount < job.maxRetries ? 
        this.calculateNextRetry({ ...job, retryCount: newRetryCount }) : undefined;

      await prisma.$queryRaw`
        UPDATE enhanced_import_jobs 
        SET 
          retry_count = ${newRetryCount},
          last_retry_at = NOW(),
          next_retry_at = ${nextRetryAt},
          progress = 0,
          processed_rows = 0,
          successful_rows = 0,
          error_rows = 0,
          updated_at = NOW()
        WHERE job_id = ${jobId}
      `;

      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.QUEUED,
          error: null,
          startedAt: null,
          finishedAt: null,
        },
      });

      return {
        success: true,
        jobId,
        retryCount: newRetryCount,
        nextRetryAt,
        message: `Job queued for retry (attempt ${newRetryCount}/${job.maxRetries})`,
        canRetry: newRetryCount < job.maxRetries,
      };
    } catch (error) {
      return {
        success: false,
        jobId,
        retryCount: 0,
        message: `Failed to retry job: ${error instanceof Error ? error.message : 'Unknown error'}`,
        canRetry: false,
      };
    }
  }

  /**
   * Get jobs ready for retry
   */
  static async getJobsReadyForRetry(): Promise<EnhancedImportJob[]> {
    try {
      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          ij.*,
          eij.original_filename,
          eij.file_path,
          eij.file_hash,
          eij.mime_type,
          eij.progress,
          eij.total_rows,
          eij.processed_rows,
          eij.successful_rows,
          eij.error_rows,
          eij.retry_count,
          eij.max_retries,
          eij.retry_strategy,
          eij.last_retry_at,
          eij.next_retry_at,
          eij.priority,
          eij.estimated_duration,
          eij.actual_duration,
          eij.error_summary,
          eij.metadata,
          eij.assigned_worker
        FROM "ImportJob" ij
        JOIN enhanced_import_jobs eij ON ij.id = eij.job_id
        WHERE ij.status = 'retry_queued'
        AND (eij.next_retry_at IS NULL OR eij.next_retry_at <= NOW())
        AND eij.retry_count < eij.max_retries
        ORDER BY eij.priority DESC, eij.next_retry_at ASC
      `;

      return result.map(this.mapToEnhancedJob);
    } catch (error) {
      throw new Error(`Failed to get jobs ready for retry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get job statistics for workspace
   */
  static async getJobStatistics(workspaceId: string, timeRange: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<{
    total: number;
    completed: number;
    failed: number;
    retried: number;
    inProgress: number;
    averageProcessingTime: number;
    successRate: number;
  }> {
    try {
      const timeFilter = this.getTimeFilter(timeRange);
      
      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN ij.status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN ij.status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN ij.status IN ('processing', 'queued') THEN 1 END) as in_progress,
          COALESCE(SUM(eij.retry_count), 0) as total_retries,
          COALESCE(AVG(eij.actual_duration), 0) as avg_duration,
          COALESCE(AVG(CASE WHEN ij.status = 'completed' THEN 100.0 ELSE 0.0 END), 0) as success_rate
        FROM "ImportJob" ij
        LEFT JOIN enhanced_import_jobs eij ON ij.id = eij.job_id
        WHERE ij."workspaceId" = ${workspaceId}
        AND ij."createdAt" >= NOW() - INTERVAL '${timeFilter}'
      `;

      const stats = result[0];
      return {
        total: parseInt(stats.total),
        completed: parseInt(stats.completed),
        failed: parseInt(stats.failed),
        retried: parseInt(stats.total_retries),
        inProgress: parseInt(stats.in_progress),
        averageProcessingTime: parseFloat(stats.avg_duration) || 0,
        successRate: parseFloat(stats.success_rate) || 0,
      };
    } catch (error) {
      throw new Error(`Failed to get job statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate next retry time based on strategy
   */
  private static calculateNextRetry(job: EnhancedImportJob): Date {
    const strategy = job.retryStrategy || this.DEFAULT_RETRY_STRATEGY;
    let delay = strategy.baseDelay;

    switch (strategy.backoffType) {
      case 'exponential':
        delay = strategy.baseDelay * Math.pow(2, job.retryCount);
        break;
      case 'linear':
        delay = strategy.baseDelay * (job.retryCount + 1);
        break;
      case 'fixed':
        delay = strategy.baseDelay;
        break;
    }

    // Apply max delay limit
    delay = Math.min(delay, strategy.maxDelay);

    // Apply jitter if enabled (±25% randomization)
    if (strategy.jitter) {
      const jitterRange = delay * 0.25;
      delay += (Math.random() - 0.5) * 2 * jitterRange;
    }

    return new Date(Date.now() + delay);
  }

  /**
   * Get time filter for SQL queries
   */
  private static getTimeFilter(timeRange: string): string {
    switch (timeRange) {
      case '1h': return '1 hour';
      case '24h': return '1 day';
      case '7d': return '7 days';
      case '30d': return '30 days';
      default: return '1 day';
    }
  }

  /**
   * Map database row to EnhancedImportJob
   */
  private static mapToEnhancedJob(row: any): EnhancedImportJob {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      platform: row.platform,
      filename: row.filename,
      originalFilename: row.original_filename || row.filename,
      fileSize: row.size,
      filePath: row.file_path || '',
      fileHash: row.file_hash || row.hash || '',
      mimeType: row.mime_type || 'text/csv',
      status: row.status as ImportJobStatus,
      progress: row.progress || 0,
      totalRows: row.total_rows || 0,
      processedRows: row.processed_rows || 0,
      successfulRows: row.successful_rows || 0,
      errorRows: row.error_rows || 0,
      retryCount: row.retry_count || 0,
      maxRetries: row.max_retries || 3,
      retryStrategy: typeof row.retry_strategy === 'string' ? 
        JSON.parse(row.retry_strategy) : (row.retry_strategy || this.DEFAULT_RETRY_STRATEGY),
      lastRetryAt: row.last_retry_at,
      nextRetryAt: row.next_retry_at,
      priority: row.priority || 5,
      estimatedDuration: row.estimated_duration,
      actualDuration: row.actual_duration,
      errorSummary: typeof row.error_summary === 'string' ? 
        JSON.parse(row.error_summary) : row.error_summary,
      metadata: typeof row.metadata === 'string' ? 
        JSON.parse(row.metadata) : (row.metadata || {}),
      createdBy: row.createdBy,
      assignedWorker: row.assigned_worker,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}