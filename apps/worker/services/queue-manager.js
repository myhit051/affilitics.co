import { EventEmitter } from 'events'

/**
 * Queue Manager for Concurrent Processing Control
 *
 * จัดการ queue และควบคุมจำนวน concurrent processing
 * เพื่อป้องกันการใช้ resources เกินขีดจำกัด
 *
 * เป้าหมาย:
 * - รองรับ 100+ concurrent workspaces
 * - จำกัดจำนวน jobs ที่ประมวลผลพร้อมกัน
 * - Priority-based job scheduling
 * - Fair resource distribution across workspaces
 * - Job throttling และ rate limiting
 */
export class QueueManager extends EventEmitter {
  constructor(options = {}) {
    super()

    // Configuration
    this.maxConcurrentJobs = options.maxConcurrentJobs || 5 // Maximum jobs processing at once
    this.maxJobsPerWorkspace = options.maxJobsPerWorkspace || 2 // Max concurrent jobs per workspace
    this.maxQueueSize = options.maxQueueSize || 1000 // Maximum queued jobs
    this.jobTimeout = options.jobTimeout || 300000 // 5 minutes timeout
    this.priorityLevels = options.priorityLevels || 10 // Priority levels (1-10)
    this.enableFairScheduling = options.enableFairScheduling !== false // Fair scheduling by default

    // State
    this.isRunning = false
    this.queues = new Map() // Priority queues (1-10)
    this.activeJobs = new Map() // Currently processing jobs
    this.workspaceJobs = new Map() // Jobs per workspace
    this.jobMetadata = new Map() // Job metadata storage
    this.processingInterval = null

    // Statistics
    this.stats = {
      totalJobsQueued: 0,
      totalJobsProcessed: 0,
      totalJobsFailed: 0,
      totalJobsTimedOut: 0,
      totalJobsRejected: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0,
      peakConcurrency: 0,
      queueSizeHistory: []
    }

    // Initialize priority queues
    for (let i = 1; i <= this.priorityLevels; i++) {
      this.queues.set(i, [])
    }

    // Workspace fairness tracking
    this.workspaceStats = new Map()
  }

  /**
   * Start the queue manager
   */
  start() {
    if (this.isRunning) {
      console.warn('Queue manager is already running')
      return
    }

    console.log(`Starting queue manager (max concurrent: ${this.maxConcurrentJobs})`)

    this.isRunning = true

    // Start processing loop
    this.processingInterval = setInterval(() => {
      this.processQueue()
    }, 100) // Check every 100ms

    this.emit('started', {
      maxConcurrentJobs: this.maxConcurrentJobs,
      maxJobsPerWorkspace: this.maxJobsPerWorkspace
    })
  }

  /**
   * Stop the queue manager
   */
  async stop() {
    if (!this.isRunning) {
      return
    }

    console.log('Stopping queue manager...')

    this.isRunning = false

    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }

    // Wait for active jobs to complete (with timeout)
    const waitTimeout = 30000 // 30 seconds
    const startWait = Date.now()

    while (this.activeJobs.size > 0 && Date.now() - startWait < waitTimeout) {
      await this.sleep(100)
    }

    if (this.activeJobs.size > 0) {
      console.warn(`Queue manager stopped with ${this.activeJobs.size} active jobs`)
    }

