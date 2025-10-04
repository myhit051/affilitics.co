import { EventEmitter } from 'events'
import { performance } from 'perf_hooks'

/**
 * Performance metrics collection in worker
 * รวบรวม metrics ต่าง ๆ เกี่ยวกับ performance ของ worker
 * สำหรับ monitoring และ optimization
 */
export class MetricsCollector extends EventEmitter {
  constructor(options = {}) {
    super()
    
    // Configuration
    this.collectInterval = options.collectInterval || 30000 // 30 seconds
    this.retentionPeriod = options.retentionPeriod || 3600000 // 1 hour
    this.apiEndpoint = options.apiEndpoint || process.env.METRICS_ENDPOINT
    this.workerId = options.workerId || `worker-${process.pid}`
    this.batchSize = options.batchSize || 100 // Send metrics in batches
    
    // State tracking
    this.isCollecting = false
    this.collectionTimer = null
    this.startTime = Date.now()
    
    // Metrics storage
    this.metrics = {
      performance: [],
      jobs: [],
      errors: [],
      system: [],
      custom: []
    }
    
    // Current counters
    this.counters = {
      jobsProcessed: 0,
      jobsSucceeded: 0,
      jobsFailed: 0,
      rowsProcessed: 0,
      errorsOccurred: 0,
      retriesPerformed: 0,
      heartbeatsSent: 0,
      apiCallsMade: 0
    }
    
    // Performance tracking
    this.performance = {
      jobProcessingTimes: [],
      csvParsingTimes: [],
      dbWriteTimes: [],
      memoryUsageHistory: [],
      cpuUsageHistory: [],
      throughputHistory: []
    }
    
    // Aggregated metrics
    this.aggregated = {
      avgJobProcessingTime: 0,
      avgCsvParsingTime: 0,
      avgDbWriteTime: 0,
      peakMemoryUsage: 0,
      avgMemoryUsage: 0,
      peakCpuUsage: 0,
      avgCpuUsage: 0,
      throughputPerMinute: 0,
      errorRate: 0,
      successRate: 0,
      retryRate: 0
    }
    
    // System information
    this.systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      workerId: this.workerId,
      startTime: this.startTime
    }
  }

  /**
   * Start metrics collection
   */
  start() {
    if (this.isCollecting) {
      console.warn('Metrics collector is already running')
      return
    }
    
    this.isCollecting = true
    this.startTime = Date.now()
    
    // Start periodic collection
    this.collectionTimer = setInterval(() => {
      this.collectSystemMetrics()
      this.calculateAggregatedMetrics()
      this.cleanupOldMetrics()
      this.sendMetricsToAPI().catch(console.error)
    }, this.collectInterval)
    
    // Initial collection
    this.collectSystemMetrics()
    
    console.log(`Metrics collector started for worker ${this.workerId}`)
    
    this.emit('started', {
      workerId: this.workerId,
      startTime: this.startTime
    })
  }

  /**
   * Stop metrics collection
   */
  stop() {
    if (!this.isCollecting) {
      return
    }
    
    this.isCollecting = false
    
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer)
      this.collectionTimer = null
    }
    
    // Send final metrics
    this.sendMetricsToAPI().catch(console.error)
    
    console.log(`Metrics collector stopped for worker ${this.workerId}`)
    
    this.emit('stopped', {
      workerId: this.workerId,
      duration: Date.now() - this.startTime
    })
  }

  /**
   * Record job started
   * @param {string} jobId - Job ID
   * @param {Object} jobDetails - Job details
   */
  recordJobStarted(jobId, jobDetails = {}) {
    const metric = {
      type: 'job_started',
      timestamp: Date.now(),
      jobId,
      details: jobDetails,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    }
    
    this.metrics.jobs.push(metric)
    this.emit('jobStarted', metric)
  }

  /**
   * Record job completed
   * @param {string} jobId - Job ID
   * @param {Object} results - Job results
   * @param {number} processingTime - Processing time in milliseconds
   */
  recordJobCompleted(jobId, results = {}, processingTime = 0) {
    const metric = {
      type: 'job_completed',
      timestamp: Date.now(),
      jobId,
      processingTime,
      rowsProcessed: results.rowsProcessed || 0,
      fileSize: results.fileSize || 0,
      results,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    }
    
    this.metrics.jobs.push(metric)
    this.performance.jobProcessingTimes.push(processingTime)
    
    // Update counters
    this.counters.jobsProcessed++
    this.counters.jobsSucceeded++
    this.counters.rowsProcessed += results.rowsProcessed || 0
    
    this.emit('jobCompleted', metric)
  }

  /**
   * Record job failed
   * @param {string} jobId - Job ID
   * @param {string} error - Error message
   * @param {number} processingTime - Processing time before failure
   */
  recordJobFailed(jobId, error, processingTime = 0) {
    const metric = {
      type: 'job_failed',
      timestamp: Date.now(),
      jobId,
      error,
      processingTime,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    }
    
    this.metrics.jobs.push(metric)
    this.metrics.errors.push(metric)
    
    // Update counters
    this.counters.jobsProcessed++
    this.counters.jobsFailed++
    this.counters.errorsOccurred++
    
    this.emit('jobFailed', metric)
  }

  /**
   * Record CSV parsing performance
   * @param {string} jobId - Job ID
   * @param {number} parsingTime - Parsing time in milliseconds
   * @param {number} rowCount - Number of rows parsed
   * @param {number} fileSize - File size in bytes
   */
  recordCsvParsing(jobId, parsingTime, rowCount, fileSize) {
    const metric = {
      type: 'csv_parsing',
      timestamp: Date.now(),
      jobId,
      parsingTime,
      rowCount,
      fileSize,
      throughput: rowCount / (parsingTime / 1000), // rows per second
      memoryUsage: process.memoryUsage()
    }
    
    this.metrics.performance.push(metric)
    this.performance.csvParsingTimes.push(parsingTime)
    
    this.emit('csvParsing', metric)
  }

  /**
   * Record database write performance
   * @param {string} jobId - Job ID
   * @param {number} writeTime - Write time in milliseconds
   * @param {number} rowCount - Number of rows written
   * @param {string} operation - Type of database operation
   */
  recordDbWrite(jobId, writeTime, rowCount, operation = 'insert') {
    const metric = {
      type: 'db_write',
      timestamp: Date.now(),
      jobId,
      writeTime,
      rowCount,
      operation,
      throughput: rowCount / (writeTime / 1000), // rows per second
      memoryUsage: process.memoryUsage()
    }
    
    this.metrics.performance.push(metric)
    this.performance.dbWriteTimes.push(writeTime)
    
    this.emit('dbWrite', metric)
  }

  /**
   * Record retry attempt
   * @param {string} jobId - Job ID
   * @param {number} attemptNumber - Retry attempt number
   * @param {string} reason - Reason for retry
   */
  recordRetry(jobId, attemptNumber, reason) {
    const metric = {
      type: 'retry_attempt',
      timestamp: Date.now(),
      jobId,
      attemptNumber,
      reason,
      memoryUsage: process.memoryUsage()
    }
    
    this.metrics.performance.push(metric)
    this.counters.retriesPerformed++
    
    this.emit('retry', metric)
  }

  /**
   * Record heartbeat sent
   * @param {Object} heartbeatData - Heartbeat data
   */
  recordHeartbeat(heartbeatData) {
    const metric = {
      type: 'heartbeat',
      timestamp: Date.now(),
      data: heartbeatData,
      memoryUsage: process.memoryUsage()
    }
    
    this.metrics.system.push(metric)
    this.counters.heartbeatsSent++
    
    this.emit('heartbeat', metric)
  }

  /**
   * Record custom metric
   * @param {string} name - Metric name
   * @param {*} value - Metric value
   * @param {Object} metadata - Additional metadata
   */
  recordCustomMetric(name, value, metadata = {}) {
    const metric = {
      type: 'custom',
      name,
      value,
      timestamp: Date.now(),
      metadata,
      memoryUsage: process.memoryUsage()
    }
    
    this.metrics.custom.push(metric)
    
    this.emit('customMetric', metric)
  }

  /**
   * Collect system metrics
   * @private
   */
  collectSystemMetrics() {
    const now = Date.now()
    const memUsage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()
    
    // Calculate CPU percentage (simplified)
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000 // Rough estimate
    
    const systemMetric = {
      type: 'system_snapshot',
      timestamp: now,
      memoryUsage: memUsage,
      cpuUsage: cpuUsage,
      cpuPercent,
      uptime: now - this.startTime,
      counters: { ...this.counters }
    }
    
    this.metrics.system.push(systemMetric)
    this.performance.memoryUsageHistory.push({
      timestamp: now,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    })
    
    this.performance.cpuUsageHistory.push({
      timestamp: now,
      user: cpuUsage.user,
      system: cpuUsage.system,
      percent: cpuPercent
    })
    
    this.emit('systemMetrics', systemMetric)
  }

  /**
   * Calculate aggregated metrics
   * @private
   */
  calculateAggregatedMetrics() {
    // Job processing time
    if (this.performance.jobProcessingTimes.length > 0) {
      this.aggregated.avgJobProcessingTime = 
        this.performance.jobProcessingTimes.reduce((a, b) => a + b, 0) / 
        this.performance.jobProcessingTimes.length
    }
    
    // CSV parsing time
    if (this.performance.csvParsingTimes.length > 0) {
      this.aggregated.avgCsvParsingTime = 
        this.performance.csvParsingTimes.reduce((a, b) => a + b, 0) / 
        this.performance.csvParsingTimes.length
    }
    
    // Database write time
    if (this.performance.dbWriteTimes.length > 0) {
      this.aggregated.avgDbWriteTime = 
        this.performance.dbWriteTimes.reduce((a, b) => a + b, 0) / 
        this.performance.dbWriteTimes.length
    }
    
    // Memory usage
    if (this.performance.memoryUsageHistory.length > 0) {
      const memUsages = this.performance.memoryUsageHistory.map(m => m.heapUsed)
      this.aggregated.peakMemoryUsage = Math.max(...memUsages)
      this.aggregated.avgMemoryUsage = memUsages.reduce((a, b) => a + b, 0) / memUsages.length
    }
    
    // CPU usage
    if (this.performance.cpuUsageHistory.length > 0) {
      const cpuUsages = this.performance.cpuUsageHistory.map(c => c.percent)
      this.aggregated.peakCpuUsage = Math.max(...cpuUsages)
      this.aggregated.avgCpuUsage = cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length
    }
    
    // Rates
    const totalJobs = this.counters.jobsProcessed
    if (totalJobs > 0) {
      this.aggregated.successRate = this.counters.jobsSucceeded / totalJobs
      this.aggregated.errorRate = this.counters.jobsFailed / totalJobs
      this.aggregated.retryRate = this.counters.retriesPerformed / totalJobs
    }
    
    // Throughput (jobs per minute)
    const uptimeMinutes = (Date.now() - this.startTime) / 60000
    if (uptimeMinutes > 0) {
      this.aggregated.throughputPerMinute = totalJobs / uptimeMinutes
    }
  }

  /**
   * Clean up old metrics to prevent memory leaks
   * @private
   */
  cleanupOldMetrics() {
    const cutoffTime = Date.now() - this.retentionPeriod
    
    // Clean up each metric type
    Object.keys(this.metrics).forEach(key => {
      this.metrics[key] = this.metrics[key].filter(metric => 
        metric.timestamp > cutoffTime
      )
    })
    
    // Clean up performance history
    Object.keys(this.performance).forEach(key => {
      if (Array.isArray(this.performance[key])) {
        this.performance[key] = this.performance[key].filter(item => 
          !item.timestamp || item.timestamp > cutoffTime
        )
        
        // Keep only recent performance times (no timestamp)
        if (!this.performance[key][0]?.timestamp && this.performance[key].length > 1000) {
          this.performance[key] = this.performance[key].slice(-1000)
        }
      }
    })
  }

  /**
   * Send metrics to API endpoint
   * @private
   */
  async sendMetricsToAPI() {
    if (!this.apiEndpoint || !this.isCollecting) {
      return
    }
    
    try {
      const payload = {
        workerId: this.workerId,
        timestamp: Date.now(),
        systemInfo: this.systemInfo,
        counters: this.counters,
        aggregated: this.aggregated,
        recentMetrics: this.getRecentMetrics(),
        uptime: Date.now() - this.startTime
      }
      
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.WORKER_API_KEY || ''}`
        },
        body: JSON.stringify(payload)
      })
      
      if (!response.ok) {
        throw new Error(`Metrics API returned ${response.status}: ${response.statusText}`)
      }
      
      this.counters.apiCallsMade++
      this.emit('metricsSent', { payload })
      
    } catch (error) {
      console.error('Failed to send metrics to API:', error)
      this.emit('metricsError', { error: error.message })
    }
  }

  /**
   * Get recent metrics for API transmission
   * @private
   * @returns {Object} Recent metrics
   */
  getRecentMetrics() {
    const recent = {}
    const cutoffTime = Date.now() - 300000 // Last 5 minutes
    
    Object.keys(this.metrics).forEach(key => {
      recent[key] = this.metrics[key]
        .filter(metric => metric.timestamp > cutoffTime)
        .slice(-this.batchSize) // Limit batch size
    })
    
    return recent
  }

  /**
   * Get current metrics summary
   * @returns {Object} Metrics summary
   */
  getMetricsSummary() {
    return {
      workerId: this.workerId,
      uptime: Date.now() - this.startTime,
      counters: { ...this.counters },
      aggregated: { ...this.aggregated },
      systemInfo: { ...this.systemInfo },
      isCollecting: this.isCollecting,
      metricsCount: Object.values(this.metrics).reduce((total, arr) => total + arr.length, 0)
    }
  }

  /**
   * Get detailed metrics
   * @param {string} type - Metric type ('all', 'performance', 'jobs', 'errors', 'system', 'custom')
   * @param {number} limit - Maximum number of metrics to return
   * @returns {Array} Metrics array
   */
  getMetrics(type = 'all', limit = 100) {
    if (type === 'all') {
      const allMetrics = []
      Object.values(this.metrics).forEach(arr => allMetrics.push(...arr))
      return allMetrics
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit)
    }
    
    if (this.metrics[type]) {
      return this.metrics[type]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit)
    }
    
    return []
  }

  /**
   * Export metrics for external analysis
   * @returns {Object} Complete metrics export
   */
  exportMetrics() {
    return {
      workerId: this.workerId,
      exportTime: Date.now(),
      startTime: this.startTime,
      uptime: Date.now() - this.startTime,
      systemInfo: this.systemInfo,
      counters: this.counters,
      aggregated: this.aggregated,
      metrics: this.metrics,
      performance: this.performance
    }
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.startTime = Date.now()
    
    // Reset counters
    Object.keys(this.counters).forEach(key => {
      this.counters[key] = 0
    })
    
    // Reset metrics
    Object.keys(this.metrics).forEach(key => {
      this.metrics[key] = []
    })
    
    // Reset performance tracking
    Object.keys(this.performance).forEach(key => {
      if (Array.isArray(this.performance[key])) {
        this.performance[key] = []
      }
    })
    
    // Reset aggregated metrics
    Object.keys(this.aggregated).forEach(key => {
      this.aggregated[key] = 0
    })
    
    this.emit('reset')
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stop()
    this.removeAllListeners()
  }
}

/**
 * Factory function to create metrics collector
 * @param {Object} options - Configuration options
 * @returns {MetricsCollector} New metrics collector instance
 */
export function createMetricsCollector(options = {}) {
  return new MetricsCollector(options)
}

/**
 * Create metrics collector with environment-based configuration
 * @returns {MetricsCollector} Configured metrics collector
 */
export function createMetricsCollectorFromEnv() {
  const options = {
    workerId: process.env.WORKER_ID || `worker-${process.pid}`,
    collectInterval: parseInt(process.env.METRICS_COLLECT_INTERVAL) || 30000,
    retentionPeriod: parseInt(process.env.METRICS_RETENTION_PERIOD) || 3600000,
    apiEndpoint: process.env.METRICS_ENDPOINT,
    batchSize: parseInt(process.env.METRICS_BATCH_SIZE) || 100
  }
  
  return new MetricsCollector(options)
}