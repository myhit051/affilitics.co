"use client"

import * as React from "react"
import { useState, useCallback, useRef } from "react"
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  X,
  Download,
  Eye,
  Loader2,
  Camera
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { getPlatformDisplayName, getSupportedPlatforms, generateSampleCSV } from "@/lib/import/platform-configs"
import { useCSRFProtection } from "@/lib/hooks/use-csrf-token"
import { useWorkspace } from "@/contexts/workspace-context"

// Custom hook for mobile detection
const useIsMobile = () => {
  const [isMobile, setIsMobile] = React.useState(false)
  
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  return isMobile
}

interface FileUploadProps {
  onUploadSuccess?: (result: UploadResult) => void
  onUploadError?: (error: string) => void
  onValidationStart?: () => void
  onValidationComplete?: (result: ValidationResult) => void
  platform: string
  setPlatform: (platform: string) => void
  maxFiles?: number
  disabled?: boolean
  className?: string
}

interface UploadResult {
  jobId: string
  platform: string
  filename: string
  size: number
  hash: string
  createdAt: string
  message: string
}

interface ValidationResult {
  isValid: boolean
  errors: Array<{
    row: number
    message: string
    type: string
  }>
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
  }
}

interface FileItem {
  file: File
  id: string
  status: 'pending' | 'uploading' | 'uploaded' | 'validating' | 'validated' | 'error'
  progress: number
  error?: string
  result?: UploadResult
  validation?: ValidationResult
}

