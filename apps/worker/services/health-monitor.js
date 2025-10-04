import { EventEmitter } from 'events'
import { performance } from 'perf_hooks'

/**
 * Worker health monitoring and heartbeat system
 * ระบบ monitoring สุขภาพของ worker และส่ง heartbeat ทุก 30 วินาที
 * เฝ้าระวัง memory usage, CPU usage, และสถานะการทำงาน
 */
export class HealthMonitor extends EventEmitter {
  constructor(options = {}) {
    super()
    
    // Configuration
    this.heartbeatInterval = options.heartbeatInterval || 30000 // 30 seconds
    this.healthCheckInterval = options.healthCheckInterval || 5000 // 5 seconds
    this.memoryThreshold = options.memoryThreshold || 512 * 1024 * 1024 // 512MB
    this.cpuThreshold = options.cpuThreshold || 80 // 80% CPU
    this.workerId = options.workerId || `worker-${process.pid}`
    this.apiEndpoint = options.apiEndpoint || process.env.HEALTH_ENDPOINT
    
    // State tracking
    this.isRunning = false
    this.heartbeatTimer = null
    this.healthCheckTimer = null
    this.lastHeartbeat = null
    this.startTime = Date.now()
    
    // Health metrics
    this.health = {
      status: 'unknown', // 'healthy', 'warning', 'critical', 'unknown'
      uptime: 0,
      memoryUsage: {},
      cpuUsage: 0,
      activeJobs: 0,
      totalJobsProcessed: 0,
      lastError: null,
      checks: {
        memory: 'unknown',
        cpu: 'unknown',
        connectivity: 'unknown',
        jobs: 'unknown'
      }
    }
    
    // Performance tracking
    this.performanceMetrics = {
      avgJobProcessingTime: 0,
      jobsProcessedLast5Min: 0,
      errorsLast5Min: 0,
      lastJobsTimestamps: [],
      lastErrorsTimestamps: []
    }
    
    // CPU usage tracking
    this.lastCpuUsage = process.cpuUsage()
    this.lastCpuCheck = performance.now()
  }

