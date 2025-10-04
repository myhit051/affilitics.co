import { EventEmitter } from 'events'
import { IMPORT_JOB_STATUS, validateStatusTransition } from '@aff/db'

/**
 * Job retry logic with exponential backoff
 * จัดการการ retry jobs ที่ล้มเหลวด้วย exponential backoff strategy
 * รองรับการ retry สูงสุด 3 ครั้งตามที่กำหนดใน requirements
 */
export class RetryHandler extends EventEmitter {
  constructor(options = {}) {
    super()
    
    // Configuration
    this.maxRetries = options.maxRetries || 3
    this.baseDelay = options.baseDelay || 1000 // Start with 1 second
    this.maxDelay = options.maxDelay || 300000 // Max 5 minutes
    this.backoffMultiplier = options.backoffMultiplier || 2
    this.jitterEnabled = options.jitterEnabled !== false // Enable jitter by default
    
    // State tracking
    this.retryAttempts = new Map() // jobId -> attempt count
    this.retryTimers = new Map() // jobId -> timer reference
    this.failureReasons = new Map() // jobId -> [reasons]
    
    // Metrics
    this.metrics = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageRetryDelay: 0,
      retrysByAttempt: [0, 0, 0, 0] // Index 0 = first attempt, 1-3 = retry attempts
    }
  }

  /**
   * Check if job can be retried
   * @param {string} jobId - Job ID
   * @param {string} currentStatus - Current job status
   * @returns {boolean} Whether job can be retried
   */
  canRetry(jobId, currentStatus) {
    // Only failed jobs can be retried
    if (currentStatus !== IMPORT_JOB_STATUS.FAILED) {
      return false
    }
    
    const attempts = this.retryAttempts.get(jobId) || 0
    return attempts < this.maxRetries
  }

  /**
   * Calculate delay for next retry using exponential backoff
   * @param {number} attemptNumber - Current attempt number (0-based)
   * @param {string} failureReason - Reason for failure (for smart backoff)
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attemptNumber, failureReason = '') {
    // Base exponential backoff
    let delay = this.baseDelay * Math.pow(this.backoffMultiplier, attemptNumber)
    
    // Smart backoff based on failure type
    if (failureReason.toLowerCase().includes('timeout')) {
      delay *= 2 // Longer delay for timeout errors
    } else if (failureReason.toLowerCase().includes('memory')) {
      delay *= 1.5 // Moderate delay for memory errors
    } else if (failureReason.toLowerCase().includes('connection')) {
      delay *= 3 // Much longer delay for connection errors
    }
    
    // Apply jitter to prevent thundering herd
    if (this.jitterEnabled) {
      const jitter = Math.random() * 0.1 * delay // ±10% jitter
      delay += jitter
    }
    
    // Ensure delay is within bounds
    delay = Math.min(delay, this.maxDelay)
    delay = Math.max(delay, this.baseDelay)
    
    return Math.round(delay)
  }

  /**
   * Schedule retry for a failed job
   * @param {Object} job - Job object with id, status, error
   * @param {Function} retryCallback - Function to call when retrying
   * @returns {Promise<boolean>} Whether retry was scheduled
   */
  async scheduleRetry(job, retryCallback) {
    const { id: jobId, status, error: failureReason } = job
    
    if (!this.canRetry(jobId, status)) {
      this.emit('retryLimitExceeded', {
        jobId,
        attempts: this.retryAttempts.get(jobId) || 0,
        maxRetries: this.maxRetries,
        reasons: this.failureReasons.get(jobId) || []
      })
      return false
    }
    
    // Track retry attempt
    const currentAttempts = this.retryAttempts.get(jobId) || 0
    const attemptNumber = currentAttempts
    this.retryAttempts.set(jobId, currentAttempts + 1)
    
    // Track failure reason
    const reasons = this.failureReasons.get(jobId) || []
    reasons.push({
      attempt: attemptNumber,
      reason: failureReason,
      timestamp: Date.now()
    })
    this.failureReasons.set(jobId, reasons)
    
    // Calculate delay
    const delay = this.calculateDelay(attemptNumber, failureReason)
    
    // Update metrics
    this.metrics.totalRetries++
    this.metrics.retrysByAttempt[attemptNumber + 1]++
    this.metrics.averageRetryDelay = 
      (this.metrics.averageRetryDelay * (this.metrics.totalRetries - 1) + delay) / 
      this.metrics.totalRetries
    
    this.emit('retryScheduled', {
      jobId,
      attemptNumber: attemptNumber + 1,
      delay,
      totalAttempts: currentAttempts + 1,
      maxRetries: this.maxRetries,
      failureReason
    })
    
    // Clear any existing timer
    this.clearRetryTimer(jobId)
    
    // Schedule retry
    const timer = setTimeout(async () => {
      try {
        this.retryTimers.delete(jobId)
        
        this.emit('retryStarted', {
          jobId,
          attemptNumber: attemptNumber + 1,
          totalAttempts: currentAttempts + 1
        })
        
        // Execute retry callback
        await retryCallback(job)
        
        // Mark as successful retry
        this.metrics.successfulRetries++
        this.emit('retrySucceeded', {
          jobId,
          attemptNumber: attemptNumber + 1,
          totalAttempts: currentAttempts + 1
        })
        
        // Clean up tracking data
        this.cleanupJobData(jobId)
        
      } catch (retryError) {
        this.metrics.failedRetries++
        this.emit('retryFailed', {
          jobId,
          attemptNumber: attemptNumber + 1,
          error: retryError.message,
          canRetryAgain: this.canRetry(jobId, IMPORT_JOB_STATUS.FAILED)
        })
        
        // Update failure reason for next retry
        const updatedJob = { ...job, error: retryError.message }
        
        // Try again if possible
        if (this.canRetry(jobId, IMPORT_JOB_STATUS.FAILED)) {
          await this.scheduleRetry(updatedJob, retryCallback)
        } else {
          this.emit('retryLimitExceeded', {
            jobId,
            attempts: this.retryAttempts.get(jobId) || 0,
            maxRetries: this.maxRetries,
            reasons: this.failureReasons.get(jobId) || []
          })
          this.cleanupJobData(jobId)
        }
      }
    }, delay)
    
    this.retryTimers.set(jobId, timer)
    return true
  }

  /**
   * Cancel scheduled retry for a job
   * @param {string} jobId - Job ID
   * @returns {boolean} Whether retry was cancelled
   */
  cancelRetry(jobId) {
    const timer = this.retryTimers.get(jobId)
    if (timer) {
      clearTimeout(timer)
      this.retryTimers.delete(jobId)
      
      this.emit('retryCancelled', {
        jobId,
        attemptNumber: (this.retryAttempts.get(jobId) || 0) + 1
      })
      
      return true
    }
    return false
  }

  /**
   * Clear retry timer for a job
   * @param {string} jobId - Job ID
   * @private
   */
  clearRetryTimer(jobId) {
    const timer = this.retryTimers.get(jobId)
    if (timer) {
      clearTimeout(timer)
      this.retryTimers.delete(jobId)
    }
  }

  /**
   * Clean up tracking data for a job
   * @param {string} jobId - Job ID
   * @private
   */
  cleanupJobData(jobId) {
    this.retryAttempts.delete(jobId)
    this.failureReasons.delete(jobId)
    this.clearRetryTimer(jobId)
  }

  /**
   * Get retry information for a job
   * @param {string} jobId - Job ID
   * @returns {Object} Retry information
   */
  getRetryInfo(jobId) {
    const attempts = this.retryAttempts.get(jobId) || 0
    const reasons = this.failureReasons.get(jobId) || []
    const hasScheduledRetry = this.retryTimers.has(jobId)
    
    return {
      jobId,
      attempts,
      maxRetries: this.maxRetries,
      canRetry: this.canRetry(jobId, IMPORT_JOB_STATUS.FAILED),
      hasScheduledRetry,
      failureReasons: reasons,
      nextRetryDelay: hasScheduledRetry ? 
        this.calculateDelay(attempts, reasons[reasons.length - 1]?.reason) : null
    }
  }

  /**
   * Get all active retries
   * @returns {Array} Array of active retry information
   */
  getActiveRetries() {
    const activeRetries = []
    
    for (const [jobId] of this.retryTimers) {
      activeRetries.push(this.getRetryInfo(jobId))
    }
    
    return activeRetries
  }

  /**
   * Get retry metrics
   * @returns {Object} Retry metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeRetries: this.retryTimers.size,
      jobsBeingTracked: this.retryAttempts.size,
      successRate: this.metrics.totalRetries > 0 ? 
        this.metrics.successfulRetries / this.metrics.totalRetries : 0
    }
  }

  /**
   * Reset all retry state (useful for testing)
   */
  reset() {
    // Clear all timers
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer)
    }
    
    // Clear all tracking data
    this.retryAttempts.clear()
    this.retryTimers.clear()
    this.failureReasons.clear()
    
    // Reset metrics
    this.metrics = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageRetryDelay: 0,
      retrysByAttempt: [0, 0, 0, 0]
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.reset()
    this.removeAllListeners()
  }
}

