/**
 * Background Job Status Polling Optimization
 *
 * Optimized polling system for tracking background job status
 * ลด server load และปรับปรุง UX ด้วย intelligent polling
 *
 * Features:
 * - Adaptive polling intervals (faster when job is active)
 * - Exponential backoff for inactive jobs
 * - Multiple job polling support
 * - Automatic cleanup and timeout handling
 * - Minimal server load with smart intervals
 */

export interface JobStatus {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'retry_queued' | 'cancelled' | 'timeout'
  progress?: number
  error?: string
  result?: any
  startedAt?: Date
  finishedAt?: Date
  updatedAt: Date
}

export interface PollingOptions {
  /**
   * Initial polling interval in milliseconds
   * @default 1000 (1 second)
   */
  initialInterval?: number

  /**
   * Maximum polling interval in milliseconds
   * @default 30000 (30 seconds)
   */
  maxInterval?: number

  /**
   * Minimum polling interval in milliseconds
   * @default 500 (0.5 seconds)
   */
  minInterval?: number

  /**
   * Backoff multiplier for increasing interval
   * @default 1.5
   */
  backoffMultiplier?: number

  /**
   * Maximum polling duration in milliseconds (0 = unlimited)
   * @default 300000 (5 minutes)
   */
  maxDuration?: number

  /**
   * Callback when job status changes
   */
  onStatusChange?: (status: JobStatus) => void

  /**
   * Callback when job completes (success or failure)
   */
  onComplete?: (status: JobStatus) => void

  /**
   * Callback when polling times out
   */
  onTimeout?: () => void

  /**
   * Callback on polling error
   */
  onError?: (error: Error) => void

  /**
   * Custom headers for API requests
   */
  headers?: Record<string, string>
}

/**
 * Job Poller Class
 */
export class JobPoller {
  private jobId: string
  private options: Required<PollingOptions>
  private currentInterval: number
  private pollCount: number
  private startTime: number
  private isPolling: boolean
  private timeoutId: NodeJS.Timeout | null
  private lastStatus: string | null
  private lastProgress: number

  constructor(jobId: string, options: PollingOptions = {}) {
    this.jobId = jobId
    this.options = {
      initialInterval: options.initialInterval ?? 1000,
      maxInterval: options.maxInterval ?? 30000,
      minInterval: options.minInterval ?? 500,
      backoffMultiplier: options.backoffMultiplier ?? 1.5,
      maxDuration: options.maxDuration ?? 300000,
      onStatusChange: options.onStatusChange ?? (() => {}),
      onComplete: options.onComplete ?? (() => {}),
      onTimeout: options.onTimeout ?? (() => {}),
      onError: options.onError ?? (() => {}),
      headers: options.headers ?? {}
    }

    this.currentInterval = this.options.initialInterval
    this.pollCount = 0
    this.startTime = Date.now()
    this.isPolling = false
    this.timeoutId = null
    this.lastStatus = null
    this.lastProgress = 0
  }

  /**
   * Start polling for job status
   */
  async start(): Promise<void> {
    if (this.isPolling) {
      console.warn(`Poller for job ${this.jobId} is already running`)
      return
    }

    this.isPolling = true
    this.startTime = Date.now()
    this.pollCount = 0

    await this.poll()
  }

