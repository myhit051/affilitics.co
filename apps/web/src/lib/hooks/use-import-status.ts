/**
 * React hook for monitoring import job status with real-time updates
 * Provides polling for active jobs and WebSocket-like functionality
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ACTIVE_STATUSES, IMPORT_JOB_STATUS, isActiveStatus } from '@aff/db'
import { useWorkspaceAPI } from '@/hooks/use-workspace'

interface ImportJobStatus {
  id: string
  platform: string
  filename: string
  status: string
  progress: number
  totalRows: number
  validRows: number
  processedRows: number
  errorCount: number
  validationSummary?: string
  timestamps: {
    created: string
    uploaded?: string
    validated?: string
    started?: string
    completed?: string
  }
  estimatedCompletion?: string
  processingRate?: number
}

interface ImportStatusError {
  message: string
  details?: string
}

interface UseImportStatusOptions {
  pollingInterval?: number // in milliseconds, default 3000
  enablePolling?: boolean
  onStatusChange?: (jobId: string, oldStatus: string, newStatus: string) => void
  onError?: (error: ImportStatusError) => void
}

interface UseImportStatusReturn {
  jobs: Map<string, ImportJobStatus>
  loading: boolean
  error: ImportStatusError | null
  addJob: (jobId: string) => void
  removeJob: (jobId: string) => void
  refreshJob: (jobId: string) => Promise<void>
  refreshAll: () => Promise<void>
  clearError: () => void
}

export function useImportStatus(options: UseImportStatusOptions = {}): UseImportStatusReturn {
  const {
    pollingInterval = 3000,
    enablePolling = true,
    onStatusChange,
    onError
  } = options

  const [jobs, setJobs] = useState<Map<string, ImportJobStatus>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ImportStatusError | null>(null)
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const previousStatusRef = useRef<Map<string, string>>(new Map())
  
  // Security: Use secure workspace API for all requests
  const { fetchWithWorkspace, workspaceId } = useWorkspaceAPI()

  // Fetch status for a single job
  const fetchJobStatus = useCallback(async (jobId: string): Promise<ImportJobStatus | null> => {
    // Security: Validate workspace context before making requests
    if (!workspaceId) {
      const errorMessage = 'No workspace selected'
      setError({ message: errorMessage, details: 'Workspace context required' })
      return null
    }
    
    try {
      // Security: Use secure workspace API with automatic context headers
      const response = await fetchWithWorkspace(`/api/import/status?jobId=${jobId}`)

      if (!response.ok) {
        if (response.status === 404) {
          // Job not found, remove from tracking
          return null
        }
        const errorData = await response.json()
        throw new Error(errorData.details || errorData.error || 'Failed to fetch status')
      }

      const data = await response.json()
      return data.job as ImportJobStatus

    } catch (err) {
      console.error(`Failed to fetch status for job ${jobId}:`, err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch job status'
      const statusError: ImportStatusError = {
        message: errorMessage,
        details: `Job ID: ${jobId}`
      }
      
      setError(statusError)
      onError?.(statusError)
      return null
    }
  }, [onError, fetchWithWorkspace, workspaceId])

  // Add a job to monitoring
  const addJob = useCallback((jobId: string) => {
    setJobs(prev => {
      const newJobs = new Map(prev)
      if (!newJobs.has(jobId)) {
        // Add placeholder while fetching
        newJobs.set(jobId, {
          id: jobId,
          platform: '',
          filename: '',
          status: 'loading',
          progress: 0,
          totalRows: 0,
          validRows: 0,
          processedRows: 0,
          errorCount: 0,
          timestamps: { created: new Date().toISOString() }
        })
      }
      return newJobs
    })

    // Fetch initial status
    fetchJobStatus(jobId).then(status => {
      if (status) {
        setJobs(prev => {
          const newJobs = new Map(prev)
          newJobs.set(jobId, status)
          return newJobs
        })
        previousStatusRef.current.set(jobId, status.status)
      } else {
        // Remove if not found
        removeJob(jobId)
      }
    })
  }, [fetchJobStatus])

  // Remove a job from monitoring
  const removeJob = useCallback((jobId: string) => {
    setJobs(prev => {
      const newJobs = new Map(prev)
      newJobs.delete(jobId)
      return newJobs
    })
    previousStatusRef.current.delete(jobId)
  }, [])

  // Refresh status for a specific job
  const refreshJob = useCallback(async (jobId: string) => {
    const status = await fetchJobStatus(jobId)
    if (status) {
      setJobs(prev => {
        const newJobs = new Map(prev)
        newJobs.set(jobId, status)
        return newJobs
      })

      // Check for status changes
      const previousStatus = previousStatusRef.current.get(jobId)
      if (previousStatus && previousStatus !== status.status) {
        onStatusChange?.(jobId, previousStatus, status.status)
      }
      previousStatusRef.current.set(jobId, status.status)
    } else {
      removeJob(jobId)
    }
  }, [fetchJobStatus, onStatusChange, removeJob])

  // Refresh all tracked jobs
  const refreshAll = useCallback(async () => {
    setLoading(true)
    try {
      const jobIds = Array.from(jobs.keys())
      await Promise.all(jobIds.map(refreshJob))
    } finally {
      setLoading(false)
    }
  }, [jobs, refreshJob])

  // Clear error state
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Set up polling for active jobs
  useEffect(() => {
    if (!enablePolling) return

    const activeJobs = Array.from(jobs.values()).filter(job => 
      isActiveStatus(job.status as any)
    )

    if (activeJobs.length > 0) {
      pollingRef.current = setInterval(() => {
        activeJobs.forEach(job => refreshJob(job.id))
      }, pollingInterval)

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [jobs, enablePolling, pollingInterval, refreshJob])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  return {
    jobs,
    loading,
    error,
    addJob,
    removeJob,
    refreshJob,
    refreshAll,
    clearError
  }
}

/**
 * Hook for monitoring multiple import jobs with batch operations
 */