/**
 * Factory function to create retry handler
 * @param {Object} options - Configuration options
 * @returns {RetryHandler} New retry handler instance
 */
export function createRetryHandler(options = {}) {
  return new RetryHandler(options)
}

/**
 * Helper function to create retry handler with common configurations
 * @param {string} profile - Configuration profile ('fast', 'balanced', 'conservative')
 * @returns {RetryHandler} Configured retry handler
 */
export function createRetryHandlerWithProfile(profile = 'balanced') {
  const profiles = {
    fast: {
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 30000, // 30 seconds
      backoffMultiplier: 1.5
    },
    balanced: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 300000, // 5 minutes
      backoffMultiplier: 2
    },
    conservative: {
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 600000, // 10 minutes
      backoffMultiplier: 3
    }
  }
  
  const config = profiles[profile] || profiles.balanced
  return new RetryHandler(config)
}

/**
 * Utility function to determine if error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} Whether error is retryable
 */
export function isRetryableError(error) {
  const message = error.message.toLowerCase()
  
  // Network/connection errors are usually retryable
  if (message.includes('connection') || 
      message.includes('timeout') || 
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('enotfound')) {
    return true
  }
  
  // Memory errors might be retryable after cleanup
  if (message.includes('memory') || message.includes('heap')) {
    return true
  }
  
  // Rate limiting errors are retryable
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return true
  }
  
  // File permission or malformed data errors are usually not retryable
  if (message.includes('permission') || 
      message.includes('malformed') ||
      message.includes('invalid format') ||
      message.includes('parse error')) {
    return false
  }
  
  // Default to retryable for unknown errors
  return true
}