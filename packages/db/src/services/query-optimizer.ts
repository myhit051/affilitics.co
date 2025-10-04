/**
 * Database Query Optimization Service
 * 
 * Optimizes database queries for CSV processing to achieve:
 * - 50MB CSV processing under 10 seconds
 * - Support for 100+ concurrent workspaces
 * - API response time < 200ms (95th percentile)
 */

import { prisma } from '../index.js';
import { MetricsService } from './metrics-service.js';

// Query optimization strategies
export enum OptimizationStrategy {
  BATCH_INSERT = 'batch_insert',
  INDEX_HINT = 'index_hint',
  PARALLEL_PROCESSING = 'parallel_processing',
  CONNECTION_POOLING = 'connection_pooling',
  PREPARED_STATEMENTS = 'prepared_statements'
}

// Batch processing configuration
export interface BatchConfig {
  size: number;
  maxConcurrency: number;
  chunkSize: number;
  timeoutMs: number;
}

// Query performance metrics
export interface QueryPerformance {
  queryId: string;
  duration: number;
  rowsAffected: number;
  strategy: OptimizationStrategy;
  timestamp: Date;
  success: boolean;
}

// Optimized query builder for CSV processing
export class QueryOptimizer {
  private static readonly DEFAULT_BATCH_CONFIG: BatchConfig = {
    size: 1000,        // จำนวน rows ต่อ batch
    maxConcurrency: 5, // จำนวน concurrent batches
    chunkSize: 10000,  // จำนวน rows ที่อ่านในแต่ละครั้ง
    timeoutMs: 30000   // timeout 30 วินาที
  };

  // Connection pool configuration
  private static readonly POOL_CONFIG = {
    min: 5,
    max: 20,
    acquireTimeoutMillis: 10000,
    createTimeoutMillis: 10000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200
  };