export function FileUpload({ 
  onUploadSuccess,
  onUploadError,
  onValidationStart,
  onValidationComplete,
  platform,
  setPlatform,
  maxFiles = 5,
  disabled = false,
  className
}: FileUploadProps) {
  const { currentWorkspace, isAuthenticated } = useWorkspace()
  const [files, setFiles] = useState<FileItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  // Security: CSRF Protection
  const { 
    token: csrfToken, 
    isLoading: csrfLoading, 
    error: csrfError, 
    getValidToken,
    withCSRFHeaders,
    isReady: csrfReady
  } = useCSRFProtection()

  const supportedPlatforms = getSupportedPlatforms()

  // File validation
  const validateFile = useCallback((file: File): string | null => {
    // Check file type
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'application/csv') {
      return 'Only CSV files are allowed'
    }

    // Check file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      return 'File size must not exceed 50MB'
    }

    // Check if file is empty
    if (file.size === 0) {
      return 'File is empty'
    }

    return null
  }, [])

  // Handle file selection
  const handleFileSelect = useCallback((selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles)
    
    if (files.length + fileArray.length > maxFiles) {
      onUploadError?.(`Cannot upload more than ${maxFiles} files at once`)
      return
    }

    const newFiles: FileItem[] = fileArray.map(file => {
      const error = validateFile(file)
      return {
        file,
        id: Math.random().toString(36).substr(2, 9),
        status: error ? 'error' : 'pending',
        progress: 0,
        error: error || undefined
      }
    })

    setFiles(prev => [...prev, ...newFiles])
  }, [files.length, maxFiles, validateFile, onUploadError])

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled) return

    const droppedFiles = e.dataTransfer.files
    if (droppedFiles.length > 0) {
      handleFileSelect(droppedFiles)
    }
  }, [disabled, handleFileSelect])

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (selectedFiles && selectedFiles.length > 0) {
      handleFileSelect(selectedFiles)
    }
    // Reset input value to allow selecting the same file again
    e.target.value = ''
  }, [handleFileSelect])

  // Remove file
  const removeFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }, [])

  // Upload single file
  const uploadFile = async (fileItem: FileItem): Promise<void> => {
    // Security: Ensure we have a valid CSRF token and workspace before upload
    if (!currentWorkspace || !isAuthenticated) {
      throw new Error('Workspace authentication required. Please refresh and try again.')
    }
    
    const validToken = await getValidToken()
    if (!validToken) {
      throw new Error('Security token unavailable. Please refresh the page and try again.')
    }

    const formData = new FormData()
    formData.append('file', fileItem.file)
    formData.append('platform', platform)

    try {
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id 
          ? { ...f, status: 'uploading', progress: 0 }
          : f
      ))

      const response = await fetch('/api/import/upload', {
        method: 'POST',
        body: formData,
        headers: withCSRFHeaders({
          'x-workspace-id': currentWorkspace.id
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || errorData.error || 'Upload failed')
      }

      const result: UploadResult = await response.json()

      setFiles(prev => prev.map(f => 
        f.id === fileItem.id 
          ? { ...f, status: 'uploaded', progress: 100, result }
          : f
      ))

      onUploadSuccess?.(result)

      // Auto-validate after upload
      if (result.jobId) {
        await validateUpload(fileItem.id, result.jobId)
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id 
          ? { ...f, status: 'error', error: errorMessage }
          : f
      ))

      onUploadError?.(errorMessage)
    }
  }

  // Validate uploaded file
  const validateUpload = async (fileId: string, jobId: string): Promise<void> => {
    // Security: Ensure we have a valid CSRF token and workspace before validation
    if (!currentWorkspace || !isAuthenticated) {
      throw new Error('Workspace authentication required. Please refresh and try again.')
    }
    
    const validToken = await getValidToken()
    if (!validToken) {
      throw new Error('Security token unavailable. Please refresh the page and try again.')
    }

    try {
      setFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { ...f, status: 'validating' }
          : f
      ))

      onValidationStart?.()

      const response = await fetch('/api/import/validate', {
        method: 'POST',
        headers: withCSRFHeaders({
          'Content-Type': 'application/json',
          'x-workspace-id': currentWorkspace.id
        }),
        body: JSON.stringify({ jobId, preview: true })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || errorData.error || 'Validation failed')
      }

      const validationResult = await response.json()

      setFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { 
              ...f, 
              status: 'validated', 
              validation: {
                isValid: validationResult.isValid,
                errors: validationResult.criticalErrors || [],
                summary: validationResult.summary
              }
            }
          : f
      ))

      onValidationComplete?.(validationResult)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed'
      
      setFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { ...f, status: 'error', error: errorMessage }
          : f
      ))
    }
  }

  // Upload all pending files
  const uploadAllFiles = async () => {
    if (!platform) {
      onUploadError?.('Please select a platform')
      return
    }

    const pendingFiles = files.filter(f => f.status === 'pending')
    if (pendingFiles.length === 0) return

    setIsUploading(true)

    try {
      await Promise.all(pendingFiles.map(uploadFile))
    } finally {
      setIsUploading(false)
    }
  }

  // Download sample CSV
  const downloadSample = useCallback(() => {
    if (!platform) return

    try {
      const csvContent = generateSampleCSV(platform)
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${platform}_sample.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      onUploadError?.('Failed to generate sample file')
    }
  }, [platform, onUploadError])

  const hasFiles = files.length > 0
  const hasPendingFiles = files.some(f => f.status === 'pending')
  const hasValidFiles = files.some(f => f.status === 'validated' && f.validation?.isValid)

  // Security: Component is disabled if CSRF protection is not ready or no workspace
  const isComponentDisabled = disabled || !csrfReady || csrfLoading || !currentWorkspace || !isAuthenticated

  return (
    <div className={cn(
      "space-y-4",
      isMobile && "space-y-3",
      className
    )}>
      {/* Security: CSRF Status Indicators */}
      {csrfError && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <div>
            <p className="font-medium">Security Error</p>
            <p className="text-sm">{csrfError}. Please refresh the page to continue.</p>
          </div>
        </Alert>
      )}
      
      {csrfLoading && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <div>
            <p className="font-medium">Loading Security Components</p>
            <p className="text-sm">Preparing secure upload environment...</p>
          </div>
        </Alert>
      )}
      {/* Platform Selection */}
      <div className="space-y-2">
        <label className={cn(
          "font-medium",
          isMobile ? "text-base" : "text-sm"
        )}>Platform</label>
        <div className={cn(
          "grid gap-2",
          isMobile ? "grid-cols-1" : "flex flex-wrap"
        )}>
          {supportedPlatforms.map((p) => (
            <Button
              key={p}
              variant={platform === p ? "default" : "outline"}
              size={isMobile ? "default" : "sm"}
              onClick={() => setPlatform(p)}
              disabled={isComponentDisabled || isUploading}
              className={cn(
                "touch-manipulation",
                isMobile && "min-h-[44px] justify-center"
              )}
            >
              {getPlatformDisplayName(p)}
            </Button>
          ))}
        </div>
        {platform && (
          <div className={cn(
            "flex items-center gap-2 text-muted-foreground",
            isMobile ? "text-sm flex-wrap" : "text-sm"
          )}>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 flex-shrink-0" />
              <span className="break-words">Selected: {getPlatformDisplayName(platform)}</span>
            </div>
            <Button
              variant="ghost"
              size={isMobile ? "sm" : "sm"}
              onClick={downloadSample}
              className={cn(
                "h-auto p-1 text-xs touch-manipulation",
                isMobile && "min-h-[32px] px-2"
              )}
            >
              <Download className="h-3 w-3 mr-1" />
              Sample
            </Button>
          </div>
        )}
      </div>

      {/* Upload Area */}
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg text-center transition-colors",
          isMobile ? "p-6" : "p-8",
          isDragging && !disabled
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "hover:border-muted-foreground/50 cursor-pointer"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isComponentDisabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv,application/csv"
          multiple={maxFiles > 1}
          onChange={handleFileInputChange}
          className="sr-only"
          disabled={isComponentDisabled}
        />
        
        {/* Mobile camera input for document scanning */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            // Handle camera capture - would need OCR processing
            console.log('Camera capture:', e.target.files)
          }}
          className="sr-only"
          disabled={isComponentDisabled}
        />

        <div className={cn(
          "space-y-2",
          isMobile && "space-y-3"
        )}>
          <Upload className={cn(
            "mx-auto text-muted-foreground",
            isMobile ? "h-10 w-10" : "h-12 w-12"
          )} />
          <div>
            <p className={cn(
              "font-medium",
              isMobile ? "text-base" : "text-lg"
            )}>
              {isMobile ? "Tap to select files" : "Drop CSV files here or click to browse"}
            </p>
            <p className={cn(
              "text-muted-foreground leading-relaxed",
              isMobile ? "text-xs" : "text-sm"
            )}>
              Supports {supportedPlatforms.map(getPlatformDisplayName).join(', ')} formats
            </p>
          </div>
          
          {/* Mobile-specific buttons */}
          {isMobile && (
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
                disabled={isComponentDisabled}
                className="touch-manipulation min-h-[44px] flex-1"
              >
                <FileText className="h-4 w-4 mr-2" />
                Choose Files
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  cameraInputRef.current?.click()
                }}
                disabled={isComponentDisabled}
                className="touch-manipulation min-h-[44px] flex-1"
                title="Scan document with camera"
              >
                <Camera className="h-4 w-4 mr-2" />
                Scan Document
              </Button>
            </div>
          )}
          
          <div className={cn(
            "text-muted-foreground",
            isMobile ? "text-xs space-y-1" : "text-xs"
          )}>
            {isMobile ? (
              <>
                <div>Maximum file size: 50MB</div>
                <div>Maximum files: {maxFiles}</div>
              </>
            ) : (
              <div>Maximum file size: 50MB • Maximum files: {maxFiles}</div>
            )}
          </div>
        </div>
      </div>

      {/* Platform Not Selected Warning */}
      {!platform && hasFiles && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <div>
            <p className="font-medium">Platform Required</p>
            <p className="text-sm">Please select a platform before uploading files.</p>
          </div>
        </Alert>
      )}

      {/* File List */}
      {hasFiles && (
        <div className={cn(
          "space-y-3",
          isMobile && "space-y-2"
        )}>
          <div className="flex items-center justify-between">
            <h3 className={cn(
              "font-medium",
              isMobile ? "text-base" : "text-sm"
            )}>
              Files ({files.length}/{maxFiles})
            </h3>
            {hasPendingFiles && platform && (
              <Button
                onClick={uploadAllFiles}
                disabled={isUploading || isComponentDisabled}
                size={isMobile ? "default" : "sm"}
                className={cn(
                  "touch-manipulation",
                  isMobile && "min-h-[44px]"
                )}
              >
                {isUploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Upload All
              </Button>
            )}
          </div>

          <div className={cn(
            "space-y-2",
            isMobile && "space-y-1.5"
          )}>
            {files.map((fileItem) => (
              <FileItemRow
                key={fileItem.id}
                fileItem={fileItem}
                onRemove={() => removeFile(fileItem.id)}
                onRetry={() => uploadFile(fileItem)}
                onValidate={() => fileItem.result && validateUpload(fileItem.id, fileItem.result.jobId)}
                disabled={isComponentDisabled}
                isMobile={isMobile}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upload Summary */}
      {hasValidFiles && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <div>
            <p className="font-medium">Files Ready</p>
            <p className="text-sm">
              {files.filter(f => f.status === 'validated' && f.validation?.isValid).length} file(s) 
              validated and ready for processing.
            </p>
          </div>
        </Alert>
      )}
    </div>
  )
}

interface FileItemRowProps {
  fileItem: FileItem
  onRemove: () => void
  onRetry: () => void
  onValidate: () => void
  disabled: boolean
  isMobile?: boolean
}

function FileItemRow({ fileItem, onRemove, onRetry, onValidate, disabled, isMobile }: FileItemRowProps) {
  const getStatusIcon = () => {
    switch (fileItem.status) {
      case 'pending':
        return <FileText className="h-4 w-4 text-muted-foreground" />
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      case 'uploaded':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'validating':
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />
      case 'validated':
        return fileItem.validation?.isValid 
          ? <CheckCircle className="h-4 w-4 text-green-600" />
          : <AlertCircle className="h-4 w-4 text-orange-600" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusBadge = () => {
    switch (fileItem.status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>
      case 'uploading':
        return <Badge variant="outline" className="border-blue-200 text-blue-800">Uploading</Badge>
      case 'uploaded':
        return <Badge variant="default" className="bg-green-100 text-green-800">Uploaded</Badge>
      case 'validating':
        return <Badge variant="outline" className="border-yellow-200 text-yellow-800">Validating</Badge>
      case 'validated':
        return fileItem.validation?.isValid 
          ? <Badge variant="default" className="bg-green-100 text-green-800">Valid</Badge>
          : <Badge variant="outline" className="border-orange-200 text-orange-800">Has Warnings</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg">
      {getStatusIcon()}
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium truncate">{fileItem.file.name}</p>
          {getStatusBadge()}
        </div>
        
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{(fileItem.file.size / 1024).toFixed(1)} KB</span>
          {fileItem.validation && (
            <span>
              {fileItem.validation.summary.validRows}/{fileItem.validation.summary.totalRows} valid rows
            </span>
          )}
        </div>

        {fileItem.status === 'uploading' && (
          <div className="mt-2">
            <div className="w-full bg-muted rounded-full h-1">
              <div 
                className="bg-primary h-1 rounded-full transition-all"
                style={{ width: `${fileItem.progress}%` }}
              />
            </div>
          </div>
        )}

        {fileItem.error && (
          <div className="mt-1 text-xs text-red-600">
            {fileItem.error}
          </div>
        )}

        {fileItem.validation && !fileItem.validation.isValid && fileItem.validation.errors.length > 0 && (
          <div className="mt-1 text-xs text-orange-600">
            {fileItem.validation.errors.length} validation error(s)
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {fileItem.status === 'validated' && fileItem.validation && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Preview data"
          >
            <Eye className="h-4 w-4" />
          </Button>
        )}

        {fileItem.status === 'error' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            disabled={disabled}
            className="h-8 w-8 p-0"
            title="Retry upload"
          >
            <Upload className="h-4 w-4" />
          </Button>
        )}

        {fileItem.status === 'uploaded' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onValidate}
            disabled={disabled}
            className="h-8 w-8 p-0"
            title="Validate file"
          >
            <CheckCircle className="h-4 w-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={disabled || fileItem.status === 'uploading'}
          className="h-8 w-8 p-0"
          title="Remove file"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}