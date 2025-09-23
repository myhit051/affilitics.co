/**
 * Import Processing Configuration Constants
 * 
 * This module provides centralized configuration for import processing,
 * error handling, and retry mechanisms. All values can be overridden
 * via environment variables.
 */

/**
 * Import Processing Configuration
 */
export const IMPORT_CONFIG = {
  // Batch Processing
  BATCH_SIZE: parseInt(process.env.IMPORT_BATCH_SIZE || '100'),
  MAX_FILE_SIZE: parseInt(process.env.IMPORT_MAX_FILE_SIZE || '50') * 1024 * 1024, // 50MB default
  MAX_ROWS: parseInt(process.env.IMPORT_MAX_ROWS || '100000'), // 100K rows default
  
  // Timeouts
  PROCESSING_TIMEOUT_MS: parseInt(process.env.IMPORT_PROCESSING_TIMEOUT_MS || '300000'), // 5 minutes
  VALIDATION_TIMEOUT_MS: parseInt(process.env.IMPORT_VALIDATION_TIMEOUT_MS || '60000'), // 1 minute
  STORAGE_TIMEOUT_MS: parseInt(process.env.IMPORT_STORAGE_TIMEOUT_MS || '30000'), // 30 seconds
  
  // Concurrency
  MAX_CONCURRENT_JOBS: parseInt(process.env.IMPORT_MAX_CONCURRENT_JOBS || '5'),
  WORKER_THREADS: parseInt(process.env.IMPORT_WORKER_THREADS || '2'),
  
  // Memory Management
  MEMORY_THRESHOLD_MB: parseInt(process.env.IMPORT_MEMORY_THRESHOLD_MB || '512'),
  CLEANUP_INTERVAL_MS: parseInt(process.env.IMPORT_CLEANUP_INTERVAL_MS || '3600000'), // 1 hour
} as const

/**
 * Error Handling Configuration
 */
export const ERROR_CONFIG = {
  // Error Limits
  MAX_ERRORS_PER_JOB: parseInt(process.env.IMPORT_MAX_ERRORS_PER_JOB || '1000'),
  MAX_ERRORS_PER_BATCH: parseInt(process.env.IMPORT_MAX_ERRORS_PER_BATCH || '100'),
  ERROR_SAMPLE_SIZE: parseInt(process.env.IMPORT_ERROR_SAMPLE_SIZE || '5'),
  
  // Error Storage
  ERROR_RETENTION_DAYS: parseInt(process.env.IMPORT_ERROR_RETENTION_DAYS || '90'),
  MAX_ERROR_MESSAGE_LENGTH: parseInt(process.env.IMPORT_MAX_ERROR_MESSAGE_LENGTH || '500'),
  MAX_STACK_TRACE_LENGTH: parseInt(process.env.IMPORT_MAX_STACK_TRACE_LENGTH || '2000'),
  MAX_CONTEXT_SIZE: parseInt(process.env.IMPORT_MAX_CONTEXT_SIZE || '1024'),
  
  // Error Processing
  AUTO_DISMISS_AFTER_DAYS: parseInt(process.env.IMPORT_AUTO_DISMISS_AFTER_DAYS || '30'),
  BULK_ACTION_BATCH_SIZE: parseInt(process.env.IMPORT_BULK_ACTION_BATCH_SIZE || '100'),
} as const

/**
 * Retry Configuration
 */
export const RETRY_CONFIG = {
  // Global Retry Limits
  DEFAULT_MAX_RETRIES: parseInt(process.env.IMPORT_DEFAULT_MAX_RETRIES || '3'),
  MAX_RETRIES_LIMIT: parseInt(process.env.IMPORT_MAX_RETRIES_LIMIT || '10'),
  
  // Retry Delays (in milliseconds)
  MIN_RETRY_DELAY_MS: parseInt(process.env.IMPORT_MIN_RETRY_DELAY_MS || '1000'), // 1 second
  MAX_RETRY_DELAY_MS: parseInt(process.env.IMPORT_MAX_RETRY_DELAY_MS || '300000'), // 5 minutes
  RETRY_BACKOFF_MULTIPLIER: parseFloat(process.env.IMPORT_RETRY_BACKOFF_MULTIPLIER || '2.0'),
  RETRY_JITTER_MS: parseInt(process.env.IMPORT_RETRY_JITTER_MS || '1000'),
  
  // Retry Behavior
  AUTO_RETRY_ENABLED: process.env.IMPORT_AUTO_RETRY_ENABLED !== 'false',
  RETRY_ON_SYSTEM_ERRORS: process.env.IMPORT_RETRY_ON_SYSTEM_ERRORS !== 'false',
  RETRY_ON_NETWORK_ERRORS: process.env.IMPORT_RETRY_ON_NETWORK_ERRORS !== 'false',
  RETRY_COOLDOWN_MS: parseInt(process.env.IMPORT_RETRY_COOLDOWN_MS || '60000'), // 1 minute
} as const

