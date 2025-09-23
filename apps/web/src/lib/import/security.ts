/**
 * Security utilities for import functionality
 * Provides file validation, input sanitization, and security checks
 */

import crypto from 'crypto'

export interface SecurityConfig {
  maxFileSize: number // in bytes
  allowedMimeTypes: string[]
  allowedExtensions: string[]
  maxFilenameLength: number
  bannedKeywords: string[]
  scanForMaliciousContent: boolean
}

export interface FileValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  metadata: {
    size: number
    type: string
    extension: string
    hash: string
    encoding?: string
  }
}

// Default security configuration
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedMimeTypes: [
    'text/csv',
    'application/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],
  allowedExtensions: ['.csv', '.txt'],
  maxFilenameLength: 255,
  bannedKeywords: [
    'script',
    'javascript',
    'vbscript',
    'onload',
    'onerror',
    'eval',
    'function',
    'document',
    'window',
    '<script',
    '</script',
    'href=',
    'src=',
    'data:'
  ],
  scanForMaliciousContent: true
}

/**
 * Comprehensive file validation with security checks
 */
export function validateFile(file: File, config: SecurityConfig = DEFAULT_SECURITY_CONFIG): FileValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Basic file checks
  if (!file) {
    errors.push('No file provided')
    return {
      isValid: false,
      errors,
      warnings,
      metadata: {
        size: 0,
        type: '',
        extension: '',
        hash: ''
      }
    }
  }

  // File size validation
  if (file.size > config.maxFileSize) {
    errors.push(`File size exceeds maximum allowed size of ${Math.round(config.maxFileSize / 1024 / 1024)}MB`)
  }

  if (file.size === 0) {
    errors.push('File is empty')
  }

  // File type validation
  const fileExtension = getFileExtension(file.name)
  if (!config.allowedExtensions.includes(fileExtension)) {
    errors.push(`File extension '${fileExtension}' is not allowed. Allowed extensions: ${config.allowedExtensions.join(', ')}`)
  }

  if (file.type && !config.allowedMimeTypes.includes(file.type)) {
    warnings.push(`MIME type '${file.type}' is not in the approved list`)
  }

  // Filename validation
  if (file.name.length > config.maxFilenameLength) {
    errors.push(`Filename is too long (max ${config.maxFilenameLength} characters)`)
  }

  // Filename security checks
  const sanitizedFilename = sanitizeFilename(file.name)
  if (sanitizedFilename !== file.name) {
    warnings.push('Filename contains potentially unsafe characters')
  }

  // Check for banned keywords in filename
  const filenameLower = file.name.toLowerCase()
  const foundKeywords = config.bannedKeywords.filter(keyword => 
    filenameLower.includes(keyword.toLowerCase())
  )
  if (foundKeywords.length > 0) {
    errors.push(`Filename contains banned keywords: ${foundKeywords.join(', ')}`)
  }

  // Generate file hash for duplicate detection
  const hash = generateFileHash(file)

  const metadata = {
    size: file.size,
    type: file.type || 'unknown',
    extension: fileExtension,
    hash
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    metadata
  }
}

/**
 * Validate CSV content for malicious patterns
 */
export async function validateCSVContent(content: string, config: SecurityConfig = DEFAULT_SECURITY_CONFIG): Promise<{
  isValid: boolean
  errors: string[]
  warnings: string[]
  sanitizedContent?: string
}> {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content || content.trim().length === 0) {
    errors.push('CSV content is empty')
    return { isValid: false, errors, warnings }
  }

  // Check content size
  const contentSize = new Blob([content]).size
  if (contentSize > config.maxFileSize) {
    errors.push('CSV content exceeds size limit')
  }

  let sanitizedContent = content

  if (config.scanForMaliciousContent) {
    // Check for script injections
    const scriptPatterns = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /data:text\/html/gi,
      /on\w+\s*=/gi, // Event handlers like onclick, onload
      /eval\s*\(/gi,
      /function\s*\(/gi,
      /document\./gi,
      /window\./gi
    ]

    for (const pattern of scriptPatterns) {
      if (pattern.test(content)) {
        errors.push('CSV content contains potentially malicious script patterns')
        break
      }
    }

    // Check for SQL injection patterns
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
      /([\'\"])\s*;\s*\w+/gi
    ]

    for (const pattern of sqlPatterns) {
      if (pattern.test(content)) {
        warnings.push('CSV content contains SQL-like patterns that may need review')
        break
      }
    }

    // Sanitize content by removing dangerous patterns
    sanitizedContent = sanitizeCSVContent(content)
    
    if (sanitizedContent !== content) {
      warnings.push('Content was sanitized to remove potentially unsafe elements')
    }
  }

  // Check for excessively long lines that might indicate malicious content
  const lines = content.split('\n')
  const maxLineLength = 10000 // 10KB per line
  const longLines = lines.filter(line => line.length > maxLineLength)
  
  if (longLines.length > 0) {
    warnings.push(`Found ${longLines.length} lines exceeding ${maxLineLength} characters`)
  }

  // Check for suspicious character encodings
  const suspiciousChars = content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g)
  if (suspiciousChars && suspiciousChars.length > 0) {
    warnings.push('Content contains unusual control characters')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    sanitizedContent
  }
}

/**
 * Sanitize filename to remove potentially dangerous characters
 */
export function sanitizeFilename(filename: string): string {
  // Remove or replace dangerous characters
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Remove invalid filename characters
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 255) // Limit length
}

/**
 * Sanitize CSV content by removing potentially dangerous elements
 */
