/**
 * Import Error Types and Classification System
 * 
 * This module provides comprehensive error categorization, severity levels,
 * and recovery strategies for import processing errors.
 */

export const IMPORT_ERROR_TYPES = {
  // Data Quality Errors
  MISSING_REQUIRED_FIELD: 'missing_required_field',
  INVALID_DATA_TYPE: 'invalid_data_type',
  INVALID_FORMAT: 'invalid_format',
  OUT_OF_RANGE: 'out_of_range',
  DUPLICATE_RECORD: 'duplicate_record',
  
  // Business Logic Errors
  BUSINESS_RULE_VIOLATION: 'business_rule_violation',
  REFERENTIAL_INTEGRITY: 'referential_integrity',
  CONSTRAINT_VIOLATION: 'constraint_violation',
  
  // System Errors
  PROCESSING_ERROR: 'processing_error',
  STORAGE_ERROR: 'storage_error',
  NETWORK_ERROR: 'network_error',
  TIMEOUT_ERROR: 'timeout_error',
  MEMORY_ERROR: 'memory_error',
  
  // File Errors
  FILE_CORRUPTED: 'file_corrupted',
  FILE_TOO_LARGE: 'file_too_large',
  UNSUPPORTED_FORMAT: 'unsupported_format',
  ENCODING_ERROR: 'encoding_error',
  
  // Platform-Specific Errors
  PLATFORM_API_ERROR: 'platform_api_error',
  PLATFORM_RATE_LIMIT: 'platform_rate_limit',
  PLATFORM_AUTHENTICATION: 'platform_authentication',
  
  // Unknown/Unexpected
  UNKNOWN_ERROR: 'unknown_error'
} as const

export type ImportErrorType = typeof IMPORT_ERROR_TYPES[keyof typeof IMPORT_ERROR_TYPES]

export const ERROR_SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high', 
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info'
} as const

export type ErrorSeverity = typeof ERROR_SEVERITY[keyof typeof ERROR_SEVERITY]

export const ERROR_CATEGORY = {
  DATA_QUALITY: 'data_quality',
  BUSINESS_LOGIC: 'business_logic',
  SYSTEM: 'system',
  FILE: 'file',
  PLATFORM: 'platform',
  UNKNOWN: 'unknown'
} as const

export type ErrorCategory = typeof ERROR_CATEGORY[keyof typeof ERROR_CATEGORY]

export const RECOVERY_STRATEGY = {
  RETRY_AUTOMATIC: 'retry_automatic',
  RETRY_MANUAL: 'retry_manual',
  SKIP_ROW: 'skip_row',
  FIX_DATA: 'fix_data',
  MANUAL_REVIEW: 'manual_review',
  ABORT_IMPORT: 'abort_import',
  NO_ACTION: 'no_action'
} as const

export type RecoveryStrategy = typeof RECOVERY_STRATEGY[keyof typeof RECOVERY_STRATEGY]

/**
 * Error type classification mapping
 */
