/**
 * CSV Parser and Validation Utilities for Affiliate Marketing Data
 * Supports Shopee, Lazada, and TikTok CSV formats with robust validation
 */

import Papa from 'papaparse'

export interface ParsedCSVData {
  headers: string[]
  data: Record<string, any>[]
  errors: ValidationError[]
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
    duplicateRows: number
  }
}

export interface ValidationError {
  row: number
  column?: string
  field?: string
  message: string
  type: 'missing' | 'invalid_type' | 'invalid_format' | 'duplicate' | 'business_rule' | 'unknown'
  value?: any
}

export interface CSVValidationRule {
  field: string
  required: boolean
  type: 'string' | 'number' | 'date' | 'email' | 'url' | 'currency'
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  customValidator?: (value: any, row: Record<string, any>) => string | null
}

export interface PlatformCSVConfig {
  platform: 'shopee' | 'lazada' | 'tiktok'
  requiredHeaders: string[]
  optionalHeaders?: string[]
  fieldMappings: Record<string, string> // CSV header -> standardized field name
  validationRules: CSVValidationRule[]
  duplicateDetection: {
    fields: string[] // Fields to check for duplicates
    scope: 'file' | 'workspace' // Check duplicates within file or across workspace
  }
}

/**
 * Parse CSV content with comprehensive validation
 */
