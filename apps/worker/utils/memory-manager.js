import { EventEmitter } from 'events'

/**
 * Memory Usage Monitoring and Cleanup Manager
 *
 * จัดการและติดตามการใช้ memory เพื่อป้องกัน memory leaks
 * และให้แน่ใจว่า worker สามารถทำงานได้อย่างมีประสิทธิภาพ
 *
 * เป้าหมาย:
 * - ติดตาม memory usage แบบ real-time
 * - ทำ cleanup อัตโนมัติเมื่อ memory ใกล้ถึงขีดจำกัด
 * - ป้องกัน memory leaks ด้วย automatic garbage collection
 * - รายงาน memory metrics สำหรับ monitoring
 */
export class MemoryManager extends EventEmitter {
  constructor(options = {}) {
    super()

    // Configuration
    this.maxMemoryUsage = options.maxMemoryUsage || 512 * 1024 * 1024 // 512MB default
    this.warningThreshold = options.warningThreshold || 0.75 // 75% of max
    this.criticalThreshold = options.criticalThreshold || 0.9 // 90% of max
    this.checkInterval = options.checkInterval || 5000 // Check every 5 seconds
    this.forceGCThreshold = options.forceGCThreshold || 0.8 // Force GC at 80%
    this.enableAutoCleanup = options.enableAutoCleanup !== false // true by default

    // State
    this.isMonitoring = false
    this.monitoringInterval = null
    this.memoryHistory = []
    this.maxHistorySize = 100 // Keep last 100 readings
    this.lastCleanupTime = Date.now()
    this.cleanupCount = 0

    // Statistics
    this.stats = {
      peakMemoryUsed: 0,
      averageMemoryUsed: 0,
      totalCleanups: 0,
      totalWarnings: 0,
      totalCriticalAlerts: 0,
      lastGCTime: null,
      gcCount: 0
    }

    // Tracked resources for cleanup
    this.managedResources = new Map()
  }

