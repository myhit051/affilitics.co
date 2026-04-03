"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { 
  Upload, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  MoreHorizontal,
  Eye,
  Play,
  RefreshCw,
  FileText
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { ChartContainer } from "./chart-container"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn, formatNumber } from "@/lib/utils"

interface ImportStatusProps {
  workspaceId: string
  onNewImport?: () => void
  onJobSelect?: (jobId: string) => void
  maxJobs?: number
  showActions?: boolean
  autoRefresh?: boolean
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-600" />
    case 'processing':
      return <Clock className="h-4 w-4 text-blue-600 animate-pulse" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-600" />
    case 'queued':
      return <Clock className="h-4 w-4 text-yellow-600" />
    case 'validated':
      return <CheckCircle className="h-4 w-4 text-green-600" />
    case 'uploaded':
      return <Upload className="h-4 w-4 text-blue-600" />
    case 'validation_failed':
      return <XCircle className="h-4 w-4 text-red-600" />
    default:
      return <AlertTriangle className="h-4 w-4 text-gray-600" />
  }
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'completed':
      return <Badge variant="default" className="bg-green-100 text-green-800">Completed</Badge>
    case 'processing':
      return <Badge variant="outline" className="border-blue-200 text-blue-800">Processing</Badge>
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>
    case 'queued':
      return <Badge variant="secondary">Queued</Badge>
    case 'validated':
      return <Badge variant="default" className="bg-green-100 text-green-800">Validated</Badge>
    case 'uploaded':
      return <Badge variant="outline" className="border-blue-200 text-blue-800">Uploaded</Badge>
    case 'validation_failed':
      return <Badge variant="destructive">Validation Failed</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export function ImportStatus({ 
  workspaceId,
  onNewImport, 
  onJobSelect, 
  maxJobs = 6,
  showActions = true,
  autoRefresh = true
}: ImportStatusProps) {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Fetch recent import jobs
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/analytics/recent?workspaceId=${workspaceId}&limit=${maxJobs}`, {
        method: 'POST' // Use POST method to get import jobs
      })

      if (!response.ok) {
        throw new Error('Failed to fetch import jobs')
      }

      const data = await response.json()
      setJobs(data || [])
      setLastRefresh(new Date())

    } catch (err) {
      console.error('Failed to fetch import jobs:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs')
    } finally {
      setLoading(false)
    }
  }, [maxJobs])

  // Initial load
  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // Auto-refresh for active jobs
  useEffect(() => {
    if (!autoRefresh) return

    const hasActiveJobs = jobs.some(job => 
      ['uploaded', 'queued', 'processing'].includes(job.status)
    )

    if (hasActiveJobs) {
      const interval = setInterval(fetchJobs, 5000) // Refresh every 5 seconds
      return () => clearInterval(interval)
    }
  }, [jobs, autoRefresh, fetchJobs])

  const actions = showActions ? (
    <div className="flex items-center gap-2">
      <Button 
        variant="outline" 
        size="sm"
        onClick={fetchJobs}
        disabled={loading}
      >
        <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
        Refresh
      </Button>
      <Button variant="outline" size="sm" onClick={onNewImport}>
        <Upload className="h-4 w-4 mr-2" />
        New Import
      </Button>
    </div>
  ) : undefined

  if (loading && jobs.length === 0) {
    return (
      <ChartContainer
        title="Import Status"
        description="Monitor your data import jobs"
        actions={actions}
      >
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 border rounded">
              <div className="space-y-2">
                <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-6 w-20 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </ChartContainer>
    )
  }

  if (error) {
    return (
      <ChartContainer
        title="Import Status"
        description="Monitor your data import jobs"
        actions={actions}
      >
        <div className="text-center py-8">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500 opacity-50" />
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchJobs}>
            Try Again
          </Button>
        </div>
      </ChartContainer>
    )
  }

  return (
    <ChartContainer
      title="Import Status"
      description={`Monitor your data import jobs • Last updated: ${format(lastRefresh, 'HH:mm:ss')}`}
      actions={actions}
    >
      <div className="space-y-3">
        {jobs.map((job) => {
          const progress = job.progress || 0
          
          return (
            <div 
              key={job.id} 
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => onJobSelect?.(job.id)}
            >
              <div className="flex items-center gap-3 flex-1">
                {getStatusIcon(job.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium truncate">{job.filename}</p>
                    <Badge variant="outline" className="text-xs">
                      {job.platform}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{(job.size / 1024).toFixed(1)} KB</span>
                    {job.rows?.total > 0 && (
                      <span>{formatNumber(job.rows.total)} rows</span>
                    )}
                    {job.rows?.errors > 0 && (
                      <span className="text-red-600">{job.rows.errors} errors</span>
                    )}
                    <span>{format(parseISO(job.timestamps.created), 'MMM dd, HH:mm')}</span>
                  </div>

                  {job.status === 'processing' && progress > 0 && (
                    <div className="mt-2">
                      <Progress value={progress} className="h-1" />
                      <div className="text-xs text-muted-foreground mt-1">
                        {progress}% complete
                        {job.rows?.processed > 0 && (
                          <span> • {formatNumber(job.rows.processed)} processed</span>
                        )}
                      </div>
                    </div>
                  )}

                  {job.rows?.errors > 0 && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-red-600">
                      <AlertTriangle className="h-3 w-3" />
                      {job.rows.errors} validation errors
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {getStatusBadge(job.status)}

                {/* Quick action buttons */}
                <div className="flex items-center gap-1">
                  {job.status === 'validated' && job.rows?.errors === 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        // TODO: Start processing
                      }}
                      title="Start processing"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      onJobSelect?.(job.id)
                    }}
                    title="View details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>

                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}

        {jobs.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">No import jobs found</p>
            <p className="text-xs mt-1">Upload your first data file to get started</p>
            {onNewImport && (
              <Button variant="outline" className="mt-4" onClick={onNewImport}>
                <Upload className="h-4 w-4 mr-2" />
                Start Import
              </Button>
            )}
          </div>
        )}
      </div>
    </ChartContainer>
  )
}