/**
 * Analytics Configuration
 */
export const ANALYTICS_CONFIG = {
  // Data Retention
  DEFAULT_ANALYTICS_DAYS: parseInt(process.env.IMPORT_DEFAULT_ANALYTICS_DAYS || '30'),
  MAX_ANALYTICS_DAYS: parseInt(process.env.IMPORT_MAX_ANALYTICS_DAYS || '365'),
  
  // Performance
  ANALYTICS_CACHE_TTL_SECONDS: parseInt(process.env.IMPORT_ANALYTICS_CACHE_TTL_SECONDS || '300'), // 5 minutes
  MAX_ANALYTICS_RECORDS: parseInt(process.env.IMPORT_MAX_ANALYTICS_RECORDS || '10000'),
  
  // Reporting
  MAX_REPORT_SIZE_MB: parseInt(process.env.IMPORT_MAX_REPORT_SIZE_MB || '10'),
  REPORT_GENERATION_TIMEOUT_MS: parseInt(process.env.IMPORT_REPORT_GENERATION_TIMEOUT_MS || '120000'), // 2 minutes
} as const

/**
 * Security Configuration
 */
export const SECURITY_CONFIG = {
  // Input Validation
  MAX_FILENAME_LENGTH: parseInt(process.env.IMPORT_MAX_FILENAME_LENGTH || '255'),
  ALLOWED_FILE_EXTENSIONS: (process.env.IMPORT_ALLOWED_FILE_EXTENSIONS || 'csv,xlsx,xls,tsv').split(','),
  
  // Rate Limiting
  MAX_REQUESTS_PER_MINUTE: parseInt(process.env.IMPORT_MAX_REQUESTS_PER_MINUTE || '60'),
  MAX_CONCURRENT_REQUESTS: parseInt(process.env.IMPORT_MAX_CONCURRENT_REQUESTS || '10'),
  
  // Data Sanitization
  SANITIZE_ERROR_MESSAGES: process.env.IMPORT_SANITIZE_ERROR_MESSAGES !== 'false',
  INCLUDE_STACK_TRACES: process.env.NODE_ENV === 'development' || process.env.IMPORT_INCLUDE_STACK_TRACES === 'true',
  
  // Audit
  ENABLE_ERROR_AUDIT_LOG: process.env.IMPORT_ENABLE_ERROR_AUDIT_LOG === 'true',
  AUDIT_LOG_RETENTION_DAYS: parseInt(process.env.IMPORT_AUDIT_LOG_RETENTION_DAYS || '180'),
} as const

/**
 * Storage Configuration
 */
export const STORAGE_CONFIG = {
  // File Storage
  TEMP_FILE_TTL_HOURS: parseInt(process.env.IMPORT_TEMP_FILE_TTL_HOURS || '24'),
  MAX_STORAGE_USAGE_MB: parseInt(process.env.IMPORT_MAX_STORAGE_USAGE_MB || '1024'), // 1GB
  
  // Cleanup
  CLEANUP_BATCH_SIZE: parseInt(process.env.IMPORT_CLEANUP_BATCH_SIZE || '100'),
  FORCE_CLEANUP_AFTER_HOURS: parseInt(process.env.IMPORT_FORCE_CLEANUP_AFTER_HOURS || '72'),
} as const

/**
 * CSV Validation Configuration
 */
