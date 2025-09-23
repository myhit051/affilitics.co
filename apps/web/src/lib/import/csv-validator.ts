/**
 * Advanced CSV Validation Engine with Streaming Support
 * Supports large file processing, platform auto-detection, and comprehensive validation
 */

import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import Papa, { ParseResult, ParseError } from 'papaparse'
// import { CSV_VALIDATION_CONFIG, PLATFORM_VALIDATION_CONFIG, getEffectiveConfig } from '@aff/db'
// Mock for build purposes
const getEffectiveConfig = () => ({
  csvValidation: {
    MAX_FILE_SIZE_MB: 50,
    MAX_ROWS: 100000,
    REQUIRED_COLUMNS: [],
    VALIDATION_CACHE_MAX_ENTRIES: 1000,
    VALIDATION_CACHE_TTL_MINUTES: 30,
    PLATFORM_DETECTION_CONFIDENCE_THRESHOLD: 0.8,
    MAX_VALIDATION_ERRORS: 1000,
    PREVIEW_MAX_ROWS: 100,
    PLATFORM_DETECTION_SAMPLE_SIZE: 50,
    VALIDATION_CHUNK_SIZE: 1000,
    STREAM_CHUNK_SIZE: 100,
    VALIDATION_EARLY_EXIT: true,
    VALIDATION_TIMEOUT_MS: 300000
  },
  features: {
    ENABLE_CSV_VALIDATION_CACHE: true,
    ENABLE_CSV_AUTO_DETECTION: true,
    ENABLE_CSV_STREAMING: true,
    ENABLE_CSV_BUSINESS_RULES: true
  }
})

export interface StreamingValidationOptions {
  enableStreaming?: boolean
  chunkSize?: number
  maxErrors?: number
  earlyExit?: boolean
  preview?: boolean
  previewRows?: number
  timeout?: number
  existingData?: Record<string, any>[]
  validateBusinessRules?: boolean
  enableCache?: boolean
}

export interface ValidationContext {
  platform: string
  config: PlatformCSVConfig
  options: StreamingValidationOptions
  cache: ValidationCache
  stats: ValidationStats
}

export interface ValidationStats {
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  processingTime: number
  memoryUsage: number
  throughput: number
  errorsByType: Record<string, number>
}

export interface ValidationCache {
  enabled: boolean
  entries: Map<string, CachedValidationResult>
  maxEntries: number
  ttlMinutes: number
}

export interface CachedValidationResult {
  result: ParsedCSVData
  timestamp: number
  hash: string
}

export interface ValidationError {
  row: number
  column?: string
  field?: string
  message: string
  type: 'missing' | 'invalid_type' | 'invalid_format' | 'duplicate' | 'business_rule' | 'unknown' | 'critical'
  value?: any
  suggestion?: string
  severity: 'error' | 'warning' | 'info'
  context?: {
    lineContent?: string
    surroundingLines?: string[]
    fieldPosition?: number
  }
}

export interface ParsedCSVData {
  headers: string[]
  data: Record<string, any>[]
  errors: ValidationError[]
  warnings: ValidationError[]
  summary: ValidationStats
  platformDetection?: PlatformDetectionResult
  validationHash: string
}

export interface PlatformDetectionResult {
  detectedPlatform: string | null
  confidence: number
  matches: Array<{
    platform: string
    score: number
    matchedHeaders: string[]
    missingHeaders: string[]
  }>
}

export interface PlatformCSVConfig {
  platform: 'shopee' | 'lazada' | 'tiktok'
  requiredHeaders: string[]
  optionalHeaders?: string[]
  fieldMappings: Record<string, string>
  validationRules: CSVValidationRule[]
  duplicateDetection: {
    fields: string[]
    scope: 'file' | 'workspace'
  }
}

export interface CSVValidationRule {
  field: string
  required: boolean
  type: 'string' | 'number' | 'date' | 'email' | 'url' | 'currency' | 'percentage'
  minLength?: number
  maxLength?: number
  minValue?: number
  maxValue?: number
  pattern?: RegExp
  allowedValues?: string[]
  customValidator?: (value: any, row: Record<string, any>, context: ValidationContext) => ValidationResult
  businessRules?: BusinessRule[]
}

export interface BusinessRule {
  name: string
  description: string
  validator: (value: any, row: Record<string, any>, context: ValidationContext) => ValidationResult
  severity: 'error' | 'warning' | 'info'
}

export interface ValidationResult {
  isValid: boolean
  error?: string
  suggestion?: string
  severity?: 'error' | 'warning' | 'info'
}

/**
 * Advanced CSV Validator Class with Streaming Support
 */
export class CSVValidator {
  private config: ReturnType<typeof getEffectiveConfig>
  private cache: ValidationCache
  private stats: ValidationStats = {
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    processingTime: 0,
    memoryUsage: 0,
    throughput: 0,
    errorsByType: {}
  }

