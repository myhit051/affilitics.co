"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useWorkspaceAPI } from "@/hooks/use-workspace"
import {
  Download,
  FileText,
  AlertTriangle,
  CheckCircle,
  Info,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Copy
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { getPlatformDisplayName } from "@/lib/import/platform-configs"

interface DataPreviewProps {
  jobId: string
  onClose?: () => void
  className?: string
}

interface PreviewData {
  job: {
    id: string
    platform: string
    filename: string
    status: string
    totalRows: number
    validRows: number
    errorCount: number
  }
  headers: string[]
  sampleData: Record<string, any>[]
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
    duplicateRows: number
  }
  validationSummary: string
  requiredHeaders: string[]
  optionalHeaders: string[]
}

export function DataPreview({ jobId, onClose, className }: DataPreviewProps) {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: string } | null>(null)

  const rowsPerPage = 10
  
  // Security: Use secure workspace API for all requests
  const { fetchWithWorkspace, workspaceId } = useWorkspaceAPI()

  useEffect(() => {
    fetchPreviewData()
  }, [jobId])

  const fetchPreviewData = async () => {
    // Security: Validate workspace context before making requests
    if (!workspaceId) {
      setError('No workspace selected')
      setLoading(false)
      return
    }
    
    try {
      setLoading(true)
      setError(null)

      // Security: Use secure workspace API with automatic context headers
      const response = await fetchWithWorkspace(`/api/import/validate?jobId=${jobId}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || errorData.error || 'Failed to fetch preview')
      }

      const data = await response.json()
      setPreviewData(data)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch preview'
      setError(errorMessage)
      console.error('Fetch preview error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter data based on search term
  const filteredData = React.useMemo(() => {
    if (!previewData?.sampleData || !searchTerm) {
      return previewData?.sampleData || []
    }

    return previewData.sampleData.filter(row =>
      Object.values(row).some(value =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    )
  }, [previewData?.sampleData, searchTerm])

  // Paginate filtered data
  const paginatedData = React.useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage
    return filteredData.slice(startIndex, startIndex + rowsPerPage)
  }, [filteredData, currentPage])

  const totalPages = Math.ceil(filteredData.length / rowsPerPage)

  // Copy cell value to clipboard
  const copyCellValue = async (value: any) => {
    try {
      await navigator.clipboard.writeText(String(value))
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Export preview data as CSV
  const exportPreview = () => {
    if (!previewData) return

    const headers = previewData.headers
    let csvContent = headers.join(',') + '\n'

    filteredData.forEach(row => {
      const values = headers.map(header => {
        const value = row[header] || ''
        // Escape values that contain commas or quotes
        if (String(value).includes(',') || String(value).includes('"')) {
          return `"${String(value).replace(/"/g, '""')}"`
        }
        return value
      })
      csvContent += values.join(',') + '\n'
    })

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `preview_${previewData.job.filename}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Data Preview</h3>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading preview data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Data Preview</h3>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <div>
            <p className="font-medium">Preview Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </Alert>
        
        <Button onClick={fetchPreviewData} variant="outline">
          Try Again
        </Button>
      </div>
    )
  }

  if (!previewData) return null

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Data Preview</h3>
          <p className="text-sm text-muted-foreground">
            {previewData.job.filename} • {getPlatformDisplayName(previewData.job.platform)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportPreview}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-3 border rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium">Total Rows</span>
          </div>
          <div className="text-2xl font-bold">{previewData.summary.totalRows}</div>
        </div>
        
        <div className="p-3 border rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium">Valid Rows</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{previewData.summary.validRows}</div>
        </div>
        
        <div className="p-3 border rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-medium">Invalid Rows</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{previewData.summary.invalidRows}</div>
        </div>
        
        <div className="p-3 border rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Info className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-medium">Duplicates</span>
          </div>
          <div className="text-2xl font-bold text-orange-600">{previewData.summary.duplicateRows}</div>
        </div>
      </div>

      {/* Validation Summary */}
      {previewData.validationSummary && (
        <Alert>
          <Info className="h-4 w-4" />
          <div>
            <p className="font-medium">Validation Summary</p>
            <p className="text-sm">{previewData.validationSummary}</p>
          </div>
        </Alert>
      )}

      {/* Headers Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-3 border rounded-lg">
          <h4 className="font-medium mb-2 text-green-700">Required Headers ({previewData.requiredHeaders.length})</h4>
          <div className="flex flex-wrap gap-1">
            {previewData.requiredHeaders.map(header => (
              <Badge 
                key={header} 
                variant={previewData.headers.includes(header) ? "default" : "destructive"}
                className="text-xs"
              >
                {header}
                {previewData.headers.includes(header) ? (
                  <CheckCircle className="h-3 w-3 ml-1" />
                ) : (
                  <X className="h-3 w-3 ml-1" />
                )}
              </Badge>
            ))}
          </div>
        </div>

        <div className="p-3 border rounded-lg">
          <h4 className="font-medium mb-2 text-blue-700">Optional Headers ({previewData.optionalHeaders.length})</h4>
          <div className="flex flex-wrap gap-1">
            {previewData.optionalHeaders.map(header => (
              <Badge 
                key={header} 
                variant={previewData.headers.includes(header) ? "default" : "outline"}
                className="text-xs"
              >
                {header}
                {previewData.headers.includes(header) && (
                  <CheckCircle className="h-3 w-3 ml-1" />
                )}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Search and Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search data..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="w-64"
          />
        </div>
        
        <div className="text-sm text-muted-foreground">
          Showing {Math.min(filteredData.length, rowsPerPage)} of {filteredData.length} rows
        </div>
      </div>

      {/* Data Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left text-xs font-medium text-muted-foreground border-r">
                  #
                </th>
                {previewData.headers.map((header, index) => (
                  <th 
                    key={header} 
                    className="p-2 text-left text-xs font-medium text-muted-foreground border-r min-w-[100px]"
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate">{header}</span>
                      {previewData.requiredHeaders.includes(header) && (
                        <Badge variant="destructive" className="text-[10px] px-1 h-4">
                          REQ
                        </Badge>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b hover:bg-muted/25">
                  <td className="p-2 text-xs text-muted-foreground border-r font-mono">
                    {(currentPage - 1) * rowsPerPage + rowIndex + 1}
                  </td>
                  {previewData.headers.map((header) => (
                    <td 
                      key={`${rowIndex}-${header}`}
                      className="p-2 text-xs border-r relative group cursor-pointer"
                      onClick={() => setSelectedCell({ row: rowIndex, col: header })}
                    >
                      <div className="relative">
                        <div className="truncate max-w-[200px]" title={String(row[header] || '')}>
                          {row[header] || (
                            <span className="text-muted-foreground italic">empty</span>
                          )}
                        </div>
                        
                        {/* Cell actions */}
                        <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              copyCellValue(row[header])
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        
                        {/* Selection highlight */}
                        {selectedCell?.row === rowIndex && selectedCell?.col === header && (
                          <div className="absolute inset-0 bg-blue-100 border-2 border-blue-500 rounded pointer-events-none" />
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {paginatedData.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No data to preview</p>
            {searchTerm && (
              <p className="text-sm mt-1">Try adjusting your search term</p>
            )}
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
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Cell Detail Modal */}
      {selectedCell && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium">Cell Details</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCell(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Column</label>
                <div className="font-medium">{selectedCell.col}</div>
              </div>
              
              <div>
                <label className="text-xs text-muted-foreground">Row</label>
                <div className="font-medium">{selectedCell.row + 1}</div>
              </div>
              
              <div>
                <label className="text-xs text-muted-foreground">Value</label>
                <div className="p-2 bg-muted rounded font-mono text-sm break-all">
                  {String(paginatedData[selectedCell.row]?.[selectedCell.col] || '')}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyCellValue(paginatedData[selectedCell.row]?.[selectedCell.col])}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Value
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}