"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { useWorkspaceAPI } from "@/hooks/use-workspace"
import { 
  AlertTriangle,
  XCircle,
  AlertCircle,
  Info,
  Search,
  Filter,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle,
  RefreshCw,
  TrendingUp,
  BarChart3,
  FileText,
  Settings,
  Clock,
  Target,
  Lightbulb
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

interface ImportError {
  id: string
  row: number
  field?: string
  type: string
  message: string
  value?: any
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: 'data_quality' | 'business_logic' | 'system' | 'file' | 'platform' | 'unknown'
  recoveryStrategy: 'retry_automatic' | 'retry_manual' | 'skip_row' | 'fix_data' | 'manual_review' | 'abort_import' | 'no_action'
  retryCount: number
  maxRetries: number
  resolved: boolean
  resolvedAt?: string
  resolution?: string
  dismissed: boolean
  createdAt: string
  uiConfig: {
    color: string
    icon: string
    bgColor: string
    textColor: string
  }
  stackTrace?: string
  additionalContext?: any
}

interface ErrorSummary {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  info: number
  retryable: number
  blocking: number
  categories: Record<string, number>
}

interface ErrorStatistics {
  errorTypeBreakdown: Array<{
    type: string
    count: number
    severity: string
    uiConfig: any
  }>
  errorSamples: Record<string, Array<{
    row: number
    field?: string
    value?: any
    message: string
    severity: string
    uiConfig: any
  }>>
  recoveryRecommendations: Array<{
    errorType: string
    count: number
    severity: string
    recommendation: string
    action: string
    estimatedEffort: 'low' | 'medium' | 'high'
  }>
}

interface ErrorReportingProps {
  jobId: string
  jobFilename?: string
  onClose?: () => void
  className?: string
}

interface ErrorFilters {
  errorType?: string
  severity?: string
  category?: string
  resolved?: string
  search?: string
  sortBy?: string
  sortOrder?: string
}

const SEVERITY_CONFIG = {
  critical: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Critical', priority: 1 },
  high: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', label: 'High', priority: 2 },
  medium: { icon: AlertCircle, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Medium', priority: 3 },
  low: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Low', priority: 4 },
  info: { icon: Info, color: 'text-gray-600', bg: 'bg-gray-50', label: 'Info', priority: 5 }
}

const CATEGORY_CONFIG = {
  data_quality: { icon: Target, label: 'Data Quality', color: 'text-red-600' },
  business_logic: { icon: Settings, label: 'Business Logic', color: 'text-orange-600' },
  system: { icon: AlertCircle, label: 'System', color: 'text-blue-600' },
  file: { icon: FileText, label: 'File', color: 'text-purple-600' },
  platform: { icon: BarChart3, label: 'Platform', color: 'text-green-600' },
  unknown: { icon: AlertTriangle, label: 'Unknown', color: 'text-gray-600' }
}

const RECOVERY_ACTION_CONFIG = {
  retry_automatic: { icon: RefreshCw, label: 'Auto Retry', color: 'text-blue-600' },
  retry_manual: { icon: RefreshCw, label: 'Manual Retry', color: 'text-orange-600' },
  skip_row: { icon: ChevronRight, label: 'Skip Row', color: 'text-yellow-600' },
  fix_data: { icon: Settings, label: 'Fix Data', color: 'text-red-600' },
  manual_review: { icon: Eye, label: 'Review', color: 'text-purple-600' },
  abort_import: { icon: X, label: 'Abort', color: 'text-red-700' },
  no_action: { icon: Info, label: 'No Action', color: 'text-gray-600' }
}

export function ErrorReporting({ jobId, jobFilename, onClose, className }: ErrorReportingProps) {
  const [errors, setErrors] = useState<ImportError[]>([])
  const [summary, setSummary] = useState<ErrorSummary | null>(null)
  const [statistics, setStatistics] = useState<ErrorStatistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ErrorFilters>({ sortBy: 'created_at', sortOrder: 'desc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [showRecommendations, setShowRecommendations] = useState(true)
  const [selectedErrors, setSelectedErrors] = useState<Set<string>>(new Set())
  const [retryStatus, setRetryStatus] = useState<any>(null)
  const [bulkActionLoading, setBulkActionLoading] = useState<string | null>(null)

  const pageSize = 50
  
  // Security: Use secure workspace API for all requests
  const { fetchWithWorkspace, workspaceId } = useWorkspaceAPI()

  // Fetch errors
  const fetchErrors = useCallback(async () => {
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
        jobId,
        page: currentPage.toString(),
        limit: pageSize.toString(),
        includeContext: 'false' // Only include context when needed
      })

      if (filters.errorType) params.append('errorType', filters.errorType)
      if (filters.severity) params.append('severity', filters.severity)
      if (filters.category) params.append('category', filters.category)
      if (filters.resolved) params.append('resolved', filters.resolved)
      if (filters.search) params.append('search', filters.search)
      if (filters.sortBy) params.append('sortBy', filters.sortBy)
      if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)

      // Security: Use secure workspace API with automatic context headers
      const response = await fetchWithWorkspace(`/api/import/errors?${params}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || errorData.error || 'Failed to fetch errors')
      }

      const data = await response.json()
      setErrors(data.errors)
      setSummary(data.summary)
      setStatistics(data.statistics)
      setTotalPages(data.pagination.totalPages)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch errors'
      setError(errorMessage)
      console.error('Fetch errors error:', err)
    } finally {
      setLoading(false)
    }
  }, [jobId, currentPage, filters])

  useEffect(() => {
    fetchErrors()
  }, [fetchErrors])

  // Handle filter changes
  const updateFilter = (key: keyof ErrorFilters, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setCurrentPage(1)
  }

  // Fetch retry status
  const fetchRetryStatus = useCallback(async () => {
    if (!workspaceId) return
    
    try {
      const response = await fetchWithWorkspace(`/api/import/retry?jobId=${jobId}`)
      if (response.ok) {
        const data = await response.json()
        setRetryStatus(data)
      }
    } catch (err) {
      console.error('Failed to fetch retry status:', err)
    }
  }, [jobId, workspaceId, fetchWithWorkspace])

  useEffect(() => {
    fetchRetryStatus()
  }, [fetchRetryStatus])

  // Handle bulk actions
  const handleBulkAction = async (action: 'dismiss' | 'resolve' | 'retry' | 'export' | 'clear_all') => {
    // Security: Validate workspace context before making requests
    if (!workspaceId) {
      setError('No workspace selected')
      return
    }
    
    setBulkActionLoading(action)
    try {
      if (action === 'export') {
        const response = await fetchWithWorkspace('/api/import/errors', {
          method: 'POST',
          body: JSON.stringify({ jobId, action: 'export' })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.details || 'Export failed')
        }

        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `import_errors_${jobId}_${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

      } else if ((action === 'dismiss' || action === 'resolve') && selectedErrors.size > 0) {
        const response = await fetchWithWorkspace('/api/import/errors', {
          method: 'POST',
          body: JSON.stringify({ 
            jobId, 
            action, 
            errorIds: Array.from(selectedErrors),
            options: action === 'resolve' ? { resolution: 'Manually resolved' } : {}
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.details || `${action} failed`)
        }

        setSelectedErrors(new Set())
        fetchErrors()
        
      } else if (action === 'retry') {
        const response = await fetchWithWorkspace('/api/import/retry', {
          method: 'POST',
          body: JSON.stringify({ 
            jobId,
            retryStrategy: 'auto',
            skipErrors: false
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.details || 'Retry failed')
        }

        const data = await response.json()
        setError(null)
        // Show success message or redirect
        console.log('Retry scheduled:', data)
        
      } else if (action === 'clear_all') {
        if (!confirm('Are you sure you want to clear all errors? This action cannot be undone.')) {
          return
        }
        
        const response = await fetchWithWorkspace('/api/import/errors', {
          method: 'POST',
          body: JSON.stringify({ 
            jobId, 
            action: 'clear_all',
            options: { confirmed: true }
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.details || 'Clear all failed')
        }

        setSelectedErrors(new Set())
        fetchErrors()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBulkActionLoading(null)
    }
  }

  // Toggle error selection
  const toggleErrorSelection = (errorId: string) => {
    setSelectedErrors(prev => {
      const newSet = new Set(prev)
      if (newSet.has(errorId)) {
        newSet.delete(errorId)
      } else {
        newSet.add(errorId)
      }
      return newSet
    })
  }

  // Select all errors on current page
  const toggleSelectAll = () => {
    if (selectedErrors.size === errors.length) {
      setSelectedErrors(new Set())
    } else {
      setSelectedErrors(new Set(errors.map(e => e.id)))
    }
  }

  if (loading && errors.length === 0) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Import Errors</h3>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-3 border rounded-lg animate-pulse">
              <div className="h-4 w-full bg-muted rounded mb-2" />
              <div className="h-3 w-3/4 bg-muted rounded" />
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
        <div>
          <h3 className="text-lg font-semibold">Import Errors</h3>
          {jobFilename && (
            <p className="text-sm text-muted-foreground">{jobFilename}</p>
          )}
        </div>
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
            onClick={() => handleBulkAction('export')}
            disabled={bulkActionLoading === 'export'}
          >
            {bulkActionLoading === 'export' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export
          </Button>
          
          {/* Retry and Clear Actions */}
          {retryStatus?.retryStatus?.canRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('retry')}
              disabled={bulkActionLoading === 'retry'}
              className="text-blue-600 border-blue-200 hover:bg-blue-50"
            >
              {bulkActionLoading === 'retry' ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Retry Import
            </Button>
          )}
          
          {summary && summary.total > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('clear_all')}
              disabled={bulkActionLoading === 'clear_all'}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              {bulkActionLoading === 'clear_all' ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              Clear All
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
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

      {/* Enhanced Statistics */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-red-600" />
              <div className="text-lg font-bold text-red-600">{summary.critical}</div>
            </div>
            <div className="text-xs text-muted-foreground">Critical</div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <div className="text-lg font-bold text-orange-600">{summary.high}</div>
            </div>
            <div className="text-xs text-muted-foreground">High</div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <div className="text-lg font-bold text-yellow-600">{summary.medium}</div>
            </div>
            <div className="text-xs text-muted-foreground">Medium</div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <RefreshCw className="h-4 w-4 text-blue-600" />
              <div className="text-lg font-bold text-blue-600">{summary.retryable}</div>
            </div>
            <div className="text-xs text-muted-foreground">Retryable</div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-red-700" />
              <div className="text-lg font-bold text-red-700">{summary.blocking}</div>
            </div>
            <div className="text-xs text-muted-foreground">Blocking</div>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="h-4 w-4 text-gray-600" />
              <div className="text-lg font-bold">{summary.total}</div>
            </div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
        </div>
      )}
      
      {/* Recovery Recommendations */}
      {statistics?.recoveryRecommendations && statistics.recoveryRecommendations.length > 0 && showRecommendations && (
        <div className="p-4 border rounded-lg bg-blue-50/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-blue-600" />
              <h4 className="font-medium text-blue-900">Recovery Recommendations</h4>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowRecommendations(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {statistics.recoveryRecommendations.slice(0, 3).map((rec, index) => {
              const actionConfig = RECOVERY_ACTION_CONFIG[rec.action as keyof typeof RECOVERY_ACTION_CONFIG]
              const severityConfig = SEVERITY_CONFIG[rec.severity as keyof typeof SEVERITY_CONFIG]
              return (
                <div key={index} className="flex items-start gap-3 p-2 bg-white rounded border">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <severityConfig.icon className={cn("h-4 w-4 flex-shrink-0", severityConfig.color)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {rec.count} errors
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className={cn(
                            "text-xs",
                            rec.estimatedEffort === 'low' ? 'bg-green-100 text-green-800' :
                            rec.estimatedEffort === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          )}
                        >
                          {rec.estimatedEffort} effort
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700">{rec.recommendation}</p>
                    </div>
                  </div>
                  {actionConfig && (
                    <actionConfig.icon className={cn("h-4 w-4 flex-shrink-0", actionConfig.color)} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Enhanced Error Type Breakdown */}
      {statistics && statistics.errorTypeBreakdown.length > 0 && (
        <div className="p-4 border rounded-lg">
          <h4 className="font-medium mb-3">Error Types</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {statistics.errorTypeBreakdown
              .sort((a, b) => b.count - a.count)
              .slice(0, 8)
              .map(errorType => {
                const severityConfig = SEVERITY_CONFIG[errorType.severity as keyof typeof SEVERITY_CONFIG]
                return (
                  <div key={errorType.type} className={cn(
                    "flex items-center justify-between p-3 border rounded transition-colors cursor-pointer hover:bg-muted/50",
                    errorType.uiConfig?.bgColor || 'bg-gray-50'
                  )} onClick={() => updateFilter('errorType', errorType.type)}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <severityConfig.icon className={cn("h-4 w-4 flex-shrink-0", severityConfig.color)} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {errorType.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </div>
                        <div className="text-xs text-muted-foreground">{errorType.severity}</div>
                      </div>
                    </div>
                    <Badge variant="secondary">{errorType.count}</Badge>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="p-4 border rounded-lg space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Search</label>
              <Input
                placeholder="Search errors..."
                value={filters.search || ''}
                onChange={(e) => updateFilter('search', e.target.value || undefined)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Severity</label>
              <select
                className="w-full p-2 border rounded-md text-sm"
                value={filters.severity || ''}
                onChange={(e) => updateFilter('severity', e.target.value || undefined)}
              >
                <option value="">All Severities</option>
                {Object.entries(SEVERITY_CONFIG).map(([severity, config]) => (
                  <option key={severity} value={severity}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Category</label>
              <select
                className="w-full p-2 border rounded-md text-sm"
                value={filters.category || ''}
                onChange={(e) => updateFilter('category', e.target.value || undefined)}
              >
                <option value="">All Categories</option>
                {Object.entries(CATEGORY_CONFIG).map(([category, config]) => (
                  <option key={category} value={category}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <select
                className="w-full p-2 border rounded-md text-sm"
                value={filters.resolved || ''}
                onChange={(e) => updateFilter('resolved', e.target.value || undefined)}
              >
                <option value="">All Status</option>
                <option value="false">Unresolved</option>
                <option value="true">Resolved</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Sort By</label>
              <select
                className="w-full p-2 border rounded-md text-sm"
                value={filters.sortBy || 'created_at'}
                onChange={(e) => updateFilter('sortBy', e.target.value)}
              >
                <option value="created_at">Created Date</option>
                <option value="row_no">Row Number</option>
                <option value="severity">Severity</option>
                <option value="error_type">Error Type</option>
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Order</label>
              <select
                className="w-full p-2 border rounded-md text-sm"
                value={filters.sortOrder || 'desc'}
                onChange={(e) => updateFilter('sortOrder', e.target.value)}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilters({})
                setCurrentPage(1)
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Actions */}
      {errors.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedErrors.size === errors.length}
              onChange={toggleSelectAll}
              className="rounded"
            />
            <span className="text-sm">
              {selectedErrors.size > 0 
                ? `${selectedErrors.size} selected`
                : `${errors.length} errors`
              }
            </span>
          </div>

          {selectedErrors.size > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkAction('dismiss')}
                disabled={bulkActionLoading === 'dismiss'}
              >
                {bulkActionLoading === 'dismiss' ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Dismiss Selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkAction('resolve')}
                disabled={bulkActionLoading === 'resolve'}
              >
                {bulkActionLoading === 'resolve' ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Target className="h-4 w-4 mr-2" />
                )}
                Resolve Selected
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Errors List */}
      <div className="space-y-2">
        {errors.map((errorItem) => (
          <ErrorRow
            key={errorItem.id}
            error={errorItem}
            selected={selectedErrors.has(errorItem.id)}
            onToggleSelect={() => toggleErrorSelection(errorItem.id)}
          />
        ))}

        {errors.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50 text-green-600" />
            <p className="text-lg font-medium">No errors found</p>
            <p className="text-sm mt-1">
              {Object.keys(filters).some(key => filters[key as keyof ErrorFilters])
                ? 'Try adjusting your filters'
                : 'This import has no validation errors'
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

interface ErrorRowProps {
  error: ImportError
  selected: boolean
  onToggleSelect: () => void
}

function ErrorRow({ error, selected, onToggleSelect }: ErrorRowProps) {
  const [showDetails, setShowDetails] = useState(false)
  const severityConfig = SEVERITY_CONFIG[error.severity] || SEVERITY_CONFIG.info
  const categoryConfig = CATEGORY_CONFIG[error.category] || CATEGORY_CONFIG.unknown
  const recoveryConfig = RECOVERY_ACTION_CONFIG[error.recoveryStrategy] || RECOVERY_ACTION_CONFIG.no_action
  const SeverityIcon = severityConfig.icon
  const CategoryIcon = categoryConfig.icon
  const RecoveryIcon = recoveryConfig.icon

  return (
    <div className={cn(
      "border rounded-lg transition-colors",
      selected ? "bg-blue-50 border-blue-200" : "hover:bg-muted/50",
      error.resolved ? "opacity-60" : ""
    )}>
      <div className="p-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-1 rounded"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-1">
                <SeverityIcon className={cn("h-4 w-4", severityConfig.color)} />
                <Badge 
                  variant="outline" 
                  className={cn("text-xs px-1.5 py-0.5", severityConfig.color, severityConfig.bg)}
                >
                  {severityConfig.label}
                </Badge>
              </div>
              
              <div className="flex items-center gap-1">
                <CategoryIcon className={cn("h-3 w-3", categoryConfig.color)} />
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                  {categoryConfig.label}
                </Badge>
              </div>
              
              <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                Row {error.row}
              </Badge>
              
              {error.field && (
                <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                  {error.field}
                </Badge>
              )}
              
              {error.resolved && (
                <Badge variant="outline" className="text-xs px-1.5 py-0.5 text-green-600 border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Resolved
                </Badge>
              )}
              
              {error.dismissed && (
                <Badge variant="outline" className="text-xs px-1.5 py-0.5 text-gray-600 border-gray-200">
                  Dismissed
                </Badge>
              )}
              
              {error.retryCount > 0 && (
                <Badge variant="outline" className="text-xs px-1.5 py-0.5 text-blue-600 border-blue-200">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  {error.retryCount}/{error.maxRetries}
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium leading-relaxed">{error.message}</p>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {error.value && (
                    <div className="flex items-center gap-1">
                      <span>Value:</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs max-w-32 truncate">
                        {String(error.value)}
                      </code>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-1">
                    <RecoveryIcon className={cn("h-3 w-3", recoveryConfig.color)} />
                    <span>{recoveryConfig.label}</span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{new Date(error.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setShowDetails(!showDetails)}
                  title={showDetails ? "Hide details" : "Show details"}
                >
                  <Eye className={cn("h-3 w-3 transition-transform", showDetails && "rotate-90")} />
                </Button>
              </div>
              
              {/* Expandable Details */}
              {showDetails && (
                <div className="mt-3 p-3 bg-muted/30 rounded border text-xs space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium text-muted-foreground">Error Type:</span>
                      <div className="mt-1">{error.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Recovery Strategy:</span>
                      <div className="mt-1">{error.recoveryStrategy.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                    </div>
                  </div>
                  
                  {error.resolution && (
                    <div>
                      <span className="font-medium text-muted-foreground">Resolution:</span>
                      <div className="mt-1 text-green-700">{error.resolution}</div>
                    </div>
                  )}
                  
                  {error.additionalContext && Object.keys(error.additionalContext).length > 0 && (
                    <div>
                      <span className="font-medium text-muted-foreground">Additional Context:</span>
                      <pre className="mt-1 text-xs bg-white p-2 rounded border overflow-x-auto max-h-20">
                        {JSON.stringify(error.additionalContext, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  <div className="text-xs text-muted-foreground pt-1 border-t">
                    Error ID: {error.id}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}