export function sanitizeCSVContent(content: string): string {
  return content
    // Remove script tags
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '[REMOVED_SCRIPT]')
    // Remove javascript: URLs
    .replace(/javascript:/gi, 'javascript_removed:')
    // Remove event handlers
    .replace(/on\w+\s*=/gi, 'onevent_removed=')
    // Remove data: URLs with HTML
    .replace(/data:text\/html[^,]*,/gi, 'data_removed:')
    // Remove eval calls
    .replace(/eval\s*\(/gi, 'eval_removed(')
    // Escape potential formula injections (Excel/Sheets)
    .replace(/^[\+\-\=@]/gm, "'$&")
}

/**
 * Generate file hash for duplicate detection and integrity checking
 */
export function generateFileHash(file: File): string {
  // For client-side, we'll use the file properties to create a pseudo-hash
  // In production, you'd want to hash the actual file content on the server
  const hashInput = `${file.name}-${file.size}-${file.lastModified}-${file.type}`
  return crypto.createHash('md5').update(hashInput).digest('hex')
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  return filename.toLowerCase().match(/\.[^.]*$/)?.[0] || ''
}

/**
 * Check if a file is potentially a CSV based on content analysis
 */
export function detectCSVContent(content: string): {
  isLikelyCSV: boolean
  confidence: number
  issues: string[]
} {
  const issues: string[] = []
  let confidence = 0

  // Check for basic CSV characteristics
  const lines = content.split('\n').filter(line => line.trim().length > 0)
  
  if (lines.length === 0) {
    return { isLikelyCSV: false, confidence: 0, issues: ['No content'] }
  }

  // Check for consistent comma separation
  const commaCounts = lines.slice(0, 10).map(line => (line.match(/,/g) || []).length)
  const avgCommas = commaCounts.reduce((a, b) => a + b, 0) / commaCounts.length
  const commaVariance = commaCounts.reduce((sum, count) => sum + Math.pow(count - avgCommas, 2), 0) / commaCounts.length

  if (avgCommas > 0) {
    confidence += 30
    if (commaVariance < 2) {
      confidence += 20 // Consistent comma count is good
    }
  } else {
    issues.push('No commas found in sample lines')
  }

  // Check for quoted fields
  const quotedFieldPattern = /"[^"]*"/g
  const hasQuotedFields = lines.some(line => quotedFieldPattern.test(line))
  if (hasQuotedFields) {
    confidence += 20
  }

  // Check for reasonable line length consistency
  const lineLengths = lines.slice(0, 10).map(line => line.length)
  const avgLineLength = lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length
  const lengthVariance = lineLengths.reduce((sum, len) => sum + Math.pow(len - avgLineLength, 2), 0) / lineLengths.length

  if (lengthVariance / avgLineLength < 0.5) {
    confidence += 15 // Consistent line lengths
  }

  // Check for suspicious content that shouldn't be in CSV
  const suspiciousPatterns = [
    /<[^>]+>/g, // HTML tags
    /\{[\s\S]*\}/g, // JSON-like objects
    /function\s*\(/g, // JavaScript functions
  ]

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(content)) {
      confidence -= 20
      issues.push(`Suspicious pattern found: ${pattern.source}`)
    }
  }

  // Additional points for having a reasonable number of columns
  if (avgCommas >= 2 && avgCommas <= 50) {
    confidence += 15
  }

  confidence = Math.max(0, Math.min(100, confidence))

  return {
    isLikelyCSV: confidence >= 60,
    confidence,
    issues
  }
}

/**
 * Rate limiting helper for import operations
 */
export class ImportRateLimit {
  private attempts: Map<string, number[]> = new Map()
  private readonly maxAttempts: number
  private readonly windowMs: number

  constructor(maxAttempts = 10, windowMs = 60000) {
    this.maxAttempts = maxAttempts
    this.windowMs = windowMs
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now()
    const attempts = this.attempts.get(identifier) || []
    
    // Remove old attempts outside the window
    const recentAttempts = attempts.filter(timestamp => now - timestamp < this.windowMs)
    
    if (recentAttempts.length >= this.maxAttempts) {
      return false
    }

    // Add current attempt
    recentAttempts.push(now)
    this.attempts.set(identifier, recentAttempts)
    
    return true
  }

  getRemainingAttempts(identifier: string): number {
    const now = Date.now()
    const attempts = this.attempts.get(identifier) || []
    const recentAttempts = attempts.filter(timestamp => now - timestamp < this.windowMs)
    
    return Math.max(0, this.maxAttempts - recentAttempts.length)
  }

  getResetTime(identifier: string): number {
    const attempts = this.attempts.get(identifier) || []
    if (attempts.length === 0) return 0
    
    const oldestAttempt = Math.min(...attempts)
    return oldestAttempt + this.windowMs
  }
}

/**
 * Workspace isolation helper
 */
export function validateWorkspaceAccess(workspaceId: string, allowedWorkspaces: string[]): boolean {
  if (!workspaceId || typeof workspaceId !== 'string') {
    return false
  }

  // Basic format validation (UUID-like)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidPattern.test(workspaceId)) {
    return false
  }

  return allowedWorkspaces.includes(workspaceId)
}

/**
 * Input sanitization for API parameters
 */
export function sanitizeApiInput(input: any): any {
  if (typeof input === 'string') {
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML
      .substring(0, 1000) // Limit length
  }

  if (typeof input === 'number') {
    return isFinite(input) ? input : 0
  }

  if (Array.isArray(input)) {
    return input.slice(0, 100).map(sanitizeApiInput) // Limit array size
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(input)) {
      if (typeof key === 'string' && key.length <= 100) {
        sanitized[key] = sanitizeApiInput(value)
      }
    }
    return sanitized
  }

  return input
}