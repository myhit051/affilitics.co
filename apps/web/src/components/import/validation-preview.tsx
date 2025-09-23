/**
 * CSV Validation Preview Component
 * Real-time validation feedback with detailed error reporting and suggestions
 */

'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Simple Tabs replacement components
const Tabs = ({ children, value, onValueChange, className }: any) => (
  <div className={className} data-value={value} data-onchange={onValueChange}>{children}</div>
)
const TabsList = ({ children, className }: any) => <div className={className}>{children}</div>
const TabsTrigger = ({ children, value, className }: any) => <button className={`px-3 py-2 text-sm rounded ${className}`}>{children}</button>
const TabsContent = ({ children, value, className }: any) => <div className={className}>{children}</div>
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Info, 
  RefreshCw, 
  Download,
  Eye,
  BarChart3,
  FileText,
  Zap,
  Target,
  TrendingUp
} from 'lucide-react'

interface ValidationError {
  row: number
  column?: string
  field?: string
  message: string
  type: string
  severity: 'error' | 'warning' | 'info'
  value?: any
  suggestion?: string
  context?: any
}

interface ValidationStats {
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  processingTime: number
  throughput: number
  memoryUsage: number
  errorsByType: Record<string, number>
}

interface ValidationResult {
  success: boolean
  isValid: boolean
  platform: string
  filename: string
  headers: string[]
  summary: ValidationStats
  criticalErrors: ValidationError[]
  warnings: ValidationError[]
  sampleData: Record<string, any>[]
  platformDetection?: {
    detected: string | null
    confidence: number
    suggestions: string[]
    analysis: any
  }
  stats: {
    processingTime: number
    throughput: number
    memoryUsage: number
    errorsByType: Record<string, number>
  }
  errorBreakdown: {
    byType: Record<string, number>
    bySeverity: {
      errors: number
      warnings: number
      info: number
    }
    byCategory: Record<string, number>
  }
  suggestions: Array<{
    type: string
    message: string
    action: string
  }>
  quality: {
    structureScore: number
    dataQualityScore: number
    completenessRatio: number
    duplicateRatio: number
  }
}

interface ValidationPreviewProps {
  jobId: string
  onValidationComplete?: (result: ValidationResult) => void
  onRetry?: () => void
  autoRefresh?: boolean
  refreshInterval?: number
}