export const CSV_VALIDATION_CONFIG = {
  // Stream Processing
  STREAM_CHUNK_SIZE: parseInt(process.env.CSV_STREAM_CHUNK_SIZE || '1000'),
  STREAM_HIGHWATER_MARK: parseInt(process.env.CSV_STREAM_HIGHWATER_MARK || '16384'), // 16KB
  ENABLE_STREAMING: process.env.CSV_ENABLE_STREAMING !== 'false',
  
  // Validation Performance
  VALIDATION_CHUNK_SIZE: parseInt(process.env.CSV_VALIDATION_CHUNK_SIZE || '100'),
  MAX_VALIDATION_ERRORS: parseInt(process.env.CSV_MAX_VALIDATION_ERRORS || '1000'),
  VALIDATION_EARLY_EXIT: process.env.CSV_VALIDATION_EARLY_EXIT === 'true',
  VALIDATION_PARALLEL_WORKERS: parseInt(process.env.CSV_VALIDATION_PARALLEL_WORKERS || '2'),
  
  // Caching
  VALIDATION_CACHE_ENABLED: process.env.CSV_VALIDATION_CACHE_ENABLED !== 'false',
  VALIDATION_CACHE_TTL_MINUTES: parseInt(process.env.CSV_VALIDATION_CACHE_TTL_MINUTES || '30'),
  VALIDATION_CACHE_MAX_ENTRIES: parseInt(process.env.CSV_VALIDATION_CACHE_MAX_ENTRIES || '100'),
  
  // Platform Detection
  AUTO_DETECT_PLATFORM: process.env.CSV_AUTO_DETECT_PLATFORM !== 'false',
  PLATFORM_DETECTION_CONFIDENCE_THRESHOLD: parseFloat(process.env.CSV_PLATFORM_DETECTION_CONFIDENCE_THRESHOLD || '0.8'),
  PLATFORM_DETECTION_SAMPLE_SIZE: parseInt(process.env.CSV_PLATFORM_DETECTION_SAMPLE_SIZE || '50'),
  
  // Business Rules
  COMMISSION_RATE_MIN_PERCENT: parseFloat(process.env.CSV_COMMISSION_RATE_MIN_PERCENT || '0'),
  COMMISSION_RATE_MAX_PERCENT: parseFloat(process.env.CSV_COMMISSION_RATE_MAX_PERCENT || '50'),
  ORDER_DATE_MAX_DAYS_AGO: parseInt(process.env.CSV_ORDER_DATE_MAX_DAYS_AGO || '365'),
  ORDER_DATE_MAX_DAYS_FUTURE: parseInt(process.env.CSV_ORDER_DATE_MAX_DAYS_FUTURE || '7'),
  
  // Format Validation
  PRODUCT_NAME_MIN_LENGTH: parseInt(process.env.CSV_PRODUCT_NAME_MIN_LENGTH || '1'),
  PRODUCT_NAME_MAX_LENGTH: parseInt(process.env.CSV_PRODUCT_NAME_MAX_LENGTH || '500'),
  ORDER_ID_MIN_LENGTH: parseInt(process.env.CSV_ORDER_ID_MIN_LENGTH || '5'),
  ORDER_ID_MAX_LENGTH: parseInt(process.env.CSV_ORDER_ID_MAX_LENGTH || '100'),
  
  // Currency Validation
  SUPPORTED_CURRENCIES: (process.env.CSV_SUPPORTED_CURRENCIES || 'USD,EUR,GBP,THB,SGD,MYR,VND,IDR,PHP').split(','),
  CURRENCY_DECIMAL_PLACES: parseInt(process.env.CSV_CURRENCY_DECIMAL_PLACES || '2'),
  CURRENCY_MAX_VALUE: parseFloat(process.env.CSV_CURRENCY_MAX_VALUE || '1000000'),
  
  // Preview Mode
  PREVIEW_MAX_ROWS: parseInt(process.env.CSV_PREVIEW_MAX_ROWS || '100'),
  PREVIEW_VALIDATION_TIMEOUT_MS: parseInt(process.env.CSV_PREVIEW_VALIDATION_TIMEOUT_MS || '30000'), // 30 seconds
  
  // Error Reporting
  ERROR_CONTEXT_LINES: parseInt(process.env.CSV_ERROR_CONTEXT_LINES || '2'),
  ERROR_SAMPLE_VALUES: parseInt(process.env.CSV_ERROR_SAMPLE_VALUES || '3'),
  DETAILED_ERROR_MESSAGES: process.env.CSV_DETAILED_ERROR_MESSAGES !== 'false',
} as const

/**
 * Platform-Specific Validation Configuration
 */