  /**
   * Start memory monitoring
   */
  start() {
    if (this.isMonitoring) {
      console.warn('Memory monitoring is already running')
      return
    }

    console.log(`Starting memory monitoring (max: ${Math.round(this.maxMemoryUsage / 1024 / 1024)}MB)`)

    this.isMonitoring = true
    this.lastCleanupTime = Date.now()

    // Start monitoring interval
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage()
    }, this.checkInterval)

    // Initial check
    this.checkMemoryUsage()

    this.emit('started', {
      maxMemory: this.maxMemoryUsage,
      warningThreshold: this.warningThreshold,
      criticalThreshold: this.criticalThreshold
    })
  }

  /**
   * Stop memory monitoring
   */
  stop() {
    if (!this.isMonitoring) {
      return
    }

    console.log('Stopping memory monitoring')

    this.isMonitoring = false

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }

    // Final cleanup
    this.cleanup()

    this.emit('stopped', {
      totalCleanups: this.stats.totalCleanups,
      peakMemory: this.stats.peakMemoryUsed
    })
  }

  /**
   * Check current memory usage
   * @private
   */
  checkMemoryUsage() {
    const memUsage = process.memoryUsage()
    const heapUsed = memUsage.heapUsed
    const heapTotal = memUsage.heapTotal
    const external = memUsage.external
    const totalUsed = heapUsed + external
    const usagePercentage = totalUsed / this.maxMemoryUsage

    // Track in history
    this.recordMemoryReading({
      heapUsed,
      heapTotal,
      external,
      totalUsed,
      usagePercentage,
      timestamp: Date.now()
    })

    // Update peak memory
    if (totalUsed > this.stats.peakMemoryUsed) {
      this.stats.peakMemoryUsed = totalUsed
    }

    // Calculate average
    this.stats.averageMemoryUsed = this.calculateAverageMemory()

    // Emit memory status
    this.emit('memoryCheck', {
      heapUsed,
      heapTotal,
      external,
      totalUsed,
      maxMemory: this.maxMemoryUsage,
      usagePercentage: (usagePercentage * 100).toFixed(2),
      timestamp: Date.now()
    })

    // Check thresholds and take action
    if (usagePercentage >= this.criticalThreshold) {
      this.handleCriticalMemory(totalUsed, usagePercentage)
    } else if (usagePercentage >= this.warningThreshold) {
      this.handleWarningMemory(totalUsed, usagePercentage)
    } else if (usagePercentage >= this.forceGCThreshold) {
      this.handleHighMemory(totalUsed, usagePercentage)
    }
  }

  /**
   * Handle critical memory situation
   * @private
   */
  handleCriticalMemory(totalUsed, usagePercentage) {
    this.stats.totalCriticalAlerts++

    console.error(`CRITICAL: Memory usage at ${(usagePercentage * 100).toFixed(1)}% (${Math.round(totalUsed / 1024 / 1024)}MB/${Math.round(this.maxMemoryUsage / 1024 / 1024)}MB)`)

    this.emit('criticalMemory', {
      totalUsed,
      maxMemory: this.maxMemoryUsage,
      usagePercentage: usagePercentage * 100,
      action: 'aggressive_cleanup'
    })

    // Aggressive cleanup
    this.cleanup(true)

    // Force multiple GC cycles
    if (global.gc) {
      for (let i = 0; i < 3; i++) {
        global.gc()
        this.stats.gcCount++
      }
      this.stats.lastGCTime = Date.now()
    }

    // Check again after cleanup
    const afterCleanup = process.memoryUsage()
    const afterTotal = afterCleanup.heapUsed + afterCleanup.external

    if (afterTotal >= this.maxMemoryUsage * this.criticalThreshold) {
      this.emit('memoryLimitExceeded', {
        current: afterTotal,
        limit: this.maxMemoryUsage,
        message: 'Memory cleanup insufficient, recommend restarting worker'
      })
    }
  }

  /**
   * Handle warning memory situation
   * @private
   */
  handleWarningMemory(totalUsed, usagePercentage) {
    this.stats.totalWarnings++

    console.warn(`WARNING: Memory usage at ${(usagePercentage * 100).toFixed(1)}% (${Math.round(totalUsed / 1024 / 1024)}MB/${Math.round(this.maxMemoryUsage / 1024 / 1024)}MB)`)

    this.emit('memoryWarning', {
      totalUsed,
      maxMemory: this.maxMemoryUsage,
      usagePercentage: usagePercentage * 100,
      action: 'standard_cleanup'
    })

    if (this.enableAutoCleanup) {
      this.cleanup(false)
    }
  }

  /**
   * Handle high memory situation (trigger GC)
   * @private
   */
  handleHighMemory(totalUsed, usagePercentage) {
    if (global.gc && this.enableAutoCleanup) {
      // Only GC if enough time has passed since last GC (minimum 30 seconds)
      const timeSinceLastGC = this.stats.lastGCTime ? Date.now() - this.stats.lastGCTime : Infinity

      if (timeSinceLastGC > 30000) {
        console.log(`Memory at ${(usagePercentage * 100).toFixed(1)}%, triggering garbage collection`)
        global.gc()
        this.stats.gcCount++
        this.stats.lastGCTime = Date.now()

        this.emit('gcTriggered', {
          memoryBefore: totalUsed,
          usagePercentage: usagePercentage * 100,
          timestamp: Date.now()
        })
      }
    }
  }

  /**
   * Perform memory cleanup
   * @param {boolean} aggressive - Whether to perform aggressive cleanup
   */
  cleanup(aggressive = false) {
    const startTime = Date.now()
    const memBefore = process.memoryUsage().heapUsed

    console.log(`Performing ${aggressive ? 'aggressive' : 'standard'} memory cleanup...`)

    // Clean up managed resources
    this.cleanupManagedResources(aggressive)

    // Trim memory history if too large
    if (this.memoryHistory.length > this.maxHistorySize) {
      const trimSize = aggressive ? this.maxHistorySize / 2 : this.maxHistorySize
      this.memoryHistory = this.memoryHistory.slice(-trimSize)
    }

    // Force garbage collection if available
    if (global.gc) {
      const gcRuns = aggressive ? 2 : 1
      for (let i = 0; i < gcRuns; i++) {
        global.gc()
        this.stats.gcCount++
      }
      this.stats.lastGCTime = Date.now()
    }

    const memAfter = process.memoryUsage().heapUsed
    const freed = memBefore - memAfter
    const duration = Date.now() - startTime

    this.stats.totalCleanups++
    this.lastCleanupTime = Date.now()
    this.cleanupCount++

    console.log(`Cleanup completed in ${duration}ms, freed ${Math.round(freed / 1024 / 1024)}MB`)

    this.emit('cleanupCompleted', {
      aggressive,
      memoryBefore: memBefore,
      memoryAfter: memAfter,
      memoryFreed: freed,
      duration,
      timestamp: Date.now()
    })
  }

  /**
   * Clean up managed resources
   * @private
   */
  cleanupManagedResources(aggressive = false) {
    let cleanedCount = 0

    for (const [resourceId, resource] of this.managedResources.entries()) {
      try {
        // Check if resource should be cleaned
        const shouldClean = aggressive ||
                           (resource.cleanupPolicy === 'auto') ||
                           (resource.lastAccessed && Date.now() - resource.lastAccessed > 60000) // 1 minute idle

        if (shouldClean && resource.cleanup) {
          resource.cleanup()
          this.managedResources.delete(resourceId)
          cleanedCount++
        }
      } catch (error) {
        console.error(`Error cleaning resource ${resourceId}:`, error.message)
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} managed resources`)
    }
  }

  /**
   * Register a resource for managed cleanup
   * @param {string} resourceId - Unique identifier for the resource
   * @param {Function} cleanupFn - Cleanup function to call
   * @param {Object} options - Resource options
   */
  registerResource(resourceId, cleanupFn, options = {}) {
    this.managedResources.set(resourceId, {
      cleanup: cleanupFn,
      cleanupPolicy: options.cleanupPolicy || 'auto', // 'auto', 'manual', 'aggressive'
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      metadata: options.metadata || {}
    })

    this.emit('resourceRegistered', {
      resourceId,
      policy: options.cleanupPolicy || 'auto'
    })
  }

  /**
   * Unregister a managed resource
   * @param {string} resourceId - Resource identifier
   * @param {boolean} cleanup - Whether to run cleanup before unregistering
   */
  unregisterResource(resourceId, cleanup = true) {
    const resource = this.managedResources.get(resourceId)

    if (resource) {
      if (cleanup && resource.cleanup) {
        try {
          resource.cleanup()
        } catch (error) {
          console.error(`Error during resource cleanup for ${resourceId}:`, error.message)
        }
      }

      this.managedResources.delete(resourceId)

      this.emit('resourceUnregistered', {
        resourceId,
        cleanupPerformed: cleanup
      })
    }
  }

  /**
   * Touch a resource to update its last accessed time
   * @param {string} resourceId - Resource identifier
   */
  touchResource(resourceId) {
    const resource = this.managedResources.get(resourceId)
    if (resource) {
      resource.lastAccessed = Date.now()
    }
  }

  /**
   * Record memory reading in history
   * @private
   */
  recordMemoryReading(reading) {
    this.memoryHistory.push(reading)

    // Trim history if too large
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift()
    }
  }

  /**
   * Calculate average memory usage
   * @private
   */
  calculateAverageMemory() {
    if (this.memoryHistory.length === 0) return 0

    const total = this.memoryHistory.reduce((sum, reading) => sum + reading.totalUsed, 0)
    return total / this.memoryHistory.length
  }

  /**
   * Get current memory status
   */
  getStatus() {
    const current = process.memoryUsage()
    const totalUsed = current.heapUsed + current.external

    return {
      current: {
        heapUsed: current.heapUsed,
        heapTotal: current.heapTotal,
        external: current.external,
        totalUsed,
        usagePercentage: ((totalUsed / this.maxMemoryUsage) * 100).toFixed(2)
      },
      limits: {
        maxMemory: this.maxMemoryUsage,
        warningThreshold: this.warningThreshold,
        criticalThreshold: this.criticalThreshold
      },
      stats: {
        ...this.stats,
        peakMemoryMB: Math.round(this.stats.peakMemoryUsed / 1024 / 1024),
        averageMemoryMB: Math.round(this.stats.averageMemoryUsed / 1024 / 1024),
        managedResources: this.managedResources.size
      },
      history: {
        readings: this.memoryHistory.length,
        oldestReading: this.memoryHistory.length > 0 ? this.memoryHistory[0].timestamp : null,
        newestReading: this.memoryHistory.length > 0 ? this.memoryHistory[this.memoryHistory.length - 1].timestamp : null
      }
    }
  }

  /**
   * Get memory statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      peakMemoryMB: Math.round(this.stats.peakMemoryUsed / 1024 / 1024),
      averageMemoryMB: Math.round(this.stats.averageMemoryUsed / 1024 / 1024),
      cleanupFrequency: this.cleanupCount > 0 ?
        (Date.now() - this.lastCleanupTime) / this.cleanupCount : 0,
      managedResourcesCount: this.managedResources.size
    }
  }

  /**
   * Get memory trend analysis
   */
  getTrend() {
    if (this.memoryHistory.length < 2) {
      return { trend: 'insufficient_data', slope: 0 }
    }

    // Simple linear regression on last 10 readings
    const recentReadings = this.memoryHistory.slice(-10)
    const n = recentReadings.length

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0

    recentReadings.forEach((reading, index) => {
      sumX += index
      sumY += reading.totalUsed
      sumXY += index * reading.totalUsed
      sumX2 += index * index
    })

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)

    // Determine trend
    let trend = 'stable'
    if (slope > 1000000) { // Growing by more than 1MB per reading
      trend = 'increasing'
    } else if (slope < -1000000) { // Decreasing by more than 1MB per reading
      trend = 'decreasing'
    }

    return {
      trend,
      slope,
      slopeMBPerReading: (slope / 1024 / 1024).toFixed(2),
      readingsAnalyzed: n
    }
  }

  /**
   * Force immediate memory cleanup
   */
  forceCleanup() {
    console.log('Forcing immediate memory cleanup')
    this.cleanup(true)
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      peakMemoryUsed: 0,
      averageMemoryUsed: 0,
      totalCleanups: 0,
      totalWarnings: 0,
      totalCriticalAlerts: 0,
      lastGCTime: null,
      gcCount: 0
    }
    this.memoryHistory = []
    this.cleanupCount = 0

    this.emit('statsReset')
  }
}

/**
 * Factory function to create memory manager
 */
export function createMemoryManager(options = {}) {
  return new MemoryManager(options)
}

/**
 * Global memory manager instance (singleton pattern)
 */
let globalMemoryManager = null

export function getGlobalMemoryManager(options = {}) {
  if (!globalMemoryManager) {
    globalMemoryManager = createMemoryManager(options)
  }
  return globalMemoryManager
}
