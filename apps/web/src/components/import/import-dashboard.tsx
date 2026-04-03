"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { useWorkspace } from "@/contexts/workspace-context"
import { 
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Clock,
  TrendingUp,
  Database,
  Zap
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { FileUpload } from "./file-upload"
import { ImportHistory } from "./import-history"
import { ErrorReporting } from "./error-reporting"
import { DataPreview } from "./data-preview"

interface ImportDashboardProps {
  className?: string
}

interface ImportJob {
  id: string
  platform: string
  filename: string
  size: number
  status: string
  progress: number
  rows: {
    total: number
    valid: number
    processed: number
    errors: number
  }
  summaries: {
    validation?: string
    processing?: string
  }
  timestamps: {
    created: string
    uploaded?: string
    validated?: string
    started?: string
    completed?: string
  }
  duration?: number
}

interface DashboardStats {
  totalImports: number
  successfulImports: number
  failedImports: number
  processingImports: number
  totalRowsProcessed: number
  totalErrors: number
  averageProcessingTime: number
}

type ViewMode = 'upload' | 'history' | 'preview' | 'errors'

export function ImportDashboard({ className }: ImportDashboardProps) {
  const { currentWorkspace, isAuthenticated } = useWorkspace()
  const [viewMode, setViewMode] = useState<ViewMode>('upload')
  const [platform, setPlatform] = useState<string>('shopee')
  const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activeJobs, setActiveJobs] = useState<ImportJob[]>([])
  const [refreshing, setRefreshing] = useState(false)

  // Polling for active job updates
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)

  // Fetch dashboard statistics
  const fetchStats = useCallback(async () => {
    if (!currentWorkspace || !isAuthenticated) return
    
    try {
      const response = await fetch('/api/import/history-simple?limit=1', {
        headers: {
          'x-workspace-id': currentWorkspace.id
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.statistics) {
          const statusBreakdown = data.statistics.statusBreakdown
          const performance = data.statistics.performance
          
          const totalImports = statusBreakdown.reduce((sum: number, stat: any) => sum + stat.count, 0)
          const successfulImports = statusBreakdown.find((s: any) => s.status === 'completed')?.count || 0
          const failedImports = statusBreakdown.filter((s: any) => ['failed', 'validation_failed'].includes(s.status)).reduce((sum: number, stat: any) => sum + stat.count, 0)
          const processingImports = statusBreakdown.filter((s: any) => ['processing', 'queued', 'uploading'].includes(s.status)).reduce((sum: number, stat: any) => sum + stat.count, 0)
          const totalRowsProcessed = statusBreakdown.reduce((sum: number, stat: any) => sum + stat.totalRows, 0)
          const totalErrors = statusBreakdown.reduce((sum: number, stat: any) => sum + stat.totalErrors, 0)

          setStats({
            totalImports,
            successfulImports,
            failedImports,
            processingImports,
            totalRowsProcessed,
            totalErrors,
            averageProcessingTime: performance?.averageProcessingTime || 0
          })
        }
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }, [])

  // Fetch active jobs (processing, queued, etc.)
  const fetchActiveJobs = useCallback(async () => {
    if (!currentWorkspace || !isAuthenticated) return
    
    try {
      const response = await fetch('/api/import/history-simple?status=processing&limit=10', {
        headers: {
          'x-workspace-id': currentWorkspace.id
        }
      })

      if (response.ok) {
        const data = await response.json()
        setActiveJobs(data.jobs || [])
      }
    } catch (error) {
      console.error('Failed to fetch active jobs:', error)
    }
  }, [])

  // Refresh all data
  const refreshData = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([fetchStats(), fetchActiveJobs()])
    } finally {
      setRefreshing(false)
    }
  }, [fetchStats, fetchActiveJobs])

  // Set up polling for active jobs
  useEffect(() => {
    if (activeJobs.length > 0) {
      const interval = setInterval(() => {
        fetchActiveJobs()
      }, 3000) // Poll every 3 seconds

      setPollingInterval(interval)
      return () => clearInterval(interval)
    } else {
      if (pollingInterval) {
        clearInterval(pollingInterval)
        setPollingInterval(null)
      }
    }
  }, [activeJobs.length, fetchActiveJobs])

  // Initial data load
  useEffect(() => {
    refreshData()
  }, [refreshData])

  // Handle upload success
  const handleUploadSuccess = (result: any) => {
    refreshData()
    // Auto-switch to history view to see the upload
    setViewMode('history')
  }

  // Handle job selection
  const handleJobSelect = (job: ImportJob) => {
    setSelectedJob(job)
    if (job.rows.errors > 0) {
      setViewMode('errors')
    } else {
      setViewMode('preview')
    }
  }

  // Handle job processing
  const handleStartProcessing = async (job: ImportJob) => {
    if (!currentWorkspace || !isAuthenticated) return
    
    try {
      const response = await fetch('/api/import/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': currentWorkspace.id
        },
        body: JSON.stringify({
          jobId: job.id,
          dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
          dateTo: new Date().toISOString().split('T')[0] // today
        })
      })

      if (response.ok) {
        refreshData()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.details || 'Failed to start processing')
      }
    } catch (error) {
      console.error('Processing error:', error)
    }
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Import & Upload</h1>
          <p className="text-muted-foreground">
            Manage your affiliate marketing data imports from Shopee, Lazada, and TikTok
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode('upload')}
          >
            <Upload className="h-4 w-4 mr-2" />
            New Import
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">Total Imports</span>
            </div>
            <div className="text-2xl font-bold">{stats.totalImports}</div>
            <div className="text-xs text-muted-foreground">
              {stats.totalRowsProcessed.toLocaleString()} rows processed
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium">Successful</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.successfulImports}</div>
            <div className="text-xs text-muted-foreground">
              {stats.totalImports > 0 ? Math.round((stats.successfulImports / stats.totalImports) * 100) : 0}% success rate
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-5 w-5 text-orange-600" />
              <span className="text-sm font-medium">Processing</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">{stats.processingImports}</div>
            <div className="text-xs text-muted-foreground">
              Currently active jobs
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium">Errors</span>
            </div>
            <div className="text-2xl font-bold text-red-600">{stats.totalErrors}</div>
            <div className="text-xs text-muted-foreground">
              Validation & processing errors
            </div>
          </div>
        </div>
      )}

      {/* Active Jobs Alert */}
      {activeJobs.length > 0 && (
        <Alert>
          <Clock className="h-4 w-4" />
          <div className="flex-1">
            <p className="font-medium">Active Processing Jobs</p>
            <div className="mt-2 space-y-2">
              {activeJobs.map(job => (
                <div key={job.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{job.filename}</span>
                    <Badge variant="outline">{job.platform}</Badge>
                    <Badge variant="secondary">{job.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.progress > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {job.progress}%
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleJobSelect(job)}
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Alert>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-1 border-b">
        <Button
          variant={viewMode === 'upload' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('upload')}
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload
        </Button>
        <Button
          variant={viewMode === 'history' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('history')}
        >
          <FileText className="h-4 w-4 mr-2" />
          History
        </Button>
        {selectedJob && (
          <>
            <Button
              variant={viewMode === 'preview' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('preview')}
            >
              <FileText className="h-4 w-4 mr-2" />
              Preview
            </Button>
            {selectedJob.rows.errors > 0 && (
              <Button
                variant={viewMode === 'errors' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('errors')}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Errors ({selectedJob.rows.errors})
              </Button>
            )}
          </>
        )}
      </div>

      {/* Main Content */}
      <div className="min-h-[400px]">
        {viewMode === 'upload' && (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={handleUploadSuccess}
            onUploadError={(error) => console.error('Upload error:', error)}
            onValidationComplete={(result) => {
              if (!result.isValid && result.errors.length > 0) {
                // Auto-switch to errors view if validation fails
                setTimeout(() => setViewMode('errors'), 1000)
              }
            }}
          />
        )}

        {viewMode === 'history' && (
          <ImportHistory
            onJobSelect={handleJobSelect}
            onRefresh={refreshData}
          />
        )}

        {viewMode === 'preview' && selectedJob && (
          <DataPreview
            jobId={selectedJob.id}
            onClose={() => {
              setSelectedJob(null)
              setViewMode('history')
            }}
          />
        )}

        {viewMode === 'errors' && selectedJob && (
          <ErrorReporting
            jobId={selectedJob.id}
            jobFilename={selectedJob.filename}
            onClose={() => {
              setSelectedJob(null)
              setViewMode('history')
            }}
          />
        )}
      </div>

      {/* Quick Actions for Selected Job */}
      {selectedJob && (
        <div className="fixed bottom-6 right-6 p-4 bg-white border rounded-lg shadow-lg">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-medium">{selectedJob.filename}</p>
              <p className="text-xs text-muted-foreground">
                {selectedJob.platform} • {selectedJob.status}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {selectedJob.status === 'validated' && selectedJob.rows.errors === 0 && (
                <Button
                  size="sm"
                  onClick={() => handleStartProcessing(selectedJob)}
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Process
                </Button>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode('preview')}
              >
                <FileText className="h-4 w-4 mr-2" />
                Preview
              </Button>

              {selectedJob.rows.errors > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode('errors')}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Errors
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedJob(null)
                  setViewMode('history')
                }}
              >
                ✕
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}