    this.emit('stopped', {
      activeJobs: this.activeJobs.size,
      queuedJobs: this.getTotalQueueSize()
    })
  }

  /**
   * Enqueue a job
   * @param {Object} job - Job to enqueue
   * @param {Object} options - Job options
   * @returns {Object} Enqueue result
   */
  enqueue(job, options = {}) {
    // Validate job
    if (!job.id) {
      throw new Error('Job must have an id')
    }

    if (!job.workspaceId) {
      throw new Error('Job must have a workspaceId')
    }

    // Check if queue is full
    const currentQueueSize = this.getTotalQueueSize()
    if (currentQueueSize >= this.maxQueueSize) {
      this.stats.totalJobsRejected++

      this.emit('jobRejected', {
        jobId: job.id,
        reason: 'queue_full',
        queueSize: currentQueueSize,
        maxSize: this.maxQueueSize
      })

      return {
        success: false,
        jobId: job.id,
        reason: 'queue_full',
        queueSize: currentQueueSize,
        position: null
      }
    }

    // Check workspace limits
    const workspaceJobCount = this.getWorkspaceActiveJobCount(job.workspaceId)
    const workspaceQueuedCount = this.getWorkspaceQueuedJobCount(job.workspaceId)

    // Determine priority
    const priority = this.calculateJobPriority(job, options)

    // Create job entry
    const jobEntry = {
      ...job,
      priority,
      enqueuedAt: Date.now(),
      processor: options.processor,
      timeout: options.timeout || this.jobTimeout,
      metadata: options.metadata || {}
    }

    // Add to appropriate priority queue
    const queue = this.queues.get(priority)
    queue.push(jobEntry)

    // Store metadata
    this.jobMetadata.set(job.id, {
      ...jobEntry,
      status: 'queued',
      enqueuedAt: Date.now(),
      workspaceId: job.workspaceId
    })

    // Update statistics
    this.stats.totalJobsQueued++
    this.updateWorkspaceStats(job.workspaceId, 'queued')

    const position = this.calculateQueuePosition(job.id, priority)

    this.emit('jobQueued', {
      jobId: job.id,
      workspaceId: job.workspaceId,
      priority,
      position,
      queueSize: currentQueueSize + 1
    })

    return {
      success: true,
      jobId: job.id,
      priority,
      position,
      queueSize: currentQueueSize + 1,
      estimatedWaitTime: this.estimateWaitTime(position)
    }
  }

  /**
   * Process queue and start jobs
   * @private
   */
  async processQueue() {
    if (!this.isRunning) {
      return
    }

    // Check if we can process more jobs
    while (this.canProcessMoreJobs()) {
      const nextJob = this.getNextJob()

      if (!nextJob) {
        break // No more jobs in queue
      }

      // Start processing the job
      await this.startJob(nextJob)
    }

    // Check for timed out jobs
    this.checkJobTimeouts()

    // Record queue size for statistics
    this.recordQueueSize()
  }

  /**
   * Check if we can process more jobs
   * @private
   */
  canProcessMoreJobs() {
    return this.activeJobs.size < this.maxConcurrentJobs
  }

  /**
   * Get next job from queue based on priority and fairness
   * @private
   */
  getNextJob() {
    // Find highest priority non-empty queue
    for (let priority = this.priorityLevels; priority >= 1; priority--) {
      const queue = this.queues.get(priority)

      if (queue.length === 0) {
        continue
      }

      // If fair scheduling is enabled, check workspace limits
      if (this.enableFairScheduling) {
        // Try to find a job from a workspace that hasn't hit its limit
        for (let i = 0; i < queue.length; i++) {
          const job = queue[i]
          const workspaceActiveJobs = this.getWorkspaceActiveJobCount(job.workspaceId)

          if (workspaceActiveJobs < this.maxJobsPerWorkspace) {
            // Remove job from queue
            queue.splice(i, 1)
            return job
          }
        }

        // If all workspaces at this priority are at limit, continue to next priority
        continue
      } else {
        // Simple FIFO without fairness
        return queue.shift()
      }
    }

    return null // No jobs available
  }

  /**
   * Start processing a job
   * @private
   */
  async startJob(job) {
    const startTime = Date.now()
    const waitTime = startTime - job.enqueuedAt

    // Update statistics
    this.updateAverageWaitTime(waitTime)
    this.updateWorkspaceStats(job.workspaceId, 'started')

    // Add to active jobs
    this.activeJobs.set(job.id, {
      ...job,
      startedAt: startTime,
      timeoutAt: startTime + job.timeout
    })

    // Update workspace tracking
    this.addWorkspaceJob(job.workspaceId, job.id)

    // Update job metadata
    const metadata = this.jobMetadata.get(job.id)
    if (metadata) {
      metadata.status = 'processing'
      metadata.startedAt = startTime
    }

    // Update peak concurrency
    if (this.activeJobs.size > this.stats.peakConcurrency) {
      this.stats.peakConcurrency = this.activeJobs.size
    }

    this.emit('jobStarted', {
      jobId: job.id,
      workspaceId: job.workspaceId,
      priority: job.priority,
      waitTime,
      activeJobs: this.activeJobs.size
    })

    // Process the job
    try {
      if (job.processor && typeof job.processor === 'function') {
        await job.processor(job)
      }

      // Job completed successfully
      await this.completeJob(job.id, { success: true })

    } catch (error) {
      // Job failed
      await this.completeJob(job.id, {
        success: false,
        error: error.message,
        stack: error.stack
      })
    }
  }

  /**
   * Complete a job
   * @param {string} jobId - Job ID
   * @param {Object} result - Job result
   */
  async completeJob(jobId, result = {}) {
    const activeJob = this.activeJobs.get(jobId)

    if (!activeJob) {
      console.warn(`Job ${jobId} not found in active jobs`)
      return
    }

    const processingTime = Date.now() - activeJob.startedAt

    // Update statistics
    if (result.success) {
      this.stats.totalJobsProcessed++
      this.updateWorkspaceStats(activeJob.workspaceId, 'completed')
    } else {
      this.stats.totalJobsFailed++
      this.updateWorkspaceStats(activeJob.workspaceId, 'failed')
    }

    this.updateAverageProcessingTime(processingTime)

    // Remove from active jobs
    this.activeJobs.delete(jobId)

    // Remove from workspace tracking
    this.removeWorkspaceJob(activeJob.workspaceId, jobId)

    // Update job metadata
    const metadata = this.jobMetadata.get(jobId)
    if (metadata) {
      metadata.status = result.success ? 'completed' : 'failed'
      metadata.completedAt = Date.now()
      metadata.processingTime = processingTime
      metadata.result = result
    }

    this.emit('jobCompleted', {
      jobId,
      workspaceId: activeJob.workspaceId,
      success: result.success,
      processingTime,
      activeJobs: this.activeJobs.size,
      error: result.error
    })

    // Trigger queue processing
    setImmediate(() => this.processQueue())
  }

  /**
   * Cancel a job
   * @param {string} jobId - Job ID to cancel
   * @returns {boolean} Whether job was cancelled
   */
  cancelJob(jobId) {
    // Check if job is in queue
    for (const [priority, queue] of this.queues) {
      const index = queue.findIndex(job => job.id === jobId)
      if (index !== -1) {
        const job = queue.splice(index, 1)[0]

        this.emit('jobCancelled', {
          jobId,
          workspaceId: job.workspaceId,
          priority,
          status: 'queued'
        })

        this.jobMetadata.delete(jobId)
        return true
      }
    }

    // Check if job is active (can't cancel active jobs)
    if (this.activeJobs.has(jobId)) {
      this.emit('cancelFailed', {
        jobId,
        reason: 'job_is_processing'
      })
      return false
    }

    return false
  }

  /**
   * Check for timed out jobs
   * @private
   */
  checkJobTimeouts() {
    const now = Date.now()

    for (const [jobId, job] of this.activeJobs) {
      if (now >= job.timeoutAt) {
        console.warn(`Job ${jobId} timed out after ${job.timeout}ms`)

        this.stats.totalJobsTimedOut++

        this.emit('jobTimeout', {
          jobId,
          workspaceId: job.workspaceId,
          timeout: job.timeout,
          processingTime: now - job.startedAt
        })

        // Complete with timeout error
        this.completeJob(jobId, {
          success: false,
          error: 'Job timeout exceeded',
          timeout: true
        })
      }
    }
  }

  /**
   * Calculate job priority
   * @private
   */
  calculateJobPriority(job, options) {
    if (options.priority !== undefined) {
      return Math.max(1, Math.min(this.priorityLevels, options.priority))
    }

    // Default priority based on job characteristics
    let priority = 5 // Medium priority

    // Higher priority for smaller files
    if (job.fileSize && job.fileSize < 1024 * 1024) { // < 1MB
      priority += 2
    } else if (job.fileSize && job.fileSize > 10 * 1024 * 1024) { // > 10MB
      priority -= 1
    }

    // Higher priority for premium workspaces (if metadata available)
    if (job.isPremium) {
      priority += 1
    }

    return Math.max(1, Math.min(this.priorityLevels, priority))
  }

  /**
   * Calculate queue position for a job
   * @private
   */
  calculateQueuePosition(jobId, jobPriority) {
    let position = 0

    // Count all jobs with higher priority
    for (let priority = this.priorityLevels; priority > jobPriority; priority--) {
      position += this.queues.get(priority).length
    }

    // Find position within same priority queue
    const queue = this.queues.get(jobPriority)
    const index = queue.findIndex(job => job.id === jobId)

    if (index !== -1) {
      position += index + 1
    }

    return position
  }

  /**
   * Estimate wait time for a job
   * @private
   */
  estimateWaitTime(position) {
    if (position === 0) return 0

    const avgProcessingTime = this.stats.averageProcessingTime || 30000 // Default 30s
    const availableSlots = this.maxConcurrentJobs - this.activeJobs.size

    if (availableSlots > 0) {
      return Math.ceil(position / availableSlots) * avgProcessingTime
    }

    return position * avgProcessingTime
  }

  /**
   * Get total queue size
   */
  getTotalQueueSize() {
    let total = 0
    for (const queue of this.queues.values()) {
      total += queue.length
    }
    return total
  }

  /**
   * Get workspace active job count
   * @private
   */
  getWorkspaceActiveJobCount(workspaceId) {
    const jobs = this.workspaceJobs.get(workspaceId)
    return jobs ? jobs.size : 0
  }

  /**
   * Get workspace queued job count
   * @private
   */
  getWorkspaceQueuedJobCount(workspaceId) {
    let count = 0

    for (const queue of this.queues.values()) {
      count += queue.filter(job => job.workspaceId === workspaceId).length
    }

    return count
  }

  /**
   * Add job to workspace tracking
   * @private
   */
  addWorkspaceJob(workspaceId, jobId) {
    if (!this.workspaceJobs.has(workspaceId)) {
      this.workspaceJobs.set(workspaceId, new Set())
    }

    this.workspaceJobs.get(workspaceId).add(jobId)
  }

  /**
   * Remove job from workspace tracking
   * @private
   */
  removeWorkspaceJob(workspaceId, jobId) {
    const jobs = this.workspaceJobs.get(workspaceId)

    if (jobs) {
      jobs.delete(jobId)

      if (jobs.size === 0) {
        this.workspaceJobs.delete(workspaceId)
      }
    }
  }

  /**
   * Update workspace statistics
   * @private
   */
  updateWorkspaceStats(workspaceId, event) {
    if (!this.workspaceStats.has(workspaceId)) {
      this.workspaceStats.set(workspaceId, {
        totalQueued: 0,
        totalStarted: 0,
        totalCompleted: 0,
        totalFailed: 0,
        lastActivity: Date.now()
      })
    }

    const stats = this.workspaceStats.get(workspaceId)
    stats.lastActivity = Date.now()

    switch (event) {
      case 'queued':
        stats.totalQueued++
        break
      case 'started':
        stats.totalStarted++
        break
      case 'completed':
        stats.totalCompleted++
        break
      case 'failed':
        stats.totalFailed++
        break
    }
  }

  /**
   * Update average wait time
   * @private
   */
  updateAverageWaitTime(waitTime) {
    const totalProcessed = this.stats.totalJobsProcessed + this.stats.totalJobsFailed
    if (totalProcessed === 0) {
      this.stats.averageWaitTime = waitTime
    } else {
      this.stats.averageWaitTime = (this.stats.averageWaitTime * totalProcessed + waitTime) / (totalProcessed + 1)
    }
  }

  /**
   * Update average processing time
   * @private
   */
  updateAverageProcessingTime(processingTime) {
    const totalProcessed = this.stats.totalJobsProcessed + this.stats.totalJobsFailed
    if (totalProcessed === 0) {
      this.stats.averageProcessingTime = processingTime
    } else {
      this.stats.averageProcessingTime = (this.stats.averageProcessingTime * totalProcessed + processingTime) / (totalProcessed + 1)
    }
  }

  /**
   * Record queue size for statistics
   * @private
   */
  recordQueueSize() {
    const size = this.getTotalQueueSize()

    this.stats.queueSizeHistory.push({
      size,
      activeJobs: this.activeJobs.size,
      timestamp: Date.now()
    })

    // Keep only last 100 readings
    if (this.stats.queueSizeHistory.length > 100) {
      this.stats.queueSizeHistory.shift()
    }
  }

  /**
   * Get queue status
   */
  getStatus() {
    const queueSizes = {}
    for (const [priority, queue] of this.queues) {
      if (queue.length > 0) {
        queueSizes[`priority_${priority}`] = queue.length
      }
    }

    return {
      isRunning: this.isRunning,
      activeJobs: this.activeJobs.size,
      maxConcurrentJobs: this.maxConcurrentJobs,
      totalQueueSize: this.getTotalQueueSize(),
      queueSizes,
      workspaces: {
        active: this.workspaceJobs.size,
        total: this.workspaceStats.size
      },
      stats: {
        ...this.stats,
        averageWaitTimeMs: Math.round(this.stats.averageWaitTime),
        averageProcessingTimeMs: Math.round(this.stats.averageProcessingTime)
      }
    }
  }

  /**
   * Get workspace status
   * @param {string} workspaceId - Workspace ID
   */
  getWorkspaceStatus(workspaceId) {
    return {
      activeJobs: this.getWorkspaceActiveJobCount(workspaceId),
      queuedJobs: this.getWorkspaceQueuedJobCount(workspaceId),
      stats: this.workspaceStats.get(workspaceId) || null
    }
  }

  /**
   * Sleep utility
   * @private
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Factory function to create queue manager
 */
export function createQueueManager(options = {}) {
  return new QueueManager(options)
}