export function ValidationPreview({ 
  jobId, 
  onValidationComplete, 
  onRetry,
  autoRefresh = false,
  refreshInterval = 5000 
}: ValidationPreviewProps) {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [refreshing, setRefreshing] = useState(false)

  const fetchValidationResult = useCallback(async () => {
    try {
      setRefreshing(true)
      const response = await fetch(`/api/import/validate?jobId=${jobId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Validation failed')
      }

      setValidationResult(data)
      setError(null)
      
      if (onValidationComplete) {
        onValidationComplete(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [jobId, onValidationComplete])

  useEffect(() => {
    fetchValidationResult()
  }, [fetchValidationResult])

  useEffect(() => {
    if (autoRefresh && !validationResult?.success) {
      const interval = setInterval(fetchValidationResult, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [autoRefresh, refreshInterval, fetchValidationResult, validationResult?.success])

  const qualityMetrics = useMemo(() => {
    if (!validationResult) return null

    const { quality, summary } = validationResult
    return {
      overall: Math.round((quality.structureScore + quality.dataQualityScore) / 2),
      completeness: Math.round(quality.completenessRatio * 100),
      accuracy: Math.round((summary.validRows / summary.totalRows) * 100),
      duplicates: Math.round(quality.duplicateRatio * 100)
    }
  }, [validationResult])

  const getQualityColor = (score: number) => {
    if (score >= 90) return 'text-green-600'
    if (score >= 70) return 'text-blue-600'
    if (score >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getQualityBadgeVariant = (score: number): "default" | "secondary" | "destructive" | "outline" => {
    if (score >= 90) return 'default'
    if (score >= 70) return 'secondary'
    if (score >= 50) return 'outline'
    return 'destructive'
  }

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Validating CSV file...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!validationResult) return null

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-lg">Validation Results</CardTitle>
            <p className="text-sm text-muted-foreground">
              {validationResult.filename} • {validationResult.platform}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {validationResult.isValid ? (
              <Badge variant="default" className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Valid
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                Invalid
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchValidationResult}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{validationResult.summary.totalRows.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <FileText className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">{validationResult.summary.validRows.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Valid Rows</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-red-600">{validationResult.criticalErrors.length.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-yellow-600">{validationResult.warnings.length.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Warnings</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quality Metrics */}
      {qualityMetrics && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Target className="h-4 w-4 mr-2" />
              Data Quality Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className={`text-2xl font-bold ${getQualityColor(qualityMetrics.overall)}`}>
                  {qualityMetrics.overall}%
                </div>
                <p className="text-xs text-muted-foreground">Overall Quality</p>
                <Progress value={qualityMetrics.overall} className="h-1 mt-1" />
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${getQualityColor(qualityMetrics.completeness)}`}>
                  {qualityMetrics.completeness}%
                </div>
                <p className="text-xs text-muted-foreground">Completeness</p>
                <Progress value={qualityMetrics.completeness} className="h-1 mt-1" />
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${getQualityColor(qualityMetrics.accuracy)}`}>
                  {qualityMetrics.accuracy}%
                </div>
                <p className="text-xs text-muted-foreground">Accuracy</p>
                <Progress value={qualityMetrics.accuracy} className="h-1 mt-1" />
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {100 - qualityMetrics.duplicates}%
                </div>
                <p className="text-xs text-muted-foreground">Uniqueness</p>
                <Progress value={100 - qualityMetrics.duplicates} className="h-1 mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform Detection */}
      {validationResult.platformDetection && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Zap className="h-4 w-4 mr-2" />
              Platform Detection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  Detected: <span className="text-blue-600">{validationResult.platformDetection.detected || 'Unknown'}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Confidence: {Math.round(validationResult.platformDetection.confidence * 100)}%
                </p>
              </div>
              <Badge 
                variant={
                  validationResult.platformDetection.confidence > 0.8 
                    ? 'default' 
                    : validationResult.platformDetection.confidence > 0.6 
                    ? 'secondary' 
                    : 'outline'
                }
              >
                {validationResult.platformDetection.confidence > 0.8 ? 'High Confidence' : 
                 validationResult.platformDetection.confidence > 0.6 ? 'Medium Confidence' : 'Low Confidence'}
              </Badge>
            </div>
            {validationResult.platformDetection.suggestions.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium mb-2">Suggestions:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {validationResult.platformDetection.suggestions.slice(0, 3).map((suggestion, index) => (
                    <li key={index} className="flex items-start">
                      <span className="inline-block w-1 h-1 rounded-full bg-current mt-2 mr-2 flex-shrink-0" />
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detailed Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="errors">
            Errors ({validationResult.criticalErrors.length})
          </TabsTrigger>
          <TabsTrigger value="warnings">
            Warnings ({validationResult.warnings.length})
          </TabsTrigger>
          <TabsTrigger value="data">Sample Data</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Performance Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <TrendingUp className="h-4 w-4 mr-2" />
                Performance Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-lg font-semibold">{formatDuration(validationResult.stats.processingTime)}</div>
                  <p className="text-xs text-muted-foreground">Processing Time</p>
                </div>
                <div>
                  <div className="text-lg font-semibold">{Math.round(validationResult.stats.throughput).toLocaleString()} rows/s</div>
                  <p className="text-xs text-muted-foreground">Throughput</p>
                </div>
                <div>
                  <div className="text-lg font-semibold">{formatBytes(validationResult.stats.memoryUsage)}</div>
                  <p className="text-xs text-muted-foreground">Memory Usage</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <BarChart3 className="h-4 w-4 mr-2" />
                Error Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(validationResult.errorBreakdown.byType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="capitalize text-sm">{type.replace('_', ' ')}</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Suggestions */}
          {validationResult.suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Improvement Suggestions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {validationResult.suggestions.map((suggestion, index) => (
                    <Alert key={index}>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        <p className="font-medium">{suggestion.message}</p>
                        <p className="text-sm text-muted-foreground mt-1">{suggestion.action}</p>
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="errors">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Critical Errors</CardTitle>
              {validationResult.criticalErrors.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  These errors must be fixed before importing
                </p>
              )}
            </CardHeader>
            <CardContent>
              {validationResult.criticalErrors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>No critical errors found!</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {validationResult.criticalErrors.slice(0, 50).map((error, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-600">
                            Row {error.row}: {error.message}
                          </p>
                          {error.field && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Field: {error.field}
                            </p>
                          )}
                          {error.value && (
                            <p className="text-xs text-muted-foreground">
                              Value: "{error.value}"
                            </p>
                          )}
                          {error.suggestion && (
                            <p className="text-xs text-blue-600 mt-1">
                              💡 {error.suggestion}
                            </p>
                          )}
                        </div>
                        <Badge variant="destructive" className="text-xs">
                          {error.type}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {validationResult.criticalErrors.length > 50 && (
                    <div className="text-center py-2 text-sm text-muted-foreground">
                      ... and {validationResult.criticalErrors.length - 50} more errors
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warnings">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Warnings</CardTitle>
              {validationResult.warnings.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  These issues should be reviewed but won't prevent import
                </p>
              )}
            </CardHeader>
            <CardContent>
              {validationResult.warnings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>No warnings found!</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {validationResult.warnings.slice(0, 50).map((warning, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-yellow-600">
                            Row {warning.row}: {warning.message}
                          </p>
                          {warning.field && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Field: {warning.field}
                            </p>
                          )}
                          {warning.suggestion && (
                            <p className="text-xs text-blue-600 mt-1">
                              💡 {warning.suggestion}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {warning.type}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {validationResult.warnings.length > 50 && (
                    <div className="text-center py-2 text-sm text-muted-foreground">
                      ... and {validationResult.warnings.length - 50} more warnings
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <Eye className="h-4 w-4 mr-2" />
                Sample Data Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {validationResult.sampleData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2" />
                  <p>No sample data available</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b">
                        {validationResult.headers.map((header, index) => (
                          <th key={index} className="text-left p-2 font-medium bg-muted">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validationResult.sampleData.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b hover:bg-muted/50">
                          {validationResult.headers.map((header, cellIndex) => (
                            <td key={cellIndex} className="p-2 max-w-32 truncate">
                              {String(row[header] || '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" onClick={fetchValidationResult}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
          {validationResult.isValid && (
            <Button size="sm">
              <Download className="h-3 w-3 mr-1" />
              Proceed with Import
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ValidationPreview