export function useImportBatch() {
  const [batchJobs, setBatchJobs] = useState<string[]>([])
  const { jobs, addJob, removeJob, refreshAll } = useImportStatus({
    onStatusChange: (jobId, oldStatus, newStatus) => {
      console.log(`Job ${jobId} status changed: ${oldStatus} -> ${newStatus}`)
      
      // Remove from batch if completed or failed
      if ([IMPORT_JOB_STATUS.COMPLETED, IMPORT_JOB_STATUS.FAILED, IMPORT_JOB_STATUS.CANCELLED].includes(newStatus as any)) {
        setBatchJobs(prev => prev.filter(id => id !== jobId))
      }
    }
  })

  const addToBatch = useCallback((jobIds: string[]) => {
    setBatchJobs(prev => Array.from(new Set([...prev, ...jobIds])))
    jobIds.forEach(addJob)
  }, [addJob])

  const clearBatch = useCallback(() => {
    batchJobs.forEach(removeJob)
    setBatchJobs([])
  }, [batchJobs, removeJob])

  const batchStatus = {
    total: batchJobs.length,
    completed: batchJobs.filter(id => jobs.get(id)?.status === IMPORT_JOB_STATUS.COMPLETED).length,
    failed: batchJobs.filter(id => jobs.get(id)?.status === IMPORT_JOB_STATUS.FAILED).length,
    processing: batchJobs.filter(id => {
      const status = jobs.get(id)?.status
      return status && isActiveStatus(status as any)
    }).length
  }

  const isComplete = batchStatus.total > 0 && batchStatus.processing === 0

  return {
    batchJobs,
    batchStatus,
    isComplete,
    addToBatch,
    clearBatch,
    refreshAll,
    jobs: Array.from(jobs.values()).filter(job => batchJobs.includes(job.id))
  }
}

/**
 * Hook for import job notifications
 */
export function useImportNotifications() {
  const [notifications, setNotifications] = useState<Array<{
    id: string
    jobId: string
    type: 'success' | 'error' | 'warning' | 'info'
    title: string
    message: string
    timestamp: Date
    read: boolean
  }>>([])

  const { jobs } = useImportStatus({
    onStatusChange: (jobId, oldStatus, newStatus) => {
      const job = jobs.get(jobId)
      if (!job) return

      let notification
      switch (newStatus) {
        case IMPORT_JOB_STATUS.COMPLETED:
          notification = {
            id: `${jobId}-completed`,
            jobId,
            type: 'success' as const,
            title: 'Import Completed',
            message: `${job.filename} has been successfully processed`,
            timestamp: new Date(),
            read: false
          }
          break
        case IMPORT_JOB_STATUS.FAILED:
          notification = {
            id: `${jobId}-failed`,
            jobId,
            type: 'error' as const,
            title: 'Import Failed',
            message: `${job.filename} processing failed`,
            timestamp: new Date(),
            read: false
          }
          break
        case IMPORT_JOB_STATUS.VALIDATION_FAILED:
          notification = {
            id: `${jobId}-validation-failed`,
            jobId,
            type: 'warning' as const,
            title: 'Validation Failed',
            message: `${job.filename} has validation errors`,
            timestamp: new Date(),
            read: false
          }
          break
      }

      if (notification) {
        setNotifications(prev => [notification, ...prev].slice(0, 50)) // Keep last 50
      }
    }
  })

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    )
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const clearNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications
  }
}