export const ERROR_TYPE_CONFIG: Record<ImportErrorType, {
  severity: ErrorSeverity
  category: ErrorCategory
  recoveryStrategy: RecoveryStrategy
  retryable: boolean
  autoSkippable: boolean
  description: string
}> = {
  [IMPORT_ERROR_TYPES.MISSING_REQUIRED_FIELD]: {
    severity: ERROR_SEVERITY.CRITICAL,
    category: ERROR_CATEGORY.DATA_QUALITY,
    recoveryStrategy: RECOVERY_STRATEGY.FIX_DATA,
    retryable: false,
    autoSkippable: false,
    description: 'Required field is missing or empty'
  },
  [IMPORT_ERROR_TYPES.INVALID_DATA_TYPE]: {
    severity: ERROR_SEVERITY.CRITICAL,
    category: ERROR_CATEGORY.DATA_QUALITY,
    recoveryStrategy: RECOVERY_STRATEGY.FIX_DATA,
    retryable: false,
    autoSkippable: false,
    description: 'Data type does not match expected format'
  },
  [IMPORT_ERROR_TYPES.INVALID_FORMAT]: {
    severity: ERROR_SEVERITY.HIGH,
    category: ERROR_CATEGORY.DATA_QUALITY,
    recoveryStrategy: RECOVERY_STRATEGY.FIX_DATA,
    retryable: false,
    autoSkippable: true,
    description: 'Data format is invalid but might be correctable'
  },
  [IMPORT_ERROR_TYPES.OUT_OF_RANGE]: {
    severity: ERROR_SEVERITY.MEDIUM,
    category: ERROR_CATEGORY.DATA_QUALITY,
    recoveryStrategy: RECOVERY_STRATEGY.MANUAL_REVIEW,
    retryable: false,
    autoSkippable: true,
    description: 'Value is outside acceptable range'
  },
  [IMPORT_ERROR_TYPES.DUPLICATE_RECORD]: {
    severity: ERROR_SEVERITY.LOW,
    category: ERROR_CATEGORY.DATA_QUALITY,
    recoveryStrategy: RECOVERY_STRATEGY.SKIP_ROW,
    retryable: false,
    autoSkippable: true,
    description: 'Record already exists in database'
  },
  [IMPORT_ERROR_TYPES.BUSINESS_RULE_VIOLATION]: {
    severity: ERROR_SEVERITY.HIGH,
    category: ERROR_CATEGORY.BUSINESS_LOGIC,
    recoveryStrategy: RECOVERY_STRATEGY.MANUAL_REVIEW,
    retryable: false,
    autoSkippable: false,
    description: 'Data violates business rules or logic constraints'
  },
  [IMPORT_ERROR_TYPES.REFERENTIAL_INTEGRITY]: {
    severity: ERROR_SEVERITY.HIGH,
    category: ERROR_CATEGORY.BUSINESS_LOGIC,
    recoveryStrategy: RECOVERY_STRATEGY.FIX_DATA,
    retryable: false,
    autoSkippable: false,
    description: 'Referenced record does not exist'
  },
  [IMPORT_ERROR_TYPES.CONSTRAINT_VIOLATION]: {
    severity: ERROR_SEVERITY.CRITICAL,
    category: ERROR_CATEGORY.BUSINESS_LOGIC,
    recoveryStrategy: RECOVERY_STRATEGY.FIX_DATA,
    retryable: false,
    autoSkippable: false,
    description: 'Database constraint violation'
  },
  [IMPORT_ERROR_TYPES.PROCESSING_ERROR]: {
    severity: ERROR_SEVERITY.CRITICAL,
    category: ERROR_CATEGORY.SYSTEM,
    recoveryStrategy: RECOVERY_STRATEGY.RETRY_AUTOMATIC,
    retryable: true,
    autoSkippable: false,
    description: 'System processing error occurred'
  },
  [IMPORT_ERROR_TYPES.STORAGE_ERROR]: {
    severity: ERROR_SEVERITY.CRITICAL,
    category: ERROR_CATEGORY.SYSTEM,
    recoveryStrategy: RECOVERY_STRATEGY.RETRY_AUTOMATIC,
    retryable: true,
    autoSkippable: false,
    description: 'File storage system error'
  },
  [IMPORT_ERROR_TYPES.NETWORK_ERROR]: {
    severity: ERROR_SEVERITY.HIGH,
    category: ERROR_CATEGORY.SYSTEM,
    recoveryStrategy: RECOVERY_STRATEGY.RETRY_AUTOMATIC,
    retryable: true,
    autoSkippable: false,
    description: 'Network connectivity issue'
  },
  [IMPORT_ERROR_TYPES.TIMEOUT_ERROR]: {
    severity: ERROR_SEVERITY.MEDIUM,
    category: ERROR_CATEGORY.SYSTEM,
    recoveryStrategy: RECOVERY_STRATEGY.RETRY_AUTOMATIC,
    retryable: true,
    autoSkippable: false,
    description: 'Operation timed out'
  },
  [IMPORT_ERROR_TYPES.MEMORY_ERROR]: {
    severity: ERROR_SEVERITY.CRITICAL,
    category: ERROR_CATEGORY.SYSTEM,
    recoveryStrategy: RECOVERY_STRATEGY.ABORT_IMPORT,
    retryable: false,
    autoSkippable: false,
    description: 'Insufficient memory to complete operation'
  },
  [IMPORT_ERROR_TYPES.FILE_CORRUPTED]: {
    severity: ERROR_SEVERITY.CRITICAL,
    category: ERROR_CATEGORY.FILE,
    recoveryStrategy: RECOVERY_STRATEGY.ABORT_IMPORT,
    retryable: false,
    autoSkippable: false,
    description: 'File is corrupted or unreadable'
  },
  [IMPORT_ERROR_TYPES.FILE_TOO_LARGE]: {
    severity: ERROR_SEVERITY.HIGH,
    category: ERROR_CATEGORY.FILE,
    recoveryStrategy: RECOVERY_STRATEGY.ABORT_IMPORT,
    retryable: false,
    autoSkippable: false,
    description: 'File exceeds maximum size limit'
  },
  [IMPORT_ERROR_TYPES.UNSUPPORTED_FORMAT]: {
    severity: ERROR_SEVERITY.CRITICAL,
    category: ERROR_CATEGORY.FILE,
    recoveryStrategy: RECOVERY_STRATEGY.ABORT_IMPORT,
    retryable: false,
    autoSkippable: false,
    description: 'File format is not supported'
  },
  [IMPORT_ERROR_TYPES.ENCODING_ERROR]: {
    severity: ERROR_SEVERITY.HIGH,
    category: ERROR_CATEGORY.FILE,
    recoveryStrategy: RECOVERY_STRATEGY.MANUAL_REVIEW,
    retryable: false,
    autoSkippable: false,
    description: 'File encoding is not supported or corrupted'
  },
  [IMPORT_ERROR_TYPES.PLATFORM_API_ERROR]: {
    severity: ERROR_SEVERITY.HIGH,
    category: ERROR_CATEGORY.PLATFORM,
    recoveryStrategy: RECOVERY_STRATEGY.RETRY_AUTOMATIC,
    retryable: true,
    autoSkippable: false,
    description: 'Platform API returned an error'
  },
  [IMPORT_ERROR_TYPES.PLATFORM_RATE_LIMIT]: {
    severity: ERROR_SEVERITY.MEDIUM,
    category: ERROR_CATEGORY.PLATFORM,
    recoveryStrategy: RECOVERY_STRATEGY.RETRY_AUTOMATIC,
    retryable: true,
    autoSkippable: false,
    description: 'Platform API rate limit exceeded'
  },
  [IMPORT_ERROR_TYPES.PLATFORM_AUTHENTICATION]: {
    severity: ERROR_SEVERITY.CRITICAL,
    category: ERROR_CATEGORY.PLATFORM,
    recoveryStrategy: RECOVERY_STRATEGY.MANUAL_REVIEW,
    retryable: false,
    autoSkippable: false,
    description: 'Platform authentication failed'
  },
  [IMPORT_ERROR_TYPES.UNKNOWN_ERROR]: {
    severity: ERROR_SEVERITY.HIGH,
    category: ERROR_CATEGORY.UNKNOWN,
    recoveryStrategy: RECOVERY_STRATEGY.MANUAL_REVIEW,
    retryable: false,
    autoSkippable: false,
    description: 'An unexpected error occurred'
  }
}