  /**
   * Optimize batch insert for CSV data
   */
  static async optimizedBatchInsert(
    tableName: string,
    data: Record<string, any>[],
    config: Partial<BatchConfig> = {}
  ): Promise<QueryPerformance[]> {
    const startTime = Date.now();
    const batchConfig = { ...this.DEFAULT_BATCH_CONFIG, ...config };
    const performances: QueryPerformance[] = [];

    try {
      // แบ่งข้อมูลเป็น batches
      const batches = this.createBatches(data, batchConfig.size);
      
      // ประมวลผล batches แบบ parallel
      const batchPromises = batches.map(async (batch, index) => {
        const batchStartTime = Date.now();
        const queryId = `batch_${tableName}_${index}`;

        try {
          await this.executeBatchInsert(tableName, batch);
          
          const performance: QueryPerformance = {
            queryId,
            duration: Date.now() - batchStartTime,
            rowsAffected: batch.length,
            strategy: OptimizationStrategy.BATCH_INSERT,
            timestamp: new Date(),
            success: true
          };

          // บันทึก metrics
          await MetricsService.recordMetric({
            name: 'db_batch_insert_duration',
            type: 'histogram' as any,
            value: performance.duration,
            timestamp: performance.timestamp,
            labels: {
              table: tableName,
              strategy: OptimizationStrategy.BATCH_INSERT,
              success: 'true'
            }
          });

          return performance;
        } catch (error) {
          const performance: QueryPerformance = {
            queryId,
            duration: Date.now() - batchStartTime,
            rowsAffected: 0,
            strategy: OptimizationStrategy.BATCH_INSERT,
            timestamp: new Date(),
            success: false
          };

          await MetricsService.recordMetric({
            name: 'db_batch_insert_error',
            type: 'counter' as any,
            value: 1,
            timestamp: performance.timestamp,
            labels: {
              table: tableName,
              error: error instanceof Error ? error.message : 'unknown'
            }
          });

          return performance;
        }
      });

      // จำกัด concurrency
      const results = await this.limitConcurrency(batchPromises, batchConfig.maxConcurrency);
      performances.push(...results);

      return performances;
    } catch (error) {
      throw new Error(`Batch insert optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Optimize SELECT queries with proper indexing
   */
  static async optimizedSelect(
    query: string,
    params: any[] = [],
    workspaceId?: string
  ): Promise<{ data: any[]; performance: QueryPerformance }> {
    const startTime = Date.now();
    const queryId = `select_${Date.now()}`;

    try {
      // เพิ่ม query hints สำหรับ performance
      const optimizedQuery = this.addQueryHints(query);
      
      // Execute query with timeout
      const data = await Promise.race([
        prisma.$queryRawUnsafe(optimizedQuery, ...params),
        this.createTimeoutPromise(this.DEFAULT_BATCH_CONFIG.timeoutMs)
      ]) as any[];

      const performance: QueryPerformance = {
        queryId,
        duration: Date.now() - startTime,
        rowsAffected: Array.isArray(data) ? data.length : 0,
        strategy: OptimizationStrategy.INDEX_HINT,
        timestamp: new Date(),
        success: true
      };

      // บันทึก performance metrics
      await MetricsService.recordMetric({
        name: 'db_select_duration',
        type: 'histogram' as any,
        value: performance.duration,
        timestamp: performance.timestamp,
        labels: {
          strategy: OptimizationStrategy.INDEX_HINT,
          workspace_id: workspaceId || 'system'
        },
        workspaceId
      });

      return { data, performance };
    } catch (error) {
      const performance: QueryPerformance = {
        queryId,
        duration: Date.now() - startTime,
        rowsAffected: 0,
        strategy: OptimizationStrategy.INDEX_HINT,
        timestamp: new Date(),
        success: false
      };

      await MetricsService.recordMetric({
        name: 'db_select_error',
        type: 'counter' as any,
        value: 1,
        timestamp: performance.timestamp,
        labels: {
          error: error instanceof Error ? error.message : 'unknown',
          workspace_id: workspaceId || 'system'
        },
        workspaceId
      });

      throw error;
    }
  }

  /**
   * Optimize CSV processing queries
   */
  static async optimizeCSVProcessing(
    workspaceId: string,
    jobId: string,
    csvData: Record<string, any>[],
    config: Partial<BatchConfig> = {}
  ): Promise<{
    totalProcessed: number;
    successfulRows: number;
    errorRows: number;
    duration: number;
    performances: QueryPerformance[];
  }> {
    const startTime = Date.now();
    const performances: QueryPerformance[] = [];
    let totalProcessed = 0;
    let successfulRows = 0;
    let errorRows = 0;

    try {
      // 1. Pre-process และ validate data
      const validatedData = await this.validateCSVData(csvData);
      
      // 2. Create database indexes if not exist
      await this.ensureOptimalIndexes(workspaceId);
      
      // 3. Process data in optimized batches
      const batchResults = await this.optimizedBatchInsert(
        'csv_data', // หรือ table name ที่เหมาะสม
        validatedData,
        config
      );
      
      performances.push(...batchResults);
      
      // 4. Update job progress in real-time
      for (const result of batchResults) {
        totalProcessed += result.rowsAffected;
        if (result.success) {
          successfulRows += result.rowsAffected;
        } else {
          errorRows += result.rowsAffected;
        }
        
        // อัพเดต progress ทุก batch
        const progress = Math.round((totalProcessed / csvData.length) * 100);
        await this.updateJobProgress(jobId, progress, totalProcessed, successfulRows, errorRows);
      }

      // 5. Optimize post-processing queries
      await this.optimizePostProcessing(workspaceId, jobId);

      const duration = Date.now() - startTime;

      // บันทึก overall performance
      await MetricsService.recordMetric({
        name: 'csv_processing_duration',
        type: 'histogram' as any,
        value: duration,
        timestamp: new Date(),
        labels: {
          job_id: jobId,
          total_rows: csvData.length.toString(),
          success_rate: ((successfulRows / totalProcessed) * 100).toFixed(2)
        },
        workspaceId
      });

      return {
        totalProcessed,
        successfulRows,
        errorRows,
        duration,
        performances
      };
    } catch (error) {
      await MetricsService.recordMetric({
        name: 'csv_processing_error',
        type: 'counter' as any,
        value: 1,
        timestamp: new Date(),
        labels: {
          job_id: jobId,
          error: error instanceof Error ? error.message : 'unknown'
        },
        workspaceId
      });

      throw new Error(`CSV processing optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get query performance analytics
   */
  static async getQueryPerformanceAnalytics(
    workspaceId?: string,
    timeRange: '1h' | '24h' | '7d' = '24h'
  ): Promise<{
    averageQueryTime: number;
    slowQueries: number;
    querySuccessRate: number;
    totalQueries: number;
    performanceByStrategy: Record<OptimizationStrategy, {
      count: number;
      averageDuration: number;
      successRate: number;
    }>;
  }> {
    try {
      const timeFilter = this.getTimeFilter(timeRange);
      const workspaceFilter = workspaceId ? `AND workspace_id = '${workspaceId}'` : '';

      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*) as total_queries,
          AVG(value) as avg_query_time,
          COUNT(CASE WHEN value > 1000 THEN 1 END) as slow_queries,
          COUNT(CASE WHEN labels->>'success' = 'true' THEN 1 END) as successful_queries
        FROM metrics
        WHERE name IN ('db_select_duration', 'db_batch_insert_duration', 'csv_processing_duration')
        AND timestamp >= NOW() - INTERVAL '${timeFilter}'
        ${workspaceFilter}
      `;

      const stats = result[0];
      const totalQueries = parseInt(stats.total_queries) || 0;
      const successfulQueries = parseInt(stats.successful_queries) || 0;

      // Get performance by strategy
      const strategyResult = await prisma.$queryRaw<any[]>`
        SELECT 
          labels->>'strategy' as strategy,
          COUNT(*) as count,
          AVG(value) as avg_duration,
          COUNT(CASE WHEN labels->>'success' = 'true' THEN 1 END) as successful
        FROM metrics
        WHERE name IN ('db_select_duration', 'db_batch_insert_duration')
        AND timestamp >= NOW() - INTERVAL '${timeFilter}'
        AND labels->>'strategy' IS NOT NULL
        ${workspaceFilter}
        GROUP BY labels->>'strategy'
      `;

      const performanceByStrategy: any = {};
      for (const row of strategyResult) {
        const strategy = row.strategy as OptimizationStrategy;
        const count = parseInt(row.count) || 0;
        performanceByStrategy[strategy] = {
          count,
          averageDuration: parseFloat(row.avg_duration) || 0,
          successRate: count > 0 ? (parseInt(row.successful) / count) * 100 : 0
        };
      }

      return {
        averageQueryTime: parseFloat(stats.avg_query_time) || 0,
        slowQueries: parseInt(stats.slow_queries) || 0,
        querySuccessRate: totalQueries > 0 ? (successfulQueries / totalQueries) * 100 : 100,
        totalQueries,
        performanceByStrategy
      };
    } catch (error) {
      throw new Error(`Failed to get query performance analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Private helper methods

  private static createBatches<T>(data: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  private static async executeBatchInsert(tableName: string, batch: Record<string, any>[]): Promise<void> {
    if (batch.length === 0) return;

    // สร้าง SQL statement สำหรับ batch insert
    const columns = Object.keys(batch[0]);
    const placeholders = batch.map(() => 
      `(${columns.map(() => '?').join(', ')})`
    ).join(', ');

    const values = batch.flatMap(row => columns.map(col => row[col]));
    
    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')}) 
      VALUES ${placeholders}
      ON CONFLICT DO NOTHING
    `;

    await prisma.$queryRawUnsafe(sql, ...values);
  }

  private static async limitConcurrency<T>(
    promises: Promise<T>[],
    maxConcurrency: number
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];

    for (const promise of promises) {
      const p = promise.then(result => {
        results.push(result);
        executing.splice(executing.indexOf(p), 1);
      });

      executing.push(p);

      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }

  private static addQueryHints(query: string): string {
    // เพิ่ม hints สำหรับ PostgreSQL performance
    if (query.toLowerCase().includes('select')) {
      // เพิ่ม query planner hints
      return query.replace(/FROM\s+(\w+)/i, 'FROM $1 /*+ USE_INDEX */');
    }
    return query;
  }

  private static createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), timeoutMs);
    });
  }

  private static async validateCSVData(csvData: Record<string, any>[]): Promise<Record<string, any>[]> {
    // Validate และ clean CSV data
    return csvData.filter(row => {
      // ตรวจสอบว่า row มีข้อมูลที่จำเป็น
      return Object.values(row).some(value => value !== null && value !== undefined && value !== '');
    });
  }

  private static async ensureOptimalIndexes(workspaceId: string): Promise<void> {
    try {
      // สร้าง indexes ที่จำเป็นสำหรับ performance
      await prisma.$queryRaw`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_import_job_workspace_status 
        ON "ImportJob" ("workspaceId", status, "createdAt")
      `;

      await prisma.$queryRaw`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_workspace_timestamp 
        ON metrics (workspace_id, timestamp) 
        WHERE workspace_id IS NOT NULL
      `;
    } catch (error) {
      // Indexes อาจจะมีอยู่แล้ว - ไม่ต้อง error
      console.warn('Index creation warning:', error);
    }
  }

  private static async updateJobProgress(
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
    } catch (error) {
      // Log error แต่ไม่ stop การประมวลผล
      console.error('Failed to update job progress:', error);
    }
  }

  private static async optimizePostProcessing(workspaceId: string, jobId: string): Promise<void> {
    try {
      // รัน post-processing queries ที่ optimize แล้ว
      await prisma.$queryRaw`
        ANALYZE "ImportJob"
      `;

      // Update statistics
      await prisma.$queryRaw`
        UPDATE enhanced_import_jobs 
        SET actual_duration = EXTRACT(EPOCH FROM (NOW() - updated_at)) * 1000
        WHERE job_id = ${jobId}
      `;
    } catch (error) {
      console.warn('Post-processing optimization warning:', error);
    }
  }

  private static getTimeFilter(timeRange: string): string {
    switch (timeRange) {
      case '1h': return '1 hour';
      case '24h': return '1 day';
      case '7d': return '7 days';
      default: return '1 day';
    }
  }
}