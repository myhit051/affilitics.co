"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { useWorkspaceAPI } from "@/hooks/use-workspace"
import {
  Search,
  Filter,
  Download,
  MoreHorizontal,
  Eye,
  Play,
  RotateCcw,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Upload,
  FileText,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert } from "@/components/ui/alert"
import { cn, formatNumber } from "@/lib/utils"

// Helper function to format duration
const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}
import { getPlatformDisplayName } from "@/lib/import/platform-configs"

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

interface ImportHistoryProps {
  onJobSelect?: (job: ImportJob) => void
  onRefresh?: () => void
  className?: string
}

interface HistoryFilters {
  status?: string
  platform?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

interface HistoryStatistics {
  statusBreakdown: Array<{
    status: string
    count: number
    totalRows: number
    validRows: number
    totalErrors: number
  }>
  platformBreakdown: Array<{
    platform: string
    totalImports: number
    completedImports: number
    failedImports: number
    successRate: number
  }>
  recentActivity: Array<{
    date: string
    imports: number
    rowsProcessed: number
  }>
  performance?: {
    averageProcessingTime: number
    minProcessingTime: number
    maxProcessingTime: number
  }
}

const STATUS_CONFIG = {
  uploaded: { icon: Upload, color: 'bg-blue-500', label: 'Uploaded' },
  validated: { icon: CheckCircle, color: 'bg-green-500', label: 'Validated' },
  validation_failed: { icon: XCircle, color: 'bg-red-500', label: 'Validation Failed' },
  queued: { icon: Clock, color: 'bg-yellow-500', label: 'Queued' },
  processing: { icon: Clock, color: 'bg-blue-500', label: 'Processing' },
  completed: { icon: CheckCircle, color: 'bg-green-500', label: 'Completed' },
  failed: { icon: XCircle, color: 'bg-red-500', label: 'Failed' },
  cancelled: { icon: XCircle, color: 'bg-gray-500', label: 'Cancelled' }
}

export function ImportHistory({ onJobSelect, onRefresh, className }: ImportHistoryProps) {
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [statistics, setStatistics] = useState<HistoryStatistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<HistoryFilters>({
    sortBy: 'created_at',
    sortOrder: 'desc'
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showFilters, setShowFilters] = useState(false)

  const pageSize = 20
  
  // Security: Use secure workspace API for all requests
  const { fetchWithWorkspace, workspaceId } = useWorkspaceAPI()

  // Fetch import history
  const fetchHistory = useCallback(async () => {
    // Security: Validate workspace context before making requests
    if (!workspaceId) {
      setError('No workspace selected')
      setLoading(false)
      return
    }
    
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      })

      if (filters.status) params.append('status', filters.status)
      if (filters.platform) params.append('platform', filters.platform)
      if (filters.search) params.append('search', filters.search)
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.append('dateTo', filters.dateTo)

      // Security: Use secure workspace API with automatic context headers
      const response = await fetchWithWorkspace(`/api/import/history?${params}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || errorData.error || 'Failed to fetch history')
      }

      const data = await response.json()
      setJobs(data.jobs)
      setStatistics(data.statistics)
      setTotalPages(data.pagination.totalPages)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch import history'
      setError(errorMessage)
      console.error('Fetch history error:', err)
    } finally {
      setLoading(false)
    }
  }, [currentPage, filters, fetchWithWorkspace, workspaceId])

  // Load data on mount and when dependencies change
  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Handle filter changes
  const updateFilter = (key: keyof HistoryFilters, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setCurrentPage(1) // Reset to first page when filtering
  }

  // Handle job actions
  const handleJobAction = async (jobId: string, action: string) => {
    // Security: Validate workspace context before making requests
    if (!workspaceId) {
      setError('No workspace selected')
      return
    }
    
    try {
      // Security: Use secure workspace API with automatic context headers
      const response = await fetchWithWorkspace('/api/import/status', {
        method: 'POST',
        body: JSON.stringify({ jobId, action })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || errorData.error || 'Action failed')
      }

      // Refresh the list after successful action
      fetchHistory()

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Action failed'
      setError(errorMessage)
    }
  }

  // Get status configuration
  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.uploaded
  }

  // Format duration
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  if (loading && jobs.length === 0) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import History</h2>
          <Button variant="outline" disabled>
            <Search className="h-4 w-4 mr-2" />
            Loading...
          </Button>
        </div>
        
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 border rounded-lg animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-48 bg-muted rounded" />
                  <div className="h-3 w-32 bg-muted rounded" />
                </div>
                <div className="h-6 w-20 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Import History</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchHistory()
              onRefresh?.()
            }}
            disabled={loading}
          >
            <Search className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </Alert>
      )}

      {/* Statistics Summary */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {statistics.statusBreakdown.map(stat => (
            <div key={stat.status} className="p-3 border rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <div className={cn("w-2 h-2 rounded-full", getStatusConfig(stat.status).color)} />
                <span className="text-sm font-medium capitalize">
                  {getStatusConfig(stat.status).label}
                </span>
              </div>
              <div className="text-2xl font-bold">{stat.count}</div>
              {stat.totalRows > 0 && (
                <div className="text-xs text-muted-foreground">
                  {formatNumber(stat.totalRows)} rows
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="p-4 border rounded-lg space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="text-sm font-medium mb-1 block">Search</label>
              <Input
                placeholder="Search by filename..."
                value={filters.search || ''}
                onChange={(e) => updateFilter('search', e.target.value || undefined)}
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <select
                className="w-full p-2 border rounded-md text-sm"
                value={filters.status || ''}
                onChange={(e) => updateFilter('status', e.target.value || undefined)}
              >
                <option value="">All Statuses</option>
                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                  <option key={status} value={status}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Platform Filter */}
            <div>
              <label className="text-sm font-medium mb-1 block">Platform</label>
              <select
                className="w-full p-2 border rounded-md text-sm"
                value={filters.platform || ''}
                onChange={(e) => updateFilter('platform', e.target.value || undefined)}
              >
                <option value="">All Platforms</option>
                <option value="shopee">Shopee</option>
                <option value="lazada">Lazada</option>
                <option value="tiktok">TikTok Shop</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Date From */}
            <div>
              <label className="text-sm font-medium mb-1 block">From Date</label>
              <Input
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => updateFilter('dateFrom', e.target.value || undefined)}
              />
            </div>

            {/* Date To */}
            <div>
              <label className="text-sm font-medium mb-1 block">To Date</label>
              <Input
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => updateFilter('dateTo', e.target.value || undefined)}
              />
            </div>

            {/* Sort */}
            <div>
              <label className="text-sm font-medium mb-1 block">Sort By</label>
              <div className="flex gap-2">
                <select
                  className="flex-1 p-2 border rounded-md text-sm"
                  value={filters.sortBy}
                  onChange={(e) => updateFilter('sortBy', e.target.value)}
                >
                  <option value="created_at">Created Date</option>
                  <option value="filename">Filename</option>
                  <option value="platform">Platform</option>
                  <option value="status">Status</option>
                  <option value="size">File Size</option>
                  <option value="total_rows">Row Count</option>
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  {filters.sortOrder === 'asc' ? '↑' : '↓'}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilters({ sortBy: 'created_at', sortOrder: 'desc' })
                setCurrentPage(1)
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      {/* Jobs List */}
      <div className="space-y-3">
        {jobs.map((job) => (
          <ImportJobRow
            key={job.id}
            job={job}
            onSelect={() => onJobSelect?.(job)}
            onAction={handleJobAction}
          />
        ))}

        {jobs.length === 0 && !loading && (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No import jobs found</p>
            <p className="text-sm mt-1">
              {Object.keys(filters).some(key => filters[key as keyof HistoryFilters])
                ? 'Try adjusting your filters'
                : 'Start by uploading your first data file'
              }
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || loading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface ImportJobRowProps {
  job: ImportJob
  onSelect: () => void
  onAction: (jobId: string, action: string) => void
}

function ImportJobRow({ job, onSelect, onAction }: ImportJobRowProps) {
  const [showActions, setShowActions] = useState(false)
  const statusConfig = getStatusConfig(job.status)
  const StatusIcon = statusConfig.icon

  const canCancel = ['uploaded', 'validated', 'queued', 'processing'].includes(job.status)
  const canRetry = ['failed', 'validation_failed'].includes(job.status)
  const canDelete = !['processing'].includes(job.status)
  const canProcess = job.status === 'validated'

  return (
    <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <StatusIcon className={cn("h-5 w-5", {
            'text-blue-600': job.status === 'uploaded' || job.status === 'processing',
            'text-green-600': job.status === 'completed' || job.status === 'validated',
            'text-red-600': job.status === 'failed' || job.status === 'validation_failed',
            'text-yellow-600': job.status === 'queued',
            'text-gray-600': job.status === 'cancelled'
          })} />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={onSelect}
                className="text-sm font-medium truncate hover:underline cursor-pointer text-left"
              >
                {job.filename}
              </button>
              <Badge variant="outline" className="text-xs">
                {getPlatformDisplayName(job.platform)}
              </Badge>
              <Badge 
                variant={job.status === 'completed' ? 'default' : 
                        job.status === 'failed' ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                {statusConfig.label}
              </Badge>
            </div>
            
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{(job.size / 1024).toFixed(1)} KB</span>
              {job.rows.total > 0 && (
                <span>{formatNumber(job.rows.total)} rows</span>
              )}
              {job.rows.errors > 0 && (
                <span className="text-red-600">{job.rows.errors} errors</span>
              )}
              <span>{format(parseISO(job.timestamps.created), 'MMM dd, HH:mm')}</span>
              {job.duration && (
                <span>⏱ {formatDuration(job.duration)}</span>
              )}
            </div>

            {/* Progress Bar */}
            {job.status === 'processing' && job.progress > 0 && (
              <div className="mt-2">
                <div className="w-full bg-muted rounded-full h-1">
                  <div 
                    className="bg-primary h-1 rounded-full transition-all"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {job.progress}% complete
                  {job.rows.processed > 0 && (
                    <span> • {formatNumber(job.rows.processed)} processed</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Actions */}
          {job.status === 'validated' && job.rows.errors === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAction(job.id, 'process')}
              title="Start processing"
            >
              <Play className="h-4 w-4" />
            </Button>
          )}

          {job.rows.errors > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSelect}
              title="View errors"
            >
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onSelect}
            title="View details"
          >
            <Eye className="h-4 w-4" />
          </Button>

          {/* More Actions */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowActions(!showActions)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>

            {showActions && (
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-md shadow-lg z-10 min-w-[120px]">
                {canProcess && (
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                    onClick={() => {
                      onAction(job.id, 'process')
                      setShowActions(false)
                    }}
                  >
                    <Play className="h-4 w-4" />
                    Process
                  </button>
                )}
                {canRetry && (
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                    onClick={() => {
                      onAction(job.id, 'retry')
                      setShowActions(false)
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retry
                  </button>
                )}
                {canCancel && (
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                    onClick={() => {
                      onAction(job.id, 'cancel')
                      setShowActions(false)
                    }}
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </button>
                )}
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                  onClick={() => {
                    // TODO: Export job data
                    setShowActions(false)
                  }}
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
                {canDelete && (
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-red-600 flex items-center gap-2"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this import job?')) {
                        onAction(job.id, 'delete')
                      }
                      setShowActions(false)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.uploaded
}