  /**
   * Start health monitoring
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      console.warn('Health monitor is already running')
      return
    }
    
    this.isRunning = true
    this.startTime = Date.now()
    
    console.log(`Health monitor started for worker ${this.workerId}`)
    
    // Start health checks
    this.startHealthChecks()
    
    // Start heartbeat
    this.startHeartbeat()
    
    // Initial health check
    await this.performHealthCheck()
    
    this.emit('started', {
      workerId: this.workerId,
      startTime: this.startTime
    })
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (!this.isRunning) {
      return
    }
    
    this.isRunning = false
    
    // Clear timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
    
    console.log(`Health monitor stopped for worker ${this.workerId}`)
    
    this.emit('stopped', {
      workerId: this.workerId,
      uptime: Date.now() - this.startTime
    })
  }

  /**
   * Start periodic health checks
   * @private
   */
  startHealthChecks() {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.error('Health check failed:', error)
        this.health.lastError = {
          message: error.message,
          timestamp: Date.now()
        }
      })
    }, this.healthCheckInterval)
  }

  /**
   * Start heartbeat transmission
   * @private
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch(error => {
        console.error('Heartbeat failed:', error)
        this.health.checks.connectivity = 'critical'
        this.emit('heartbeatFailed', { error: error.message })
      })
    }, this.heartbeatInterval)
    
    // Send initial heartbeat
    this.sendHeartbeat().catch(console.error)
  }

  /**
   * Perform comprehensive health check
   * @returns {Promise<Object>} Health status
   */
  async performHealthCheck() {
    const now = Date.now()
    this.health.uptime = now - this.startTime
    
    // Check memory usage
    this.checkMemoryHealth()
    
    // Check CPU usage
    this.checkCpuHealth()
    
    // Check job processing health
    this.checkJobHealth()
    
    // Update overall health status
    this.updateOverallHealth()
    
    // Clean up old performance data
    this.cleanupPerformanceData()
    
    this.emit('healthCheck', this.getHealthStatus())
    
    return this.getHealthStatus()
  }

  /**
   * Check memory health
   * @private
   */
  checkMemoryHealth() {
    this.health.memoryUsage = process.memoryUsage()
    const heapUsed = this.health.memoryUsage.heapUsed
    
    if (heapUsed > this.memoryThreshold) {
      this.health.checks.memory = 'critical'
      this.emit('memoryAlert', {
        current: heapUsed,
        threshold: this.memoryThreshold,
        percentage: (heapUsed / this.memoryThreshold) * 100
      })
    } else if (heapUsed > this.memoryThreshold * 0.8) {
      this.health.checks.memory = 'warning'
      this.emit('memoryWarning', {
        current: heapUsed,
        threshold: this.memoryThreshold,
        percentage: (heapUsed / this.memoryThreshold) * 100
      })
    } else {
      this.health.checks.memory = 'healthy'
    }
  }

  /**
   * Check CPU health
   * @private
   */
  checkCpuHealth() {
    const now = performance.now()
    const currentCpuUsage = process.cpuUsage(this.lastCpuUsage)
    const timeDiff = (now - this.lastCpuCheck) * 1000 // Convert to microseconds
    
    // Calculate CPU percentage
    const cpuPercent = ((currentCpuUsage.user + currentCpuUsage.system) / timeDiff) * 100
    this.health.cpuUsage = Math.round(cpuPercent * 100) / 100
    
    // Update tracking variables
    this.lastCpuUsage = process.cpuUsage()
    this.lastCpuCheck = now
    
    if (this.health.cpuUsage > this.cpuThreshold) {
      this.health.checks.cpu = 'critical'
      this.emit('cpuAlert', {
        current: this.health.cpuUsage,
        threshold: this.cpuThreshold
      })
    } else if (this.health.cpuUsage > this.cpuThreshold * 0.8) {
      this.health.checks.cpu = 'warning'
    } else {
      this.health.checks.cpu = 'healthy'
    }
  }

  /**
   * Check job processing health
   * @private
   */
  checkJobHealth() {
    const now = Date.now()
    const fiveMinutesAgo = now - (5 * 60 * 1000)
    
    // Count recent jobs and errors
    this.performanceMetrics.jobsProcessedLast5Min = 
      this.performanceMetrics.lastJobsTimestamps
        .filter(timestamp => timestamp > fiveMinutesAgo).length
    
    this.performanceMetrics.errorsLast5Min = 
      this.performanceMetrics.lastErrorsTimestamps
        .filter(timestamp => timestamp > fiveMinutesAgo).length
    
    // Determine job health status
    if (this.performanceMetrics.errorsLast5Min > 5) {
      this.health.checks.jobs = 'critical'
    } else if (this.performanceMetrics.errorsLast5Min > 2) {
      this.health.checks.jobs = 'warning'
    } else if (this.health.activeJobs > 0 || this.performanceMetrics.jobsProcessedLast5Min > 0) {
      this.health.checks.jobs = 'healthy'
    } else {
      this.health.checks.jobs = 'idle'
    }
  }

  /**
   * Update overall health status based on individual checks
   * @private
   */
  updateOverallHealth() {
    const checks = Object.values(this.health.checks)
    
    if (checks.includes('critical')) {
      this.health.status = 'critical'
    } else if (checks.includes('warning')) {
      this.health.status = 'warning'
    } else if (checks.every(check => check === 'healthy' || check === 'idle')) {
      this.health.status = 'healthy'
    } else {
      this.health.status = 'unknown'
    }
  }

  /**
   * Send heartbeat to health endpoint
   * @returns {Promise<void>}
   */
  async sendHeartbeat() {
    const heartbeatData = {
      workerId: this.workerId,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      status: this.health.status,
      memoryUsage: this.health.memoryUsage,
      cpuUsage: this.health.cpuUsage,
      activeJobs: this.health.activeJobs,
      totalJobsProcessed: this.health.totalJobsProcessed,
      performanceMetrics: this.performanceMetrics
    }
    
    this.lastHeartbeat = heartbeatData.timestamp
    
    // Emit heartbeat event for local handling
    this.emit('heartbeat', heartbeatData)
    
    // Send to API endpoint if configured
    if (this.apiEndpoint) {
      try {
        const response = await fetch(this.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.WORKER_API_KEY || ''}`
          },
          body: JSON.stringify(heartbeatData)
        })
        
        if (!response.ok) {
          throw new Error(`Heartbeat API returned ${response.status}: ${response.statusText}`)
        }
        
        this.health.checks.connectivity = 'healthy'
        
      } catch (error) {
        console.error('Failed to send heartbeat to API:', error)
        this.health.checks.connectivity = 'critical'
        throw error
      }
    } else {
      // If no API endpoint, assume local connectivity is healthy
      this.health.checks.connectivity = 'healthy'
    }
  }

  /**
   * Report job started
   * @param {string} jobId - Job ID
   */
  reportJobStarted(jobId) {
    this.health.activeJobs++
    this.emit('jobStarted', { jobId, activeJobs: this.health.activeJobs })
  }

  /**
   * Report job completed
   * @param {string} jobId - Job ID
   * @param {number} processingTime - Processing time in milliseconds
   */
  reportJobCompleted(jobId, processingTime) {
    this.health.activeJobs = Math.max(0, this.health.activeJobs - 1)
    this.health.totalJobsProcessed++
    
    // Update performance metrics
    const now = Date.now()
    this.performanceMetrics.lastJobsTimestamps.push(now)
    
    // Update average processing time
    const totalJobs = this.health.totalJobsProcessed
    this.performanceMetrics.avgJobProcessingTime = 
      (this.performanceMetrics.avgJobProcessingTime * (totalJobs - 1) + processingTime) / totalJobs
    
    this.emit('jobCompleted', { 
      jobId, 
      processingTime, 
      activeJobs: this.health.activeJobs,
      totalJobsProcessed: this.health.totalJobsProcessed
    })
  }

  /**
   * Report job failed
   * @param {string} jobId - Job ID
   * @param {string} error - Error message
   */
  reportJobFailed(jobId, error) {
    this.health.activeJobs = Math.max(0, this.health.activeJobs - 1)
    
    // Track error
    const now = Date.now()
    this.performanceMetrics.lastErrorsTimestamps.push(now)
    this.health.lastError = {
      message: error,
      timestamp: now,
      jobId
    }
    
    this.emit('jobFailed', { 
      jobId, 
      error, 
      activeJobs: this.health.activeJobs 
    })
  }

  /**
   * Clean up old performance data to prevent memory leaks
   * @private
   */
  cleanupPerformanceData() {
    const now = Date.now()
    const fiveMinutesAgo = now - (5 * 60 * 1000)
    
    // Keep only last 5 minutes of data
    this.performanceMetrics.lastJobsTimestamps = 
      this.performanceMetrics.lastJobsTimestamps.filter(ts => ts > fiveMinutesAgo)
    
    this.performanceMetrics.lastErrorsTimestamps = 
      this.performanceMetrics.lastErrorsTimestamps.filter(ts => ts > fiveMinutesAgo)
  }

  /**
   * Get current health status
   * @returns {Object} Complete health status
   */
  getHealthStatus() {
    return {
      workerId: this.workerId,
      status: this.health.status,
      uptime: this.health.uptime,
      memoryUsage: this.health.memoryUsage,
      cpuUsage: this.health.cpuUsage,
      activeJobs: this.health.activeJobs,
      totalJobsProcessed: this.health.totalJobsProcessed,
      lastError: this.health.lastError,
      lastHeartbeat: this.lastHeartbeat,
      checks: this.health.checks,
      performanceMetrics: this.performanceMetrics,
      isRunning: this.isRunning
    }
  }

  /**
   * Get health summary for external reporting
   * @returns {Object} Health summary
   */
  getHealthSummary() {
    return {
      workerId: this.workerId,
      status: this.health.status,
      uptime: this.health.uptime,
      memoryUsagePercent: Math.round((this.health.memoryUsage.heapUsed / this.memoryThreshold) * 100),
      cpuUsage: this.health.cpuUsage,
      activeJobs: this.health.activeJobs,
      jobsProcessedLast5Min: this.performanceMetrics.jobsProcessedLast5Min,
      errorsLast5Min: this.performanceMetrics.errorsLast5Min,
      lastHeartbeat: this.lastHeartbeat
    }
  }

  /**
   * Force health check and return status
   * @returns {Promise<Object>} Health status
   */
  async checkHealth() {
    return await this.performHealthCheck()
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
 * Factory function to create health monitor
 * @param {Object} options - Configuration options
 * @returns {HealthMonitor} New health monitor instance
 */
export function createHealthMonitor(options = {}) {
  return new HealthMonitor(options)
}

/**
 * Create health monitor with environment-based configuration
 * @returns {HealthMonitor} Configured health monitor
 */
export function createHealthMonitorFromEnv() {
  const options = {
    workerId: process.env.WORKER_ID || `worker-${process.pid}`,
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL) || 30000,
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 5000,
    memoryThreshold: parseInt(process.env.MEMORY_THRESHOLD) || 512 * 1024 * 1024,
    cpuThreshold: parseInt(process.env.CPU_THRESHOLD) || 80,
    apiEndpoint: process.env.HEALTH_ENDPOINT
  }
  
  return new HealthMonitor(options)
}