/**
 * Get error configuration by type
 */
export function getErrorConfig(errorType: ImportErrorType) {
  return ERROR_TYPE_CONFIG[errorType] || ERROR_TYPE_CONFIG[IMPORT_ERROR_TYPES.UNKNOWN_ERROR]
}

/**
 * Check if error is retryable
 */
export function isRetryableError(errorType: ImportErrorType): boolean {
  return getErrorConfig(errorType).retryable
}

/**
 * Check if error can be auto-skipped
 */
export function isAutoSkippableError(errorType: ImportErrorType): boolean {
  return getErrorConfig(errorType).autoSkippable
}

/**
 * Get errors by severity level
 */
export function getErrorsBySeverity(errors: { errorType: ImportErrorType }[], severity: ErrorSeverity): typeof errors {
  return errors.filter(error => getErrorConfig(error.errorType).severity === severity)
}

/**
 * Get errors by category
 */
export function getErrorsByCategory(errors: { errorType: ImportErrorType }[], category: ErrorCategory): typeof errors {
  return errors.filter(error => getErrorConfig(error.errorType).category === category)
}

/**
 * Check if errors contain critical issues that should block import
 */
export function hasCriticalErrors(errors: { errorType: ImportErrorType }[]): boolean {
  return errors.some(error => 
    getErrorConfig(error.errorType).severity === ERROR_SEVERITY.CRITICAL &&
    !getErrorConfig(error.errorType).autoSkippable
  )
}

/**
 * Get retry strategy for error type
 */
export function getRetryStrategy(errorType: ImportErrorType): {
  maxRetries: number
  delayMs: number
  backoffMultiplier: number
} {
  const config = getErrorConfig(errorType)
  
  if (!config.retryable) {
    return { maxRetries: 0, delayMs: 0, backoffMultiplier: 1 }
  }

  switch (config.category) {
    case ERROR_CATEGORY.SYSTEM:
      return { maxRetries: 3, delayMs: 1000, backoffMultiplier: 2 }
    case ERROR_CATEGORY.PLATFORM:
      return { maxRetries: 5, delayMs: 2000, backoffMultiplier: 1.5 }
    default:
      return { maxRetries: 1, delayMs: 500, backoffMultiplier: 1 }
  }
}

/**
 * Error display configuration for UI
 */
export const ERROR_UI_CONFIG: Record<ErrorSeverity, {
  color: string
  icon: string
  bgColor: string
  textColor: string
}> = {
  [ERROR_SEVERITY.CRITICAL]: {
    color: 'red',
    icon: 'AlertTriangle',
    bgColor: 'bg-red-50',
    textColor: 'text-red-900'
  },
  [ERROR_SEVERITY.HIGH]: {
    color: 'orange',
    icon: 'AlertCircle',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-900'
  },
  [ERROR_SEVERITY.MEDIUM]: {
    color: 'yellow',
    icon: 'AlertTriangle',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-900'
  },
  [ERROR_SEVERITY.LOW]: {
    color: 'blue',
    icon: 'Info',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-900'
  },
  [ERROR_SEVERITY.INFO]: {
    color: 'gray',
    icon: 'Info',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-900'
  }
}

/**
 * Get UI configuration for error severity
 */
export function getErrorUIConfig(severity: ErrorSeverity) {
  return ERROR_UI_CONFIG[severity] || ERROR_UI_CONFIG[ERROR_SEVERITY.INFO]
}