export async function parseCSVWithValidation(
  csvContent: string,
  config: PlatformCSVConfig,
  options: {
    skipEmptyLines?: boolean
    trimWhitespace?: boolean
    maxRows?: number
    existingData?: Record<string, any>[] // For duplicate detection across workspace
  } = {}
): Promise<ParsedCSVData> {
  const {
    skipEmptyLines = true,
    trimWhitespace = true,
    maxRows = 10000,
    existingData = []
  } = options

  const errors: ValidationError[] = []
  let parsedData: Record<string, any>[] = []

  try {
    // Parse CSV using PapaParse
    const parseResult = Papa.parse(csvContent as any, {
      header: true,
      skipEmptyLines,
      transformHeader: (header: string) => trimWhitespace ? header.trim() : header,
      transform: (value: string) => trimWhitespace ? value.trim() : value,
      complete: (results: any) => {
        parsedData = results.data as Record<string, any>[]
        
        // Add parsing errors
        if (results.errors.length > 0) {
          results.errors.forEach((error: any) => {
            errors.push({
              row: error.row || 0,
              message: error.message,
              type: 'unknown'
            })
          })
        }
      }
    })

    // Limit rows if specified
    if (parsedData.length > maxRows) {
      parsedData = parsedData.slice(0, maxRows)
      errors.push({
        row: 0,
        message: `File contains ${parsedData.length} rows, only first ${maxRows} rows will be processed`,
        type: 'unknown'
      })
    }

    // Validate headers
    const actualHeaders = Object.keys(parsedData[0] || {})
    const missingHeaders = config.requiredHeaders.filter(h => !actualHeaders.includes(h))
    
    if (missingHeaders.length > 0) {
      errors.push({
        row: 0,
        message: `Missing required headers: ${missingHeaders.join(', ')}`,
        type: 'missing'
      })
    }

    // Validate data
    const validationErrors = await validateRows(parsedData, config, existingData)
    errors.push(...validationErrors)

    // Count valid/invalid rows
    const rowErrors = errors.filter(e => e.row > 0)
    const invalidRowNumbers = new Set(rowErrors.map(e => e.row))
    const validRows = parsedData.length - invalidRowNumbers.size

    return {
      headers: actualHeaders,
      data: parsedData,
      errors,
      summary: {
        totalRows: parsedData.length,
        validRows,
        invalidRows: invalidRowNumbers.size,
        duplicateRows: errors.filter(e => e.type === 'duplicate').length
      }
    }

  } catch (error) {
    errors.push({
      row: 0,
      message: `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
      type: 'unknown'
    })

    return {
      headers: [],
      data: [],
      errors,
      summary: {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicateRows: 0
      }
    }
  }
}

/**
 * Validate rows against platform-specific rules
 */
async function validateRows(
  data: Record<string, any>[],
  config: PlatformCSVConfig,
  existingData: Record<string, any>[]
): Promise<ValidationError[]> {
  const errors: ValidationError[] = []
  const seenValues = new Map<string, number>() // For duplicate detection within file

  // Prepare existing data for duplicate detection
  const existingDuplicateKeys = new Set<string>()
  if (config.duplicateDetection.scope === 'workspace' && existingData.length > 0) {
    existingData.forEach(row => {
      const key = config.duplicateDetection.fields
        .map(field => String(row[field] || '').toLowerCase())
        .join('|')
      if (key) existingDuplicateKeys.add(key)
    })
  }

  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex]
    const rowNumber = rowIndex + 2 // +2 because CSV has header row and is 1-indexed

    // Validate each field according to rules
    for (const rule of config.validationRules) {
      const value = row[rule.field]
      const fieldError = validateField(value, rule, row)
      
      if (fieldError) {
        errors.push({
          row: rowNumber,
          column: rule.field,
          field: rule.field,
          message: fieldError,
          type: getErrorType(fieldError),
          value
        })
      }
    }

    // Check for duplicates
    if (config.duplicateDetection.fields.length > 0) {
      const duplicateKey = config.duplicateDetection.fields
        .map(field => String(row[field] || '').toLowerCase())
        .join('|')

      if (duplicateKey) {
        // Check against existing data
        if (existingDuplicateKeys.has(duplicateKey)) {
          errors.push({
            row: rowNumber,
            message: `Duplicate record already exists in workspace`,
            type: 'duplicate',
            value: duplicateKey
          })
        }

        // Check for duplicates within current file
        if (seenValues.has(duplicateKey)) {
          errors.push({
            row: rowNumber,
            message: `Duplicate record found at row ${seenValues.get(duplicateKey)}`,
            type: 'duplicate',
            value: duplicateKey
          })
        } else {
          seenValues.set(duplicateKey, rowNumber)
        }
      }
    }
  }

  return errors
}

/**
 * Validate individual field value
 */
function validateField(
  value: any,
  rule: CSVValidationRule,
  row: Record<string, any>
): string | null {
  // Check if required field is missing
  if (rule.required && (value === null || value === undefined || value === '')) {
    return `${rule.field} is required`
  }

  // Skip validation for empty optional fields
  if (!rule.required && (value === null || value === undefined || value === '')) {
    return null
  }

  // Type validation
  switch (rule.type) {
    case 'number':
      if (isNaN(Number(value))) {
        return `${rule.field} must be a valid number`
      }
      break

    case 'date':
      const dateValue = new Date(value)
      if (isNaN(dateValue.getTime())) {
        return `${rule.field} must be a valid date`
      }
      break

    case 'email':
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailPattern.test(String(value))) {
        return `${rule.field} must be a valid email address`
      }
      break

    case 'url':
      try {
        new URL(String(value))
      } catch {
        return `${rule.field} must be a valid URL`
      }
      break

    case 'currency':
      // Allow formats like: 1234.56, $1,234.56, 1,234.56
      const currencyPattern = /^[\$]?[\d,]+\.?\d*$/
      if (!currencyPattern.test(String(value).replace(/\s/g, ''))) {
        return `${rule.field} must be a valid currency amount`
      }
      break
  }

  // Length validation
  const stringValue = String(value)
  if (rule.minLength && stringValue.length < rule.minLength) {
    return `${rule.field} must be at least ${rule.minLength} characters`
  }
  if (rule.maxLength && stringValue.length > rule.maxLength) {
    return `${rule.field} must not exceed ${rule.maxLength} characters`
  }

  // Pattern validation
  if (rule.pattern && !rule.pattern.test(stringValue)) {
    return `${rule.field} format is invalid`
  }

  // Custom validation
  if (rule.customValidator) {
    const customError = rule.customValidator(value, row)
    if (customError) {
      return customError
    }
  }

  return null
}

/**
 * Determine error type from error message
 */
function getErrorType(errorMessage: string): ValidationError['type'] {
  if (errorMessage.includes('required')) return 'missing'
  if (errorMessage.includes('must be a valid')) return 'invalid_type'
  if (errorMessage.includes('format')) return 'invalid_format'
  if (errorMessage.includes('duplicate')) return 'duplicate'
  return 'business_rule'
}

/**
 * Transform parsed data to standardized format
 */
export function transformToStandardFormat(
  data: Record<string, any>[],
  config: PlatformCSVConfig
): Record<string, any>[] {
  return data.map(row => {
    const transformedRow: Record<string, any> = {}
    
    // Apply field mappings
    Object.entries(config.fieldMappings).forEach(([csvField, standardField]) => {
      if (row.hasOwnProperty(csvField)) {
        transformedRow[standardField] = transformFieldValue(row[csvField], standardField)
      }
    })

    // Add metadata
    transformedRow._platform = config.platform
    transformedRow._original = row
    transformedRow._transformed_at = new Date().toISOString()

    return transformedRow
  })
}

/**
 * Transform individual field values to standard types
 */
function transformFieldValue(value: any, fieldName: string): any {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const stringValue = String(value).trim()

  // Transform based on field name patterns
  if (fieldName.includes('amount') || fieldName.includes('price') || fieldName.includes('commission')) {
    // Convert currency to number
    const numericValue = stringValue.replace(/[$,\s]/g, '')
    return parseFloat(numericValue) || 0
  }

  if (fieldName.includes('date') || fieldName.includes('time')) {
    // Standardize date format
    const date = new Date(stringValue)
    return isNaN(date.getTime()) ? null : date.toISOString()
  }

  if (fieldName.includes('count') || fieldName.includes('quantity') || fieldName.includes('id')) {
    // Convert to integer
    return parseInt(stringValue) || 0
  }

  return stringValue
}

/**
 * Generate validation summary report
 */
export function generateValidationReport(result: ParsedCSVData): {
  isValid: boolean
  criticalErrors: ValidationError[]
  warnings: ValidationError[]
  summary: string
} {
  const criticalErrors = result.errors.filter(e => 
    e.type === 'missing' || e.type === 'invalid_type' || e.row === 0
  )
  const warnings = result.errors.filter(e => 
    e.type === 'duplicate' || e.type === 'business_rule' || e.type === 'invalid_format'
  )

  const isValid = criticalErrors.length === 0

  let summary = `Processed ${result.summary.totalRows} rows. `
  summary += `${result.summary.validRows} valid, ${result.summary.invalidRows} invalid.`
  
  if (result.summary.duplicateRows > 0) {
    summary += ` Found ${result.summary.duplicateRows} duplicates.`
  }

  return {
    isValid,
    criticalErrors,
    warnings,
    summary
  }
}