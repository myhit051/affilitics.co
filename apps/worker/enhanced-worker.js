import { config } from 'dotenv'
// Load .env from project root
config({ path: '../../.env' })

import { createClient } from '@supabase/supabase-js'
import { Pool } from 'pg'
import { 
  IMPORT_JOB_STATUS, 
  isWorkerProcessableStatus, 
  validateStatusTransition
} from '@aff/db'

// Import worker services
import { createCSVProcessor } from './processors/csv-stream.js'
import { createRetryHandler } from './processors/retry-handler.js'
import { createHealthMonitor } from './services/health-monitor.js'
import { createMetricsCollector } from './services/metrics-collector.js'
import { formatError, formatUserError, formatLogError } from './utils/error-formatter.js'
import { SimpleJobService, SimpleMetricsService, SimpleSecurityService } from './services/simple-job-service.js'

/**
 * Enhanced Worker with full integration
 * รวม services ทั้งหมดจาก Phase 3.4 เข้าด้วยกัน
 * และเชื่อมต่อกับ Backend Infrastructure จาก Phase 3.3
 */
class EnhancedWorker {
  constructor(options = {}) {
    this.workerId = options.workerId || `worker-${process.pid}`
    this.isRunning = false
    this.currentJob = null
    
    // Initialize configuration
    this.initializeConfiguration()
    
    // Initialize external services
    this.initializeExternalServices()
    
    // Initialize worker services
    this.initializeWorkerServices()
    
    // Setup event handlers
    this.setupEventHandlers()
  }

  /**
   * Initialize configuration and validate environment
   * @private
   */
  initializeConfiguration() {
    // Validate required environment variables
    const required = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE']
    const missing = required.filter(key => !process.env[key])
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
    }
    