export const PLATFORM_VALIDATION_CONFIG = {
  // Shopee specific
  SHOPEE: {
    MAX_COMMISSION_RATE_PERCENT: parseFloat(process.env.CSV_SHOPEE_MAX_COMMISSION_RATE || '30'),
    VALID_ORDER_STATUSES: (process.env.CSV_SHOPEE_VALID_STATUSES || 'รอดำเนินการ,สำเร็จ,ยกเลิก,คืนเงิน,รอตรวจสอบ').split(','),
    REQUIRED_FIELDS_COUNT_MIN: parseInt(process.env.CSV_SHOPEE_REQUIRED_FIELDS_MIN || '5'),
    DUPLICATE_DETECTION_FIELDS: (process.env.CSV_SHOPEE_DUPLICATE_FIELDS || 'รหัสการสั่งซื้อ').split(','),
    CURRENCY_SYMBOL: process.env.CSV_SHOPEE_CURRENCY_SYMBOL || '฿',
  },
  
  // Lazada specific
  LAZADA: {
    MAX_COMMISSION_RATE_PERCENT: parseFloat(process.env.CSV_LAZADA_MAX_COMMISSION_RATE || '50'),
    VALID_ORDER_STATUSES: (process.env.CSV_LAZADA_VALID_STATUSES || 'Confirmed,Pending,Cancelled,Invalid,Paid').split(','),
    REQUIRED_FIELDS_COUNT_MIN: parseInt(process.env.CSV_LAZADA_REQUIRED_FIELDS_MIN || '6'),
    DUPLICATE_DETECTION_FIELDS: (process.env.CSV_LAZADA_DUPLICATE_FIELDS || 'Transaction ID').split(','),
    CURRENCY_SYMBOL: process.env.CSV_LAZADA_CURRENCY_SYMBOL || '$',
  },
  
  // TikTok specific
  TIKTOK: {
    MAX_COMMISSION_RATE_PERCENT: parseFloat(process.env.CSV_TIKTOK_MAX_COMMISSION_RATE || '30'),
    VALID_ORDER_STATUSES: (process.env.CSV_TIKTOK_VALID_STATUSES || 'Completed,Pending Settlement,Cancelled,Invalid,Under Review').split(','),
    REQUIRED_FIELDS_COUNT_MIN: parseInt(process.env.CSV_TIKTOK_REQUIRED_FIELDS_MIN || '6'),
    DUPLICATE_DETECTION_FIELDS: (process.env.CSV_TIKTOK_DUPLICATE_FIELDS || 'Order No.').split(','),
    CURRENCY_SYMBOL: process.env.CSV_TIKTOK_CURRENCY_SYMBOL || '$',
  },
} as const

/**
 * Feature Flags
 */
export const FEATURE_FLAGS = {
  ENABLE_ADVANCED_ANALYTICS: process.env.IMPORT_ENABLE_ADVANCED_ANALYTICS === 'true',
  ENABLE_AUTO_RETRY: process.env.IMPORT_ENABLE_AUTO_RETRY !== 'false',
  ENABLE_ERROR_PREDICTIONS: process.env.IMPORT_ENABLE_ERROR_PREDICTIONS === 'true',
  ENABLE_PERFORMANCE_MONITORING: process.env.IMPORT_ENABLE_PERFORMANCE_MONITORING !== 'false',
  ENABLE_REAL_TIME_UPDATES: process.env.IMPORT_ENABLE_REAL_TIME_UPDATES === 'true',
  ENABLE_ERROR_CATEGORIZATION: process.env.IMPORT_ENABLE_ERROR_CATEGORIZATION !== 'false',
  
  // CSV Validation Features
  ENABLE_CSV_STREAMING: process.env.CSV_ENABLE_STREAMING !== 'false',
  ENABLE_CSV_VALIDATION_CACHE: process.env.CSV_VALIDATION_CACHE_ENABLED !== 'false',
  ENABLE_CSV_AUTO_DETECTION: process.env.CSV_AUTO_DETECT_PLATFORM !== 'false',
  ENABLE_CSV_BUSINESS_RULES: process.env.CSV_ENABLE_BUSINESS_RULES !== 'false',
  ENABLE_CSV_CROSS_FIELD_VALIDATION: process.env.CSV_ENABLE_CROSS_FIELD_VALIDATION !== 'false',
} as const

/**
 * Environment-specific Overrides
 */