  /**
   * Stop polling
   */
  stop(): void {
    this.isPolling = false

    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  /**
   * Poll job status
   */
  private async poll(): Promise<void> {
    if (!this.isPolling) {
      return
    }

    // Check if we've exceeded max duration
    if (this.options.maxDuration > 0) {
      const elapsed = Date.now() - this.startTime
      if (elapsed >= this.options.maxDuration) {
        this.stop()
        this.options.onTimeout()
        return
      }
    }

    try {
      // Fetch job status
      const status = await this.fetchJobStatus()

      // Increment poll count
      this.pollCount++

      // Check if status changed
      const statusChanged = this.lastStatus !== status.status
      const progressChanged = status.progress !== undefined && status.progress !== this.lastProgress

      if (statusChanged || progressChanged) {
        this.lastStatus = status.status
        this.lastProgress = status.progress ?? 0
        this.options.onStatusChange(status)

        // Reset interval to initial when there's activity
        if (statusChanged) {
          this.currentInterval = this.options.initialInterval
        }
      }

      // Check if job is complete
      if (this.isJobComplete(status.status)) {
        this.stop()
        this.options.onComplete(status)
        return
      }

      // Adjust polling interval based on job state
      this.adjustInterval(status)

      // Schedule next poll
      this.timeoutId = setTimeout(() => this.poll(), this.currentInterval)

    } catch (error) {
      console.error(`Error polling job ${this.jobId}:`, error)
      this.options.onError(error as Error)

      // Continue polling on error (with backoff)
      this.increaseInterval()
      this.timeoutId = setTimeout(() => this.poll(), this.currentInterval)
    }
  }

  /**
   * Fetch job status from API
   */
  private async fetchJobStatus(): Promise<JobStatus> {
    const response = await fetch(`/api/jobs/${this.jobId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.options.headers
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch job status: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    return {
      id: data.id,
      status: data.status,
      progress: data.progress,
      error: data.error,
      result: data.result,
      startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
      finishedAt: data.finishedAt ? new Date(data.finishedAt) : undefined,
      updatedAt: new Date(data.updatedAt || Date.now())
    }
  }

  /**
   * Check if job is in a terminal state
   */
  private isJobComplete(status: string): boolean {
    return ['completed', 'failed', 'cancelled', 'timeout'].includes(status)
  }

  /**
   * Adjust polling interval based on job state
   */
  private adjustInterval(status: JobStatus): void {
    switch (status.status) {
      case 'queued':
        // Slow polling for queued jobs
        this.increaseInterval()
        break

      case 'processing':
        // Faster polling for active jobs
        if (status.progress !== undefined && status.progress > this.lastProgress) {
          // Progress is being made, poll faster
          this.decreaseInterval()
        } else {
          // No progress, slow down
          this.increaseInterval()
        }
        break

      case 'retry_queued':
        // Medium polling for retry
        this.currentInterval = Math.min(
          this.options.maxInterval,
          this.options.initialInterval * 2
        )
        break

      default:
        // Use current interval
        break
    }
  }

  /**
   * Increase polling interval (slow down)
   */
  private increaseInterval(): void {
    this.currentInterval = Math.min(
      this.options.maxInterval,
      this.currentInterval * this.options.backoffMultiplier
    )
  }

  /**
   * Decrease polling interval (speed up)
   */
  private decreaseInterval(): void {
    this.currentInterval = Math.max(
      this.options.minInterval,
      this.currentInterval / this.options.backoffMultiplier
    )
  }

  /**
   * Get current polling statistics
   */
  getStats(): {
    jobId: string
    isPolling: boolean
    pollCount: number
    currentInterval: number
    elapsedTime: number
    lastStatus: string | null
    lastProgress: number
  } {
    return {
      jobId: this.jobId,
      isPolling: this.isPolling,
      pollCount: this.pollCount,
      currentInterval: this.currentInterval,
      elapsedTime: Date.now() - this.startTime,
      lastStatus: this.lastStatus,
      lastProgress: this.lastProgress
    }
  }
}

/**
 * Multi-Job Poller
 * Manages polling for multiple jobs simultaneously
 */
export class MultiJobPoller {
  private pollers: Map<string, JobPoller>
  private globalOptions: PollingOptions

  constructor(globalOptions: PollingOptions = {}) {
    this.pollers = new Map()
    this.globalOptions = globalOptions
  }

  /**
   * Add a job to poll
   */
  addJob(jobId: string, options?: PollingOptions): JobPoller {
    if (this.pollers.has(jobId)) {
      console.warn(`Job ${jobId} is already being polled`)
      return this.pollers.get(jobId)!
    }

    const mergedOptions = {
      ...this.globalOptions,
      ...options,
      onComplete: (status: JobStatus) => {
        // Call custom callback
        options?.onComplete?.(status)
        this.globalOptions.onComplete?.(status)

        // Remove poller after completion
        this.removeJob(jobId)
      }
    }

    const poller = new JobPoller(jobId, mergedOptions)
    this.pollers.set(jobId, poller)
    poller.start()

    return poller
  }

  /**
   * Remove a job from polling
   */
  removeJob(jobId: string): void {
    const poller = this.pollers.get(jobId)
    if (poller) {
      poller.stop()
      this.pollers.delete(jobId)
    }
  }

  /**
   * Stop all pollers
   */
  stopAll(): void {
    for (const poller of this.pollers.values()) {
      poller.stop()
    }
    this.pollers.clear()
  }

  /**
   * Get poller for a specific job
   */
  getPoller(jobId: string): JobPoller | undefined {
    return this.pollers.get(jobId)
  }

  /**
   * Get all active pollers
   */
  getAllPollers(): JobPoller[] {
    return Array.from(this.pollers.values())
  }

  /**
   * Get polling statistics for all jobs
   */
  getAllStats(): Array<ReturnType<JobPoller['getStats']>> {
    return Array.from(this.pollers.values()).map(poller => poller.getStats())
  }

  /**
   * Get number of active pollers
   */
  getActiveCount(): number {
    return this.pollers.size
  }
}

/**
 * Helper function to poll a single job
 */
export async function pollJob(
  jobId: string,
  options: PollingOptions = {}
): Promise<JobStatus> {
  return new Promise((resolve, reject) => {
    const poller = new JobPoller(jobId, {
      ...options,
      onComplete: (status) => {
        options.onComplete?.(status)
        resolve(status)
      },
      onTimeout: () => {
        options.onTimeout?.()
        reject(new Error('Polling timeout'))
      },
      onError: (error) => {
        options.onError?.(error)
        reject(error)
      }
    })

    poller.start()
  })
}

/**
 * Helper function to create a multi-job poller
 */
export function createMultiJobPoller(options: PollingOptions = {}): MultiJobPoller {
  return new MultiJobPoller(options)
}