  constructor() {
    this.config = getEffectiveConfig()
    this.cache = {
      enabled: this.config.features.ENABLE_CSV_VALIDATION_CACHE,
      entries: new Map(),
      maxEntries: this.config.csvValidation.VALIDATION_CACHE_MAX_ENTRIES,
      ttlMinutes: this.config.csvValidation.VALIDATION_CACHE_TTL_MINUTES
    }
    this.resetStats()
  }

  /**
   * Validate CSV content with advanced streaming support
   */
  async validateCSV(
    csvContent: string | Buffer | Readable,
    platformConfig: PlatformCSVConfig,
    options: StreamingValidationOptions = {}
  ): Promise<ParsedCSVData> {
    const startTime = Date.now()
    const validationOptions = this.mergeOptions(options)
    
    try {
      // Check cache first
      if (this.cache.enabled && typeof csvContent === 'string') {
        const cached = await this.getCachedResult(csvContent, platformConfig)
        if (cached) {
          return cached
        }
      }

      // Auto-detect platform if not provided
      let detectedConfig = platformConfig
      let platformDetection: PlatformDetectionResult | undefined

      if (validationOptions.preview && this.config.features.ENABLE_CSV_AUTO_DETECTION) {
        const detection = await this.detectPlatform(csvContent)
        if (detection.detectedPlatform && detection.confidence >= this.config.csvValidation.PLATFORM_DETECTION_CONFIDENCE_THRESHOLD) {
          detectedConfig = this.getPlatformConfig(detection.detectedPlatform)
          platformDetection = detection
        }
      }

      // Choose validation strategy based on content size and options
      const result = validationOptions.enableStreaming && this.shouldUseStreaming(csvContent)
        ? await this.validateWithStreaming(csvContent, detectedConfig, validationOptions)
        : await this.validateInMemory(csvContent, detectedConfig, validationOptions)

      result.platformDetection = platformDetection
      result.summary.processingTime = Date.now() - startTime
      result.summary.throughput = result.summary.totalRows / (result.summary.processingTime / 1000)
      result.validationHash = this.generateValidationHash(csvContent, detectedConfig, validationOptions)

      // Cache result if enabled
      if (this.cache.enabled && typeof csvContent === 'string') {
        await this.cacheResult(csvContent, detectedConfig, result)
      }

      return result

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error'
      
      return {
        headers: [],
        data: [],
        errors: [{
          row: 0,
          message: `Validation failed: ${errorMessage}`,
          type: 'critical',
          severity: 'error',
          suggestion: 'Check file format and try again'
        }],
        warnings: [],
        summary: {
          ...this.resetStats(),
          processingTime: Date.now() - startTime
        },
        validationHash: ''
      }
    }
  }

  /**
   * Streaming validation for large files
   */
  private async validateWithStreaming(
    csvContent: string | Buffer | Readable,
    config: PlatformCSVConfig,
    options: StreamingValidationOptions
  ): Promise<ParsedCSVData> {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    const data: Record<string, any>[] = []
    let headers: string[] = []
    let rowCount = 0
    let validRowCount = 0
    const duplicateKeys = new Set<string>()
    const context: ValidationContext = {
      platform: config.platform,
      config,
      options,
      cache: this.cache,
      stats: this.stats
    }

    return new Promise((resolve, reject) => {
      const stream = this.createInputStream(csvContent)
      const parser = Papa.parse(csvContent as any, {
        header: false,
        step: (results: ParseResult<string[]>) => {
          try {
            this.processStreamRow(
              results.data as any,
              rowCount,
              headers,
              data,
              errors,
              warnings,
              duplicateKeys,
              config,
              context,
              options
            )
            
            rowCount++
            if (results.errors.length === 0) validRowCount++
            
            // Early exit if too many errors
            if (options.earlyExit && errors.length >= (options.maxErrors || this.config.csvValidation.MAX_VALIDATION_ERRORS)) {
              // parser.abort()
              resolve({
                data,
                errors,
                warnings
              } as any)
              return
            }
            
            // Preview mode limit
            if (options.preview && data.length >= (options.previewRows || this.config.csvValidation.PREVIEW_MAX_ROWS)) {
              // parser.abort()
              resolve({
                data,
                errors,
                warnings
              } as any)
              return
            }
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Row processing error'
            errors.push({
              row: rowCount + 1,
              message: `Row processing failed: ${errorMessage}`,
              type: 'unknown',
              severity: 'error'
            })
          }
        },
        complete: () => {
          resolve({
            headers,
            data,
            errors,
            warnings,
            summary: {
              totalRows: rowCount,
              validRows: validRowCount,
              invalidRows: rowCount - validRowCount,
              duplicateRows: errors.filter(e => e.type === 'duplicate').length,
              processingTime: 0,
              memoryUsage: process.memoryUsage().heapUsed,
              throughput: 0,
              errorsByType: this.categorizeErrors(errors)
            },
            validationHash: ''
          })
        },
        // error: (error: ParseError) => {
        //   reject(new Error(`CSV parsing failed: ${error.message}`))
        // }
      })

      // Papa.parse already processed the content synchronously
    })
  }