    this.config = {
      databaseUrl: process.env.DATABASE_URL,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseServiceRole: process.env.SUPABASE_SERVICE_ROLE,
      bucket: process.env.SUPABASE_STORAGE_BUCKET || 'imports',
      healthEndpoint: process.env.HEALTH_ENDPOINT,
      metricsEndpoint: process.env.METRICS_ENDPOINT,
      workerApiKey: process.env.WORKER_API_KEY
    }
  }

  /**
   * Initialize external services (Supabase, Database, etc.)
   * @private
   */
  initializeExternalServices() {
    // Supabase client
    this.supabase = createClient(
      this.config.supabaseUrl, 
      this.config.supabaseServiceRole, 
      { auth: { persistSession: false } }
    )
    
    // Database pool
    this.dbPool = new Pool({
      connectionString: this.config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    })
    
    // Test database connection
    this.dbPool.connect((err, client, release) => {
      if (err) {
        console.error('Database connection failed:', err.stack)
        throw err
      }
      console.log('Database connection established')
      release()
    })
    
    // Initialize backend services
    this.importJobService = new SimpleJobService(this.dbPool)
    this.metricsService = new SimpleMetricsService(this.dbPool)
    this.securityService = new SimpleSecurityService(this.dbPool)
  }

  /**
   * Initialize worker services (CSV processor, retry handler, etc.)
   * @private
   */
  initializeWorkerServices() {
    // CSV processor with optimized settings
    this.csvProcessor = createCSVProcessor({
      batchSize: 1000,
      progressInterval: 0.1, // Report every 10%
      maxMemoryUsage: 512 * 1024 * 1024, // 512MB
      timeout: 300000 // 5 minutes
    })
    
    // Retry handler with balanced profile
    this.retryHandler = createRetryHandler({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 300000,
      backoffMultiplier: 2
    })
    
    // Health monitor
    this.healthMonitor = createHealthMonitor({
      workerId: this.workerId,
      heartbeatInterval: 30000, // 30 seconds
      healthCheckInterval: 5000, // 5 seconds
      memoryThreshold: 512 * 1024 * 1024, // 512MB
      cpuThreshold: 80, // 80%
      apiEndpoint: this.config.healthEndpoint
    })
    
    // Metrics collector
    this.metricsCollector = createMetricsCollector({
      workerId: this.workerId,
      collectInterval: 30000, // 30 seconds
      retentionPeriod: 3600000, // 1 hour
      apiEndpoint: this.config.metricsEndpoint,
      batchSize: 100
    })
  }

  /**
   * Setup event handlers for all services
   * @private
   */
  setupEventHandlers() {
    // CSV processor events
    this.csvProcessor.on('progress', (progress) => {
      this.metricsCollector.recordCustomMetric('csv_progress', progress.percentage, progress)
      console.log(`CSV Progress: ${progress.percentage}% (${progress.processed}/${progress.total})`)
    })
    
    this.csvProcessor.on('batchProcessed', (batchInfo) => {
      this.metricsCollector.recordCustomMetric('batch_processed', batchInfo.batchSize, batchInfo)
    })
    
    this.csvProcessor.on('error', (error) => {
      const formattedError = formatLogError(error, { jobId: this.currentJob?.id })
      console.error('CSV Processing Error:', formattedError)
    })
    
    // Retry handler events
    this.retryHandler.on('retryScheduled', (retryInfo) => {
      this.metricsCollector.recordRetry(retryInfo.jobId, retryInfo.attemptNumber, retryInfo.failureReason)
      console.log(`Retry scheduled for job ${retryInfo.jobId}, attempt ${retryInfo.attemptNumber}`)
    })
    
    this.retryHandler.on('retryLimitExceeded', (retryInfo) => {
      console.error(`Retry limit exceeded for job ${retryInfo.jobId}`)
      this.metricsCollector.recordCustomMetric('retry_limit_exceeded', 1, retryInfo)
    })
    
    // Health monitor events
    this.healthMonitor.on('heartbeat', (heartbeatData) => {
      this.metricsCollector.recordHeartbeat(heartbeatData)
    })
    
    this.healthMonitor.on('memoryWarning', (memInfo) => {
      console.warn(`Memory warning: ${memInfo.percentage.toFixed(1)}% (${Math.round(memInfo.current / 1024 / 1024)}MB)`)
    })
    
    this.healthMonitor.on('cpuAlert', (cpuInfo) => {
      console.warn(`CPU alert: ${cpuInfo.current.toFixed(1)}%`)
    })
    
    // Metrics collector events
    this.metricsCollector.on('metricsSent', () => {
      console.log('Metrics sent to API successfully')
    })
    
    this.metricsCollector.on('metricsError', (error) => {
      console.error('Metrics API error:', error.error)
    })
  }

  /**
   * Start the enhanced worker
   */
  async start() {
    if (this.isRunning) {
      console.warn('Worker is already running')
      return
    }
    
    try {
      console.log(`Starting Enhanced Worker ${this.workerId}...`)
      
      // Start all services
      await this.healthMonitor.start()
      this.metricsCollector.start()
      
      // Mark as running
      this.isRunning = true
      
      console.log(`Enhanced Worker ${this.workerId} started successfully`)
      
      // Start job processing loop
      this.startJobLoop()
      
    } catch (error) {
      const formattedError = formatLogError(error, { workerId: this.workerId })
      console.error('Failed to start worker:', formattedError)
      throw error
    }
  }

  /**
   * Stop the enhanced worker
   */
  async stop() {
    if (!this.isRunning) {
      return
    }
    
    console.log(`Stopping Enhanced Worker ${this.workerId}...`)
    
    this.isRunning = false
    
    // Stop all services
    this.healthMonitor.stop()
    this.metricsCollector.stop()
    this.retryHandler.reset()
    
    // Close database connections
    await this.dbPool.end()
    
    console.log(`Enhanced Worker ${this.workerId} stopped`)
  }

  /**
   * Main job processing loop
   * @private
   */
  async startJobLoop() {
    while (this.isRunning) {
      try {
        this.currentJob = await this.getNextJob()
        
        if (!this.currentJob) {
          await this.sleep(1500)
          continue
        }
        
        console.log(`Processing job ${this.currentJob.id}`)
        
        // Process the job
        await this.processJob(this.currentJob)
        
      } catch (error) {
        await this.handleJobError(error)
      }
      
      // Small delay between jobs
      await this.sleep(100)
    }
  }

  /**
   * Get next job from queue
   * @returns {Object|null} Next job or null if no jobs available
   * @private
   */
  async getNextJob() {
    try {
      const job = await this.importJobService.getNextQueuedJob()
      
      if (job) {
        // Update job status to processing
        await this.importJobService.updateJobStatus(
          job.id, 
          IMPORT_JOB_STATUS.PROCESSING,
          { started_at: new Date() }
        )
        
        // Report to health monitor
        this.healthMonitor.reportJobStarted(job.id)
        this.metricsCollector.recordJobStarted(job.id, {
          platform: job.platform,
          filename: job.filename,
          fileSize: job.file_size
        })
      }
      
      return job
      
    } catch (error) {
      const formattedError = formatLogError(error, { context: 'getNextJob' })
      console.error('Error getting next job:', formattedError)
      return null
    }
  }

  /**
   * Process a job
   * @param {Object} job - Job to process
   * @private
   */
  async processJob(job) {
    const startTime = Date.now()
    
    try {
      // Security check
      await this.securityService.validateFileAccess(job.storage_path, job.workspace_id)
      
      let result
      
      if (job.platform === 'shopee') {
        result = await this.processShopeeJob(job)
      } else {
        throw new Error(`Unsupported platform: ${job.platform}`)
      }
      
      const processingTime = Date.now() - startTime
      
      // Mark job as completed
      await this.importJobService.updateJobStatus(
        job.id,
        IMPORT_JOB_STATUS.COMPLETED,
        {
          finished_at: new Date(),
          rows_processed: result.rowsProcessed,
          processing_time_ms: processingTime
        }
      )
      
      // Report success
      this.healthMonitor.reportJobCompleted(job.id, processingTime)
      this.metricsCollector.recordJobCompleted(job.id, result, processingTime)
      
      // Record metrics in database
      await this.metricsService.recordJobMetrics(job.id, {
        processing_time_ms: processingTime,
        rows_processed: result.rowsProcessed,
        memory_usage: process.memoryUsage(),
        success: true
      })
      
      console.log(`Job ${job.id} completed successfully. Rows: ${result.rowsProcessed}, Time: ${processingTime}ms`)
      
    } catch (error) {
      throw error // Let handleJobError deal with it
    } finally {
      this.currentJob = null
    }
  }

  /**
   * Process Shopee job
   * @param {Object} job - Shopee job
   * @returns {Object} Processing result
   * @private
   */
  async processShopeeJob(job) {
    // Download file from Supabase storage
    const filePath = job.storage_path || job.filename
    console.log(`Downloading file: ${filePath}`)
    
    const { data, error } = await this.supabase.storage
      .from(this.config.bucket)
      .download(filePath)
    
    if (error) {
      throw new Error(`Storage download failed: ${error.message}`)
    }
    
    if (!data) {
      throw new Error(`No file data received for: ${filePath}`)
    }
    
    const csvData = await data.text()
    
    if (!csvData || csvData.trim().length === 0) {
      throw new Error(`Downloaded file is empty: ${filePath}`)
    }
    
    let rowsProcessed = 0
    
    // Process CSV with streaming parser
    const recordProcessor = async (batch, processedCount) => {
      const insertPromises = batch.map(async (record) => {
        // Map columns for Shopee
        const orderId = record['Order ID'] || record['order_id'] || record['OrderId'] || null
        const subid = record['SubID'] || record['subid'] || record['Tracking ID'] || null
        const orderTime = record['Order Time'] || record['Created Time'] || record['order_time'] || null
        const amount = record['Amount'] || record['Gross'] || record['amount'] || null
        const net = record['Net'] || record['Earnings'] || record['net'] || null
        const commission = record['Commission'] || record['Commission Fee'] || record['commission'] || null
        
        return this.dbPool.query(
          `INSERT INTO stg_shopee_aff (workspace_id, source_job_id, order_id, subid, order_time, amount, net, commission, raw)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [job.workspace_id, job.id, orderId, subid, orderTime, amount, net, commission, record]
        )
      })
      
      await Promise.all(insertPromises)
      rowsProcessed += batch.length
    }
    
    // Process with streaming CSV parser
    const result = await this.csvProcessor.processData(
      csvData,
      {
        columns: true,
        relax_column_count: true,
        trim: true
      },
      recordProcessor
    )
    
    return {
      rowsProcessed,
      duration: result.duration,
      metrics: result.metrics
    }
  }

  /**
   * Handle job error with retry logic
   * @param {Error} error - Error that occurred
   * @private
   */
  async handleJobError(error) {
    const processingTime = this.currentJob ? Date.now() - Date.now() : 0
    
    try {
      const formattedError = formatError(error, { 
        jobId: this.currentJob?.id,
        filename: this.currentJob?.filename 
      })
      
      const userError = formatUserError(error, { 
        jobId: this.currentJob?.id 
      })
      
      console.error('Job processing error:', formattedError)
      
      if (this.currentJob) {
        // Report to health monitor
        this.healthMonitor.reportJobFailed(this.currentJob.id, error.message)
        this.metricsCollector.recordJobFailed(this.currentJob.id, error.message, processingTime)
        
        // Check if error is retryable
        if (formattedError.retryable && this.retryHandler.canRetry(this.currentJob.id, IMPORT_JOB_STATUS.FAILED)) {
          // Schedule retry
          const retryScheduled = await this.retryHandler.scheduleRetry(
            { ...this.currentJob, error: error.message },
            async (job) => {
              console.log(`Retrying job ${job.id}`)
              await this.processJob(job)
            }
          )
          
          if (retryScheduled) {
            console.log(`Retry scheduled for job ${this.currentJob.id}`)
            return
          }
        }
        
        // Mark job as failed
        await this.importJobService.updateJobStatus(
          this.currentJob.id,
          IMPORT_JOB_STATUS.FAILED,
          {
            finished_at: new Date(),
            error: userError.message,
            error_details: formattedError,
            processing_time_ms: processingTime
          }
        )
        
        // Record error metrics
        await this.metricsService.recordJobMetrics(this.currentJob.id, {
          processing_time_ms: processingTime,
          memory_usage: process.memoryUsage(),
          success: false,
          error: formattedError
        })
        
        console.log(`Job ${this.currentJob.id} marked as failed: ${userError.message}`)
      }
      
    } catch (errorHandlingError) {
      console.error('Error while handling job error:', errorHandlingError)
    } finally {
      this.currentJob = null
    }
  }

  /**
   * Get worker status
   * @returns {Object} Worker status
   */
  getStatus() {
    return {
      workerId: this.workerId,
      isRunning: this.isRunning,
      currentJob: this.currentJob ? {
        id: this.currentJob.id,
        platform: this.currentJob.platform,
        filename: this.currentJob.filename
      } : null,
      health: this.healthMonitor.getHealthSummary(),
      metrics: this.metricsCollector.getMetricsSummary(),
      retries: this.retryHandler.getMetrics()
    }
  }

  /**
   * Utility sleep function
   * @param {number} ms - Milliseconds to sleep
   * @private
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Create and start enhanced worker
const worker = new EnhancedWorker()

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...')
  await worker.stop()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...')
  await worker.stop()
  process.exit(0)
})

// Start the worker
worker.start().catch(error => {
  console.error('Failed to start enhanced worker:', error)
  process.exit(1)
})

export default worker