export const ENV_OVERRIDES = {
  // Development
  ...(process.env.NODE_ENV === 'development' && {
    IMPORT_MAX_ERRORS_PER_JOB: 100, // Lower limits for dev
    IMPORT_PROCESSING_TIMEOUT_MS: 60000, // Shorter timeouts
    IMPORT_INCLUDE_STACK_TRACES: true,
    IMPORT_ENABLE_PERFORMANCE_MONITORING: true,
  }),
  
  // Test
  ...(process.env.NODE_ENV === 'test' && {
    IMPORT_BATCH_SIZE: 10, // Small batches for testing
    IMPORT_MAX_RETRIES_LIMIT: 2,
    IMPORT_PROCESSING_TIMEOUT_MS: 10000,
    IMPORT_ANALYTICS_CACHE_TTL_SECONDS: 1,
  }),
  
  // Production
  ...(process.env.NODE_ENV === 'production' && {
    IMPORT_INCLUDE_STACK_TRACES: false, // Security
    IMPORT_SANITIZE_ERROR_MESSAGES: true,
    IMPORT_ENABLE_ERROR_AUDIT_LOG: true,
  })
} as const

/**
 * Validation Functions
 */
export function validateImportConfig() {
  const errors: string[] = []
  
  // Validate batch size
  if (IMPORT_CONFIG.BATCH_SIZE <= 0 || IMPORT_CONFIG.BATCH_SIZE > 10000) {
    errors.push('IMPORT_BATCH_SIZE must be between 1 and 10000')
  }
  
  // Validate file size
  if (IMPORT_CONFIG.MAX_FILE_SIZE <= 0 || IMPORT_CONFIG.MAX_FILE_SIZE > 1024 * 1024 * 1024) {
    errors.push('IMPORT_MAX_FILE_SIZE must be between 1 byte and 1GB')
  }
  
  // Validate retry configuration
  if (RETRY_CONFIG.DEFAULT_MAX_RETRIES < 0 || RETRY_CONFIG.DEFAULT_MAX_RETRIES > RETRY_CONFIG.MAX_RETRIES_LIMIT) {
    errors.push('IMPORT_DEFAULT_MAX_RETRIES must be between 0 and MAX_RETRIES_LIMIT')
  }
  
  // Validate timeouts
  if (IMPORT_CONFIG.PROCESSING_TIMEOUT_MS <= 0) {
    errors.push('IMPORT_PROCESSING_TIMEOUT_MS must be greater than 0')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Validate CSV validation configuration
 */
export function validateCSVConfig() {
  const errors: string[] = []
  
  // Validate chunk sizes
  if (CSV_VALIDATION_CONFIG.STREAM_CHUNK_SIZE <= 0 || CSV_VALIDATION_CONFIG.STREAM_CHUNK_SIZE > 10000) {
    errors.push('CSV_STREAM_CHUNK_SIZE must be between 1 and 10000')
  }
  
  if (CSV_VALIDATION_CONFIG.VALIDATION_CHUNK_SIZE <= 0 || CSV_VALIDATION_CONFIG.VALIDATION_CHUNK_SIZE > 1000) {
    errors.push('CSV_VALIDATION_CHUNK_SIZE must be between 1 and 1000')
  }
  
  // Validate parallel workers
  if (CSV_VALIDATION_CONFIG.VALIDATION_PARALLEL_WORKERS <= 0 || CSV_VALIDATION_CONFIG.VALIDATION_PARALLEL_WORKERS > 8) {
    errors.push('CSV_VALIDATION_PARALLEL_WORKERS must be between 1 and 8')
  }
  
  // Validate cache configuration
  if (CSV_VALIDATION_CONFIG.VALIDATION_CACHE_TTL_MINUTES <= 0 || CSV_VALIDATION_CONFIG.VALIDATION_CACHE_TTL_MINUTES > 1440) {
    errors.push('CSV_VALIDATION_CACHE_TTL_MINUTES must be between 1 and 1440 (24 hours)')
  }
  
  // Validate platform detection
  if (CSV_VALIDATION_CONFIG.PLATFORM_DETECTION_CONFIDENCE_THRESHOLD < 0 || CSV_VALIDATION_CONFIG.PLATFORM_DETECTION_CONFIDENCE_THRESHOLD > 1) {
    errors.push('CSV_PLATFORM_DETECTION_CONFIDENCE_THRESHOLD must be between 0 and 1')
  }
  
  // Validate business rules
  if (CSV_VALIDATION_CONFIG.COMMISSION_RATE_MIN_PERCENT < 0 || CSV_VALIDATION_CONFIG.COMMISSION_RATE_MIN_PERCENT > CSV_VALIDATION_CONFIG.COMMISSION_RATE_MAX_PERCENT) {
    errors.push('CSV_COMMISSION_RATE_MIN_PERCENT must be >= 0 and <= MAX_PERCENT')
  }
  
  if (CSV_VALIDATION_CONFIG.COMMISSION_RATE_MAX_PERCENT <= 0 || CSV_VALIDATION_CONFIG.COMMISSION_RATE_MAX_PERCENT > 100) {
    errors.push('CSV_COMMISSION_RATE_MAX_PERCENT must be between 0 and 100')
  }
  
  // Validate field lengths
  if (CSV_VALIDATION_CONFIG.PRODUCT_NAME_MIN_LENGTH <= 0 || CSV_VALIDATION_CONFIG.PRODUCT_NAME_MIN_LENGTH > CSV_VALIDATION_CONFIG.PRODUCT_NAME_MAX_LENGTH) {
    errors.push('CSV_PRODUCT_NAME_MIN_LENGTH must be > 0 and <= MAX_LENGTH')
  }
  
  if (CSV_VALIDATION_CONFIG.ORDER_ID_MIN_LENGTH <= 0 || CSV_VALIDATION_CONFIG.ORDER_ID_MIN_LENGTH > CSV_VALIDATION_CONFIG.ORDER_ID_MAX_LENGTH) {
    errors.push('CSV_ORDER_ID_MIN_LENGTH must be > 0 and <= MAX_LENGTH')
  }
  
  // Validate currency configuration
  if (CSV_VALIDATION_CONFIG.CURRENCY_DECIMAL_PLACES < 0 || CSV_VALIDATION_CONFIG.CURRENCY_DECIMAL_PLACES > 8) {
    errors.push('CSV_CURRENCY_DECIMAL_PLACES must be between 0 and 8')
  }
  
  if (CSV_VALIDATION_CONFIG.CURRENCY_MAX_VALUE <= 0) {
    errors.push('CSV_CURRENCY_MAX_VALUE must be greater than 0')
  }
  
  // Validate platform-specific configurations
  Object.entries(PLATFORM_VALIDATION_CONFIG).forEach(([platform, config]) => {
    if (config.MAX_COMMISSION_RATE_PERCENT <= 0 || config.MAX_COMMISSION_RATE_PERCENT > 100) {
      errors.push(`${platform} MAX_COMMISSION_RATE_PERCENT must be between 0 and 100`)
    }
    
    if (config.REQUIRED_FIELDS_COUNT_MIN <= 0) {
      errors.push(`${platform} REQUIRED_FIELDS_COUNT_MIN must be greater than 0`)
    }
    
    if (config.VALID_ORDER_STATUSES.length === 0) {
      errors.push(`${platform} VALID_ORDER_STATUSES cannot be empty`)
    }
  })
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Get effective configuration with environment overrides
 */
export function getEffectiveConfig() {
  return {
    import: { ...IMPORT_CONFIG, ...ENV_OVERRIDES },
    error: { ...ERROR_CONFIG, ...ENV_OVERRIDES },
    retry: { ...RETRY_CONFIG, ...ENV_OVERRIDES },
    analytics: { ...ANALYTICS_CONFIG, ...ENV_OVERRIDES },
    security: { ...SECURITY_CONFIG, ...ENV_OVERRIDES },
    storage: { ...STORAGE_CONFIG, ...ENV_OVERRIDES },
    csvValidation: { ...CSV_VALIDATION_CONFIG, ...ENV_OVERRIDES },
    platformValidation: { ...PLATFORM_VALIDATION_CONFIG, ...ENV_OVERRIDES },
    features: { ...FEATURE_FLAGS, ...ENV_OVERRIDES }
  }
}

/**
 * Configuration summary for debugging
 */
export function getConfigSummary() {
  const config = getEffectiveConfig()
  const importValidation = validateImportConfig()
  const csvValidation = validateCSVConfig()
  
  return {
    environment: process.env.NODE_ENV || 'development',
    validation: {
      import: importValidation,
      csv: csvValidation,
      isValid: importValidation.isValid && csvValidation.isValid,
      allErrors: [...importValidation.errors, ...csvValidation.errors]
    },
    limits: {
      batchSize: config.import.BATCH_SIZE,
      maxFileSize: Math.round(config.import.MAX_FILE_SIZE / 1024 / 1024) + 'MB',
      maxRetries: config.retry.DEFAULT_MAX_RETRIES,
      maxErrors: config.error.MAX_ERRORS_PER_JOB,
      csvChunkSize: config.csvValidation.STREAM_CHUNK_SIZE,
      maxValidationErrors: config.csvValidation.MAX_VALIDATION_ERRORS
    },
    csv: {
      streamingEnabled: config.features.ENABLE_CSV_STREAMING,
      cacheEnabled: config.features.ENABLE_CSV_VALIDATION_CACHE,
      autoDetection: config.features.ENABLE_CSV_AUTO_DETECTION,
      businessRules: config.features.ENABLE_CSV_BUSINESS_RULES,
      previewRows: config.csvValidation.PREVIEW_MAX_ROWS,
      supportedCurrencies: config.csvValidation.SUPPORTED_CURRENCIES.length,
      parallelWorkers: config.csvValidation.VALIDATION_PARALLEL_WORKERS
    },
    platforms: {
      supported: Object.keys(config.platformValidation),
      shopeeMaxCommission: config.platformValidation.SHOPEE.MAX_COMMISSION_RATE_PERCENT,
      lazadaMaxCommission: config.platformValidation.LAZADA.MAX_COMMISSION_RATE_PERCENT,
      tiktokMaxCommission: config.platformValidation.TIKTOK.MAX_COMMISSION_RATE_PERCENT
    },
    features: Object.entries(config.features)
      .filter(([, enabled]) => enabled)
      .map(([feature]) => feature),
    timeouts: {
      processing: config.import.PROCESSING_TIMEOUT_MS + 'ms',
      validation: config.import.VALIDATION_TIMEOUT_MS + 'ms',
      storage: config.import.STORAGE_TIMEOUT_MS + 'ms',
      previewValidation: config.csvValidation.PREVIEW_VALIDATION_TIMEOUT_MS + 'ms'
    }
  }
}

/**
 * Get platform-specific configuration summary
 */
export function getPlatformConfigSummary(platform: string) {
  const config = getEffectiveConfig()
  const platformKey = platform.toUpperCase() as keyof typeof config.platformValidation
  const platformConfig = config.platformValidation[platformKey]
  
  if (!platformConfig || typeof platformConfig !== 'object') {
    throw new Error(`Unsupported platform: ${platform}`)
  }
  
  // Type assertion for platform config
  const typedPlatformConfig = platformConfig as typeof PLATFORM_VALIDATION_CONFIG.SHOPEE
  
  return {
    platform,
    maxCommissionRate: typedPlatformConfig.MAX_COMMISSION_RATE_PERCENT,
    validOrderStatuses: typedPlatformConfig.VALID_ORDER_STATUSES,
    requiredFieldsMin: typedPlatformConfig.REQUIRED_FIELDS_COUNT_MIN,
    duplicateDetectionFields: typedPlatformConfig.DUPLICATE_DETECTION_FIELDS,
    currencySymbol: typedPlatformConfig.CURRENCY_SYMBOL,
    businessRules: {
      commissionRateRange: [
        config.csvValidation.COMMISSION_RATE_MIN_PERCENT,
        typedPlatformConfig.MAX_COMMISSION_RATE_PERCENT
      ],
      orderDateRange: [
        -config.csvValidation.ORDER_DATE_MAX_DAYS_AGO,
        config.csvValidation.ORDER_DATE_MAX_DAYS_FUTURE
      ]
    }
  }
}

// Auto-validate configuration on import
const importValidation = validateImportConfig()
const csvValidation = validateCSVConfig()

if ((!importValidation.isValid || !csvValidation.isValid) && process.env.NODE_ENV !== 'test') {
  const allErrors = [...importValidation.errors, ...csvValidation.errors]
  console.warn('Configuration validation failed:', allErrors)
  
  if (process.env.NODE_ENV === 'production') {
    // In production, log detailed validation summary
    console.error('Configuration validation summary:', {
      importValid: importValidation.isValid,
      csvValid: csvValidation.isValid,
      errorCount: allErrors.length,
      errors: allErrors
    })
  }
}