  /**
   * In-memory validation for smaller files
   */
  private async validateInMemory(
    csvContent: string | Buffer | Readable,
    config: PlatformCSVConfig,
    options: StreamingValidationOptions
  ): Promise<ParsedCSVData> {
    const content = await this.readContent(csvContent)
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    
    // Parse CSV
    const parseResult = Papa.parse(content as any, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      transform: (value: string) => value.trim()
    })

    if (parseResult.errors.length > 0) {
      parseResult.errors.forEach((error: any) => {
        errors.push({
          row: error.row || 0,
          message: error.message,
          type: 'unknown',
          severity: 'error'
        })
      })
    }

    let data = parseResult.data as Record<string, any>[]
    const headers = Object.keys(data[0] || {})

    // Apply row limit for preview
    if (options.preview && options.previewRows) {
      data = data.slice(0, options.previewRows)
    }

    // Validate headers
    const headerValidation = this.validateHeaders(headers, config)
    errors.push(...headerValidation.errors)
    warnings.push(...headerValidation.warnings)

    // Validate data rows
    const context: ValidationContext = {
      platform: config.platform,
      config,
      options,
      cache: this.cache,
      stats: this.stats
    }

    const dataValidation = await this.validateDataRows(data, config, options, context)
    errors.push(...dataValidation.errors)
    warnings.push(...dataValidation.warnings)

    const validRowCount = data.length - new Set(errors.filter(e => e.row > 0).map(e => e.row)).size

    return {
      headers,
      data,
      errors,
      warnings,
      summary: {
        totalRows: data.length,
        validRows: validRowCount,
        invalidRows: data.length - validRowCount,
        duplicateRows: errors.filter(e => e.type === 'duplicate').length,
        processingTime: 0,
        memoryUsage: process.memoryUsage().heapUsed,
        throughput: 0,
        errorsByType: this.categorizeErrors(errors)
      },
      validationHash: ''
    }
  }

  /**
   * Detect platform based on CSV headers
   */
  private async detectPlatform(csvContent: string | Buffer | Readable): Promise<PlatformDetectionResult> {
    const content = await this.readContent(csvContent)
    const sampleLines = content.split('\n').slice(0, this.config.csvValidation.PLATFORM_DETECTION_SAMPLE_SIZE)
    const sampleCsv = sampleLines.join('\n')

    const parseResult = Papa.parse(sampleCsv, {
      header: true,
      preview: 1
    })

    const headers = Object.keys(parseResult.data[0] || {})
    const platforms = ['shopee', 'lazada', 'tiktok']
    const matches: PlatformDetectionResult['matches'] = []

    for (const platform of platforms) {
      const config = this.getPlatformConfig(platform)
      const requiredHeaders = config.requiredHeaders
      const matchedHeaders = headers.filter(h => requiredHeaders.includes(h))
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
      const score = matchedHeaders.length / requiredHeaders.length

      matches.push({
        platform,
        score,
        matchedHeaders,
        missingHeaders
      })
    }

    matches.sort((a, b) => b.score - a.score)
    const bestMatch = matches[0]
    
    return {
      detectedPlatform: bestMatch.score >= this.config.csvValidation.PLATFORM_DETECTION_CONFIDENCE_THRESHOLD ? bestMatch.platform : null,
      confidence: bestMatch.score,
      matches
    }
  }

  /**
   * Process a single row in streaming mode
   */
  private processStreamRow(
    rowData: string[],
    rowIndex: number,
    headers: string[],
    data: Record<string, any>[],
    errors: ValidationError[],
    warnings: ValidationError[],
    duplicateKeys: Set<string>,
    config: PlatformCSVConfig,
    context: ValidationContext,
    options: StreamingValidationOptions
  ): void {
    if (rowIndex === 0) {
      // First row is headers
      headers.push(...rowData.map(h => h.trim()))
      return
    }

    // Create row object
    const row: Record<string, any> = {}
    headers.forEach((header, index) => {
      row[header] = rowData[index]?.trim() || ''
    })

    data.push(row)
    const rowNumber = rowIndex + 1

    // Validate row
    const rowValidation = this.validateSingleRow(row, rowNumber, config, context)
    errors.push(...rowValidation.errors)
    warnings.push(...rowValidation.warnings)

    // Check duplicates
    if (config.duplicateDetection.fields.length > 0) {
      const duplicateKey = config.duplicateDetection.fields
        .map(field => String(row[field] || '').toLowerCase())
        .join('|')

      if (duplicateKey && duplicateKeys.has(duplicateKey)) {
        errors.push({
          row: rowNumber,
          message: 'Duplicate record found in file',
          type: 'duplicate',
          severity: 'warning',
          value: duplicateKey
        })
      } else if (duplicateKey) {
        duplicateKeys.add(duplicateKey)
      }
    }
  }

  /**
   * Validate CSV headers
   */
  private validateHeaders(headers: string[], config: PlatformCSVConfig): {
    errors: ValidationError[]
    warnings: ValidationError[]
  } {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Check required headers
    const missingHeaders = config.requiredHeaders.filter(h => !headers.includes(h))
    if (missingHeaders.length > 0) {
      errors.push({
        row: 0,
        message: `Missing required headers: ${missingHeaders.join(', ')}`,
        type: 'missing',
        severity: 'error',
        suggestion: `Add the following headers to your CSV: ${missingHeaders.join(', ')}`
      })
    }

    // Check for extra headers
    const knownHeaders = [...config.requiredHeaders, ...(config.optionalHeaders || [])]
    const extraHeaders = headers.filter(h => !knownHeaders.includes(h))
    if (extraHeaders.length > 0) {
      warnings.push({
        row: 0,
        message: `Unknown headers found: ${extraHeaders.join(', ')}`,
        type: 'unknown',
        severity: 'info',
        suggestion: 'These headers will be ignored during processing'
      })
    }

    return { errors, warnings }
  }

  /**
   * Validate data rows
   */
  private async validateDataRows(
    data: Record<string, any>[],
    config: PlatformCSVConfig,
    options: StreamingValidationOptions,
    context: ValidationContext
  ): Promise<{
    errors: ValidationError[]
    warnings: ValidationError[]
  }> {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    const seenDuplicates = new Set<string>()

    // Process in chunks for better performance
    const chunkSize = this.config.csvValidation.VALIDATION_CHUNK_SIZE
    const chunks = []
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize))
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex]
      const chunkOffset = chunkIndex * chunkSize

      for (let rowIndex = 0; rowIndex < chunk.length; rowIndex++) {
        const row = chunk[rowIndex]
        const rowNumber = chunkOffset + rowIndex + 2 // +2 for header row and 1-based indexing

        const rowValidation = this.validateSingleRow(row, rowNumber, config, context)
        errors.push(...rowValidation.errors)
        warnings.push(...rowValidation.warnings)

        // Check duplicates
        if (config.duplicateDetection.fields.length > 0) {
          const duplicateKey = config.duplicateDetection.fields
            .map(field => String(row[field] || '').toLowerCase())
            .join('|')

          if (duplicateKey) {
            if (seenDuplicates.has(duplicateKey)) {
              errors.push({
                row: rowNumber,
                message: 'Duplicate record found in file',
                type: 'duplicate',
                severity: 'warning',
                value: duplicateKey
              })
            } else {
              seenDuplicates.add(duplicateKey)
            }

            // Check against existing workspace data
            if (options.existingData && config.duplicateDetection.scope === 'workspace') {
              const existsInWorkspace = options.existingData.some(existingRow => {
                const existingKey = config.duplicateDetection.fields
                  .map(field => String(existingRow[field] || '').toLowerCase())
                  .join('|')
                return existingKey === duplicateKey
              })

              if (existsInWorkspace) {
                warnings.push({
                  row: rowNumber,
                  message: 'Record already exists in workspace',
                  type: 'duplicate',
                  severity: 'warning',
                  suggestion: 'This record will be skipped during import'
                })
              }
            }
          }
        }

        // Early exit if too many errors
        if (options.earlyExit && errors.length >= (options.maxErrors || this.config.csvValidation.MAX_VALIDATION_ERRORS)) {
          errors.push({
            row: 0,
            message: `Validation stopped early after ${errors.length} errors`,
            type: 'unknown',
            severity: 'info',
            suggestion: 'Fix existing errors and try again'
          })
          break
        }
      }
    }

    return { errors, warnings }
  }

  /**
   * Validate a single row
   */
  private validateSingleRow(
    row: Record<string, any>,
    rowNumber: number,
    config: PlatformCSVConfig,
    context: ValidationContext
  ): {
    errors: ValidationError[]
    warnings: ValidationError[]
  } {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    for (const rule of config.validationRules) {
      const value = row[rule.field]
      const validation = this.validateField(value, rule, row, context)

      if (!validation.isValid && validation.error) {
        const error: ValidationError = {
          row: rowNumber,
          column: rule.field,
          field: rule.field,
          message: validation.error,
          type: this.getErrorType(validation.error),
          value,
          suggestion: validation.suggestion,
          severity: validation.severity || 'error'
        }

        if (error.severity === 'error') {
          errors.push(error)
        } else {
          warnings.push(error)
        }
      }
    }

    return { errors, warnings }
  }

  /**
   * Validate individual field
   */
  private validateField(
    value: any,
    rule: CSVValidationRule,
    row: Record<string, any>,
    context: ValidationContext
  ): ValidationResult {
    // Required field check
    if (rule.required && this.isEmpty(value)) {
      return {
        isValid: false,
        error: `${rule.field} is required`,
        suggestion: `Provide a value for ${rule.field}`,
        severity: 'error'
      }
    }

    // Skip validation for empty optional fields
    if (!rule.required && this.isEmpty(value)) {
      return { isValid: true }
    }

    // Type validation
    const typeValidation = this.validateFieldType(value, rule)
    if (!typeValidation.isValid) {
      return typeValidation
    }

    // Length validation
    const lengthValidation = this.validateFieldLength(value, rule)
    if (!lengthValidation.isValid) {
      return lengthValidation
    }

    // Value range validation
    const rangeValidation = this.validateFieldRange(value, rule)
    if (!rangeValidation.isValid) {
      return rangeValidation
    }

    // Pattern validation
    if (rule.pattern) {
      const stringValue = String(value)
      if (!rule.pattern.test(stringValue)) {
        return {
          isValid: false,
          error: `${rule.field} format is invalid`,
          suggestion: `Ensure ${rule.field} matches the expected format`,
          severity: 'error'
        }
      }
    }

    // Allowed values validation
    if (rule.allowedValues && rule.allowedValues.length > 0) {
      if (!rule.allowedValues.includes(String(value))) {
        return {
          isValid: false,
          error: `${rule.field} must be one of: ${rule.allowedValues.join(', ')}`,
          suggestion: `Use one of the allowed values: ${rule.allowedValues.join(', ')}`,
          severity: 'error'
        }
      }
    }

    // Custom validation
    if (rule.customValidator) {
      const customValidation = rule.customValidator(value, row, context)
      if (!customValidation.isValid) {
        return customValidation
      }
    }

    // Business rules validation
    if (rule.businessRules && context.options.validateBusinessRules) {
      for (const businessRule of rule.businessRules) {
        const businessValidation = businessRule.validator(value, row, context)
        if (!businessValidation.isValid) {
          return {
            ...businessValidation,
            severity: businessRule.severity
          }
        }
      }
    }

    return { isValid: true }
  }

  /**
   * Validate field type
   */
  private validateFieldType(value: any, rule: CSVValidationRule): ValidationResult {
    const stringValue = String(value)

    switch (rule.type) {
      case 'number':
        if (isNaN(Number(value))) {
          return {
            isValid: false,
            error: `${rule.field} must be a valid number`,
            suggestion: 'Enter a numeric value (e.g., 123.45)',
            severity: 'error'
          }
        }
        break

      case 'date':
        const date = new Date(value)
        if (isNaN(date.getTime())) {
          return {
            isValid: false,
            error: `${rule.field} must be a valid date`,
            suggestion: 'Use format: YYYY-MM-DD or MM/DD/YYYY',
            severity: 'error'
          }
        }
        break

      case 'email':
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailPattern.test(stringValue)) {
          return {
            isValid: false,
            error: `${rule.field} must be a valid email address`,
            suggestion: 'Use format: user@domain.com',
            severity: 'error'
          }
        }
        break

      case 'url':
        try {
          new URL(stringValue)
        } catch {
          return {
            isValid: false,
            error: `${rule.field} must be a valid URL`,
            suggestion: 'Use format: https://example.com',
            severity: 'error'
          }
        }
        break

      case 'currency':
        const currencyPattern = /^[\$฿]?[\d,]+\.?\d*$/
        if (!currencyPattern.test(stringValue.replace(/\s/g, ''))) {
          return {
            isValid: false,
            error: `${rule.field} must be a valid currency amount`,
            suggestion: 'Use format: 123.45 or $123.45',
            severity: 'error'
          }
        }
        break

      case 'percentage':
        const percentPattern = /^\d+(\.\d+)?%?$/
        if (!percentPattern.test(stringValue)) {
          return {
            isValid: false,
            error: `${rule.field} must be a valid percentage`,
            suggestion: 'Use format: 5.5% or 5.5',
            severity: 'error'
          }
        }
        break
    }

    return { isValid: true }
  }

  /**
   * Validate field length
   */
  private validateFieldLength(value: any, rule: CSVValidationRule): ValidationResult {
    const stringValue = String(value)
    
    if (rule.minLength && stringValue.length < rule.minLength) {
      return {
        isValid: false,
        error: `${rule.field} must be at least ${rule.minLength} characters`,
        suggestion: `Enter at least ${rule.minLength} characters`,
        severity: 'error'
      }
    }

    if (rule.maxLength && stringValue.length > rule.maxLength) {
      return {
        isValid: false,
        error: `${rule.field} must not exceed ${rule.maxLength} characters`,
        suggestion: `Shorten to ${rule.maxLength} characters or less`,
        severity: 'error'
      }
    }

    return { isValid: true }
  }

  /**
   * Validate field value range
   */
  private validateFieldRange(value: any, rule: CSVValidationRule): ValidationResult {
    if (rule.type === 'number' && !isNaN(Number(value))) {
      const numValue = Number(value)
      
      if (rule.minValue !== undefined && numValue < rule.minValue) {
        return {
          isValid: false,
          error: `${rule.field} must be at least ${rule.minValue}`,
          suggestion: `Enter a value >= ${rule.minValue}`,
          severity: 'error'
        }
      }

      if (rule.maxValue !== undefined && numValue > rule.maxValue) {
        return {
          isValid: false,
          error: `${rule.field} must not exceed ${rule.maxValue}`,
          suggestion: `Enter a value <= ${rule.maxValue}`,
          severity: 'error'
        }
      }
    }

    return { isValid: true }
  }

  /**
   * Helper methods
   */
  private isEmpty(value: any): boolean {
    return value === null || value === undefined || String(value).trim() === ''
  }

  private getErrorType(errorMessage: string): ValidationError['type'] {
    if (errorMessage.includes('required')) return 'missing'
    if (errorMessage.includes('must be a valid')) return 'invalid_type'
    if (errorMessage.includes('format') || errorMessage.includes('pattern')) return 'invalid_format'
    if (errorMessage.includes('duplicate')) return 'duplicate'
    if (errorMessage.includes('commission') || errorMessage.includes('date') || errorMessage.includes('business')) return 'business_rule'
    return 'unknown'
  }

  private categorizeErrors(errors: ValidationError[]): Record<string, number> {
    const categories: Record<string, number> = {}
    errors.forEach(error => {
      categories[error.type] = (categories[error.type] || 0) + 1
    })
    return categories
  }

  private shouldUseStreaming(csvContent: string | Buffer | Readable): boolean {
    if (typeof csvContent === 'string') {
      return csvContent.length > 1024 * 1024 // 1MB threshold
    }
    if (Buffer.isBuffer(csvContent)) {
      return csvContent.length > 1024 * 1024
    }
    return true // Always use streaming for Readable streams
  }

  private createInputStream(csvContent: string | Buffer | Readable): Readable {
    if (csvContent instanceof Readable) {
      return csvContent
    }
    if (Buffer.isBuffer(csvContent)) {
      return Readable.from([csvContent])
    }
    return Readable.from([csvContent])
  }

  private async readContent(csvContent: string | Buffer | Readable): Promise<string> {
    if (typeof csvContent === 'string') {
      return csvContent
    }
    if (Buffer.isBuffer(csvContent)) {
      return csvContent.toString('utf-8')
    }
    
    const chunks: Buffer[] = []
    for await (const chunk of csvContent) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString('utf-8')
  }

  private mergeOptions(options: StreamingValidationOptions): StreamingValidationOptions {
    return {
      enableStreaming: this.config.features.ENABLE_CSV_STREAMING,
      chunkSize: this.config.csvValidation.STREAM_CHUNK_SIZE,
      maxErrors: this.config.csvValidation.MAX_VALIDATION_ERRORS,
      earlyExit: this.config.csvValidation.VALIDATION_EARLY_EXIT,
      preview: false,
      previewRows: this.config.csvValidation.PREVIEW_MAX_ROWS,
      timeout: this.config.csvValidation.VALIDATION_TIMEOUT_MS,
      validateBusinessRules: this.config.features.ENABLE_CSV_BUSINESS_RULES,
      enableCache: this.config.features.ENABLE_CSV_VALIDATION_CACHE,
      ...options
    }
  }

  private resetStats(): ValidationStats {
    this.stats = {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      duplicateRows: 0,
      processingTime: 0,
      memoryUsage: 0,
      throughput: 0,
      errorsByType: {}
    }
    return this.stats
  }

  private generateValidationHash(
    csvContent: string | Buffer | Readable,
    config: PlatformCSVConfig,
    options: StreamingValidationOptions
  ): string {
    // Simple hash for caching purposes
    const contentHash = typeof csvContent === 'string' 
      ? csvContent.slice(0, 1000).replace(/\s/g, '').length.toString()
      : 'stream'
    return `${config.platform}-${contentHash}-${JSON.stringify(options).length}`
  }

  private async getCachedResult(
    csvContent: string,
    config: PlatformCSVConfig
  ): Promise<ParsedCSVData | null> {
    const hash = this.generateValidationHash(csvContent, config, {})
    const cached = this.cache.entries.get(hash)
    
    if (cached) {
      const isExpired = Date.now() - cached.timestamp > (this.cache.ttlMinutes * 60 * 1000)
      if (!isExpired) {
        return cached.result
      } else {
        this.cache.entries.delete(hash)
      }
    }
    
    return null
  }

  private async cacheResult(
    csvContent: string,
    config: PlatformCSVConfig,
    result: ParsedCSVData
  ): Promise<void> {
    const hash = this.generateValidationHash(csvContent, config, {})
    
    // Clean up expired entries
    if (this.cache.entries.size >= this.cache.maxEntries) {
      const now = Date.now()
      const expiredKeys = Array.from(this.cache.entries.entries())
        .filter(([, cached]) => now - cached.timestamp > (this.cache.ttlMinutes * 60 * 1000))
        .map(([key]) => key)
      
      expiredKeys.forEach(key => this.cache.entries.delete(key))
      
      // If still at capacity, remove oldest
      if (this.cache.entries.size >= this.cache.maxEntries) {
        const oldestKey = this.cache.entries.keys().next().value
        if (oldestKey) {
          this.cache.entries.delete(oldestKey)
        }
      }
    }
    
    this.cache.entries.set(hash, {
      result: { ...result },
      timestamp: Date.now(),
      hash
    })
  }

  private getPlatformConfig(platform: string): PlatformCSVConfig {
    const { getPlatformConfig } = require('./platform-configs')
    return getPlatformConfig(platform)
  }

  /**
   * Enhanced single row validation with improved error context
   */
  private validateSingleRowEnhanced(
    row: Record<string, any>,
    rowNumber: number,
    config: PlatformCSVConfig,
    context: ValidationContext
  ): {
    errors: ValidationError[]
    warnings: ValidationError[]
  } {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Pre-validation checks
    const requiredFieldsMissing = config.requiredHeaders.filter(header => {
      const value = row[header]
      return this.isEmpty(value)
    })

    if (requiredFieldsMissing.length > 0) {
      errors.push({
        row: rowNumber,
        message: `Missing required fields: ${requiredFieldsMissing.join(', ')}`,
        type: 'missing',
        severity: 'error',
        suggestion: `Provide values for: ${requiredFieldsMissing.join(', ')}`,
        context: {
          fieldPosition: -1
        }
      })
    }

    // Field-level validation with enhanced error reporting
    for (const rule of config.validationRules) {
      const value = row[rule.field]
      const validation = this.validateFieldEnhanced(value, rule, row, context, rowNumber)

      if (!validation.isValid && validation.error) {
        const error: ValidationError = {
          row: rowNumber,
          column: rule.field,
          field: rule.field,
          message: validation.error,
          type: this.getErrorType(validation.error),
          value,
          suggestion: validation.suggestion,
          severity: validation.severity || 'error',
          context: {
            fieldPosition: Object.keys(row).indexOf(rule.field)
          }
        }

        if (error.severity === 'error') {
          errors.push(error)
        } else {
          warnings.push(error)
        }
      }
    }

    return { errors, warnings }
  }

  /**
   * Enhanced field validation with better error messages
   */
  private validateFieldEnhanced(
    value: any,
    rule: CSVValidationRule,
    row: Record<string, any>,
    context: ValidationContext,
    rowNumber: number
  ): ValidationResult {
    // Use existing validation logic but with enhanced error messages
    const baseValidation = this.validateField(value, rule, row, context)
    
    if (!baseValidation.isValid && baseValidation.error) {
      // Enhance error messages with field-specific suggestions
      const enhancedSuggestion = this.getFieldSpecificSuggestion(
        rule.field, 
        value, 
        rule, 
        context.platform
      )
      
      return {
        ...baseValidation,
        suggestion: enhancedSuggestion || baseValidation.suggestion
      }
    }
    
    return baseValidation
  }

  /**
   * Get field-specific validation suggestions
   */
  private getFieldSpecificSuggestion(
    fieldName: string, 
    value: any, 
    rule: CSVValidationRule, 
    platform: string
  ): string | undefined {
    try {
      const { PlatformConfigUtils } = require('./platform-configs')
      
      // Get platform-specific suggestions
      const errorType = this.inferErrorType(fieldName, value, rule)
      const platformSuggestions = PlatformConfigUtils.getPlatformSuggestions(platform, errorType)
      
      if (platformSuggestions.length > 0) {
        return platformSuggestions[0] // Return the first/best suggestion
      }
    } catch (error) {
      // Fallback if platform configs not available
    }
    
    // Fallback to generic suggestions
    if (rule.type === 'currency' && typeof value === 'string') {
      return 'Use numeric format with decimal point (e.g., 12.50)'
    }
    
    if (rule.type === 'date' && typeof value === 'string') {
      return 'Use standard date format: YYYY-MM-DD or MM/DD/YYYY'
    }
    
    if (rule.required && this.isEmpty(value)) {
      return `${fieldName} is required for ${platform} imports`
    }
    
    return undefined
  }

  /**
   * Infer error type from field characteristics
   */
  private inferErrorType(fieldName: string, value: any, rule: CSVValidationRule): string {
    const lowerField = fieldName.toLowerCase()
    
    if (lowerField.includes('commission') || lowerField.includes('คอมมิชชั่น')) {
      return 'commission'
    }
    if (lowerField.includes('status') || lowerField.includes('สถานะ')) {
      return 'status'
    }
    if (lowerField.includes('date') || lowerField.includes('time') || lowerField.includes('เวลา')) {
      return 'date'
    }
    if (lowerField.includes('quantity') || lowerField.includes('จำนวน')) {
      return 'quantity'
    }
    
    return 'general'
  }

  /**
   * Clean and normalize field values
   */
  private cleanFieldValue(rawValue: string, fieldName: string, config: PlatformCSVConfig): any {
    if (!rawValue || typeof rawValue !== 'string') {
      return rawValue
    }
    
    let cleaned = rawValue.trim()
    
    // Field-specific cleaning
    const lowerField = fieldName.toLowerCase()
    
    if (lowerField.includes('commission') || lowerField.includes('price') || 
        lowerField.includes('amount') || lowerField.includes('คอมมิชชั่น') || 
        lowerField.includes('ราคา') || lowerField.includes('มูลค่า')) {
      // Clean currency values
      cleaned = cleaned.replace(/[฿$€£,\s]/g, '')
      const numValue = parseFloat(cleaned)
      return isNaN(numValue) ? rawValue.trim() : numValue
    }
    
    if (lowerField.includes('quantity') || lowerField.includes('จำนวน')) {
      // Clean quantity values
      const numValue = parseInt(cleaned.replace(/[^0-9]/g, ''))
      return isNaN(numValue) ? rawValue.trim() : numValue
    }
    
    if (lowerField.includes('rate') && cleaned.includes('%')) {
      // Clean percentage values
      const numValue = parseFloat(cleaned.replace('%', ''))
      return isNaN(numValue) ? rawValue.trim() : numValue
    }
    
    return cleaned
  }

  /**
   * Enhanced early exit logic
   */
  private shouldExitEarly(
    errorCount: number,
    warningCount: number,
    rowCount: number,
    processedBytes: number,
    options: StreamingValidationOptions
  ): { exit: boolean; reason?: string; suggestion?: string } {
    const maxErrors = options.maxErrors || this.config.csvValidation.MAX_VALIDATION_ERRORS
    const previewRows = options.previewRows || this.config.csvValidation.PREVIEW_MAX_ROWS
    
    // Too many errors
    if (options.earlyExit && errorCount >= maxErrors) {
      return {
        exit: true,
        reason: 'error_limit_exceeded',
        suggestion: `Fix the first ${Math.min(errorCount, 10)} errors and try again`
      }
    }
    
    // Preview mode limit
    if (options.preview && rowCount >= previewRows) {
      return {
        exit: true,
        reason: 'preview_limit',
        suggestion: `Preview completed with ${rowCount} rows`
      }
    }
    
    // Memory limit (approximate)
    if (processedBytes > 100 * 1024 * 1024) { // 100MB
      return {
        exit: true,
        reason: 'size_limit_exceeded',
        suggestion: 'File too large for validation preview. Consider processing in smaller batches.'
      }
    }
    
    return { exit: false }
  }

  /**
   * Enhanced row processing with better error context and performance
   */
  private processStreamRowEnhanced(
    rowData: string[],
    rowIndex: number,
    headers: string[],
    data: Record<string, any>[],
    errors: ValidationError[],
    warnings: ValidationError[],
    duplicateKeys: Set<string>,
    config: PlatformCSVConfig,
    context: ValidationContext,
    options: StreamingValidationOptions,
    contextLines: string[]
  ): void {
    if (rowIndex === 0) {
      // First row is headers - validate header structure
      const cleanHeaders = rowData.map(h => h.trim()).filter(h => h.length > 0)
      headers.push(...cleanHeaders)
      
      // Validate headers against platform requirements
      const headerValidation = this.validateHeaders(headers, config)
      errors.push(...headerValidation.errors)
      warnings.push(...headerValidation.warnings)
      
      return
    }

    // Create row object with improved data cleaning
    const row: Record<string, any> = {}
    headers.forEach((header, index) => {
      const rawValue = rowData[index] || ''
      // Enhanced data cleaning and type coercion
      row[header] = this.cleanFieldValue(rawValue, header, config)
    })

    // Skip completely empty rows
    const hasData = Object.values(row).some(value => 
      value !== null && value !== undefined && String(value).trim() !== ''
    )
    
    if (!hasData) {
      warnings.push({
        row: rowIndex + 1,
        message: 'Empty row found and skipped',
        type: 'unknown',
        severity: 'info',
        suggestion: 'Remove empty rows from your CSV file'
      })
      return
    }

    data.push(row)
    const rowNumber = rowIndex + 1

    // Enhanced validation with better error reporting
    const rowValidation = this.validateSingleRowEnhanced(row, rowNumber, config, context)
    errors.push(...rowValidation.errors)
    warnings.push(...rowValidation.warnings)

    // Enhanced duplicate detection with better messaging
    if (config.duplicateDetection.fields.length > 0) {
      const duplicateKey = config.duplicateDetection.fields
        .map(field => String(row[field] || '').toLowerCase().trim())
        .filter(val => val.length > 0)
        .join('|')

      if (duplicateKey) {
        if (duplicateKeys.has(duplicateKey)) {
          const duplicateFields = config.duplicateDetection.fields
            .map(field => `${field}: ${row[field]}`)
            .join(', ')
            
          errors.push({
            row: rowNumber,
            message: 'Duplicate record found in file',
            type: 'duplicate',
            severity: 'warning',
            value: duplicateKey,
            suggestion: `Check duplicate data: ${duplicateFields}`,
            context: {
              lineContent: contextLines[contextLines.length - 1] || '',
              fieldPosition: config.duplicateDetection.fields.indexOf(config.duplicateDetection.fields[0])
            }
          })
        } else {
          duplicateKeys.add(duplicateKey)
        }
      }
    }
  }
}

/**
 * Factory function to create CSV validator instance
 */
export function createCSVValidator(): CSVValidator {
  return new CSVValidator()
}

/**
 * Quick validation function for simple use cases
 */
export async function validateCSV(
  csvContent: string,
  platform: string,
  options: StreamingValidationOptions = {}
): Promise<ParsedCSVData> {
  const validator = createCSVValidator()
  const platformConfig = validator['getPlatformConfig'](platform) // Access private method
  return validator.validateCSV(csvContent, platformConfig, options)
}