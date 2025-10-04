/**
 * Enhanced error handling with user-friendly messages
 * จัดการข้อผิดพลาดและแปลงเป็นข้อความที่ผู้ใช้เข้าใจง่าย
 * พร้อมคำแนะนำการแก้ไขปัญหา
 */

/**
 * Error categories for classification
 */
export const ERROR_CATEGORIES = {
  FILE_PROCESSING: 'file_processing',
  NETWORK: 'network',
  DATABASE: 'database',
  MEMORY: 'memory',
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  PERMISSION: 'permission',
  RATE_LIMIT: 'rate_limit',
  TIMEOUT: 'timeout',
  SYSTEM: 'system',
  UNKNOWN: 'unknown'
}

/**
 * Error severity levels
 */
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
}

/**
 * User-friendly error messages in Thai
 */
const ERROR_MESSAGES = {
  [ERROR_CATEGORIES.FILE_PROCESSING]: {
    title: 'ปัญหาการประมวลผลไฟล์',
    messages: {
      'invalid_format': 'รูปแบบไฟล์ไม่ถูกต้อง กรุณาตรวจสอบไฟล์ CSV',
      'file_too_large': 'ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 50MB)',
      'malformed_csv': 'ไฟล์ CSV มีรูปแบบไม่ถูกต้อง',
      'empty_file': 'ไฟล์ที่อัปโหลดเป็นไฟล์ว่าง',
      'encoding_error': 'ไม่สามารถอ่านไฟล์ได้ อาจเป็นปัญหาเรื่อง encoding',
      'column_mismatch': 'คอลัมน์ในไฟล์ไม่ตรงกับรูปแบบที่กำหนด'
    },
    suggestions: {
      'invalid_format': 'กรุณาตรวจสอบว่าไฟล์เป็น CSV และมีข้อมูลที่ถูกต้อง',
      'file_too_large': 'กรุณาแบ่งไฟล์ออกเป็นหลายไฟล์ที่เล็กกว่า หรือลบข้อมูลที่ไม่จำเป็น',
      'malformed_csv': 'ตรวจสอบให้แน่ใจว่าไฟล์ CSV มี header และข้อมูลที่ครบถ้วน',
      'empty_file': 'กรุณาตรวจสอบไฟล์และอัปโหลดไฟล์ที่มีข้อมูล',
      'encoding_error': 'ลองบันทึกไฟล์ในรูปแบบ UTF-8 และอัปโหลดใหม่',
      'column_mismatch': 'ตรวจสอบว่าไฟล์มีคอลัมน์ที่จำเป็น เช่น Order ID, Amount เป็นต้น'
    }
  },

  [ERROR_CATEGORIES.NETWORK]: {
    title: 'ปัญหาการเชื่อมต่อเครือข่าย',
    messages: {
      'connection_timeout': 'หมดเวลาการเชื่อมต่อ',
      'connection_refused': 'ไม่สามารถเชื่อมต่อได้',
      'network_error': 'เกิดข้อผิดพลาดทางเครือข่าย',
      'dns_error': 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'
    },
    suggestions: {
      'connection_timeout': 'กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและลองใหม่',
      'connection_refused': 'เซิร์ฟเวอร์อาจไม่พร้อมใช้งาน กรุณาลองใหม่ในภายหลัง',
      'network_error': 'ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและลองใหม่อีกครั้ง',
      'dns_error': 'ปัญหาการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่ในภายหลัง'
    }
  },

  [ERROR_CATEGORIES.DATABASE]: {
    title: 'ปัญหาฐานข้อมูล',
    messages: {
      'connection_failed': 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้',
      'query_timeout': 'หมดเวลาการค้นหาข้อมูล',
      'constraint_violation': 'ข้อมูลซ้ำหรือไม่ถูกต้อง',
      'transaction_failed': 'การบันทึกข้อมูลล้มเหลว'
    },
    suggestions: {
      'connection_failed': 'ระบบอาจไม่พร้อมใช้งาน กรุณาลองใหม่ในภายหลัง',
      'query_timeout': 'ไฟล์มีข้อมูลมาก กรุณารอสักครู่และลองใหม่',
      'constraint_violation': 'ข้อมูลบางส่วนอาจซ้ำ ระบบจะข้ามข้อมูลซ้ำไป',
      'transaction_failed': 'การบันทึกล้มเหลว กรุณาลองอัปโหลดใหม่'
    }
  },

  [ERROR_CATEGORIES.MEMORY]: {
    title: 'ปัญหาหน่วยความจำ',
    messages: {
      'out_of_memory': 'หน่วยความจำไม่เพียงพอ',
      'memory_limit': 'เกินขีดจำกัดหน่วยความจำ',
      'heap_overflow': 'ข้อมูลมากเกินไป'
    },
    suggestions: {
      'out_of_memory': 'ไฟล์มีขนาดใหญ่เกินไป กรุณาแบ่งไฟล์ออกเป็นหลายส่วน',
      'memory_limit': 'ลองแบ่งไฟล์ออกเป็นไฟล์เล็ก ๆ หรือลดข้อมูลที่ไม่จำเป็น',
      'heap_overflow': 'ข้อมูลในไฟล์มากเกินไป กรุณาลดจำนวนแถวลง'
    }
  },

  [ERROR_CATEGORIES.VALIDATION]: {
    title: 'ข้อมูลไม่ถูกต้อง',
    messages: {
      'missing_required_fields': 'ขาดข้อมูลที่จำเป็น',
      'invalid_data_type': 'ชนิดข้อมูลไม่ถูกต้อง',
      'invalid_date_format': 'รูปแบบวันที่ไม่ถูกต้อง',
      'invalid_number_format': 'รูปแบบตัวเลขไม่ถูกต้อง'
    },
    suggestions: {
      'missing_required_fields': 'ตรวจสอบให้แน่ใจว่าไฟล์มีคอลัมน์ที่จำเป็นครบถ้วน',
      'invalid_data_type': 'ตรวจสอบรูปแบบข้อมูลในแต่ละคอลัมน์ให้ถูกต้อง',
      'invalid_date_format': 'รูปแบบวันที่ควรเป็น YYYY-MM-DD หรือ DD/MM/YYYY',
      'invalid_number_format': 'ตัวเลขควรไม่มีตัวอักษรปนอยู่'
    }
  },

  [ERROR_CATEGORIES.AUTHENTICATION]: {
    title: 'ปัญหาการยืนยันตัวตน',
    messages: {
      'unauthorized': 'ไม่มีสิทธิ์เข้าถึง',
      'token_expired': 'หมดอายุการใช้งาน',
      'invalid_credentials': 'ข้อมูลการเข้าสู่ระบบไม่ถูกต้อง'
    },
    suggestions: {
      'unauthorized': 'กรุณาเข้าสู่ระบบใหม่',
      'token_expired': 'กรุณาเข้าสู่ระบบใหม่',
      'invalid_credentials': 'ตรวจสอบข้อมูลการเข้าสู่ระบบและลองใหม่'
    }
  },

  [ERROR_CATEGORIES.RATE_LIMIT]: {
    title: 'เกินขีดจำกัดการใช้งาน',
    messages: {
      'too_many_requests': 'มีการใช้งานมากเกินไป',
      'upload_limit_exceeded': 'อัปโหลดไฟล์เกินจำนวนที่อนุญาต'
    },
    suggestions: {
      'too_many_requests': 'กรุณารอสักครู่แล้วลองใหม่',
      'upload_limit_exceeded': 'กรุณารอให้การประมวลผลเสร็จสิ้นก่อนอัปโหลดไฟล์ใหม่'
    }
  },

  [ERROR_CATEGORIES.TIMEOUT]: {
    title: 'หมดเวลาการประมวลผล',
    messages: {
      'processing_timeout': 'การประมวลผลใช้เวลานานเกินไป',
      'upload_timeout': 'การอัปโหลดหมดเวลา'
    },
    suggestions: {
      'processing_timeout': 'ไฟล์มีขนาดใหญ่ กรุณาแบ่งไฟล์หรือลองใหม่ในภายหลัง',
      'upload_timeout': 'ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและลองอัปโหลดใหม่'
    }
  }
}

/**
 * Error formatter class
 */
export class ErrorFormatter {
  constructor(options = {}) {
    this.includeStackTrace = options.includeStackTrace || false
    this.includeOriginalError = options.includeOriginalError || false
    this.language = options.language || 'th'
  }

  /**
   * Format error with user-friendly message
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context
   * @returns {Object} Formatted error object
   */
  formatError(error, context = {}) {
    const errorInfo = this.analyzeError(error, context)
    const category = this.categorizeError(error, context)
    const severity = this.determineSeverity(error, context)
    
    return {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      category,
      severity,
      title: ERROR_MESSAGES[category]?.title || 'เกิดข้อผิดพลาด',
      message: this.getUserFriendlyMessage(error, category, context),
      suggestion: this.getSuggestion(error, category, context),
      technicalDetails: this.getTechnicalDetails(error, context),
      retryable: this.isRetryable(error, category),
      errorCode: errorInfo.code,
      originalMessage: this.includeOriginalError ? error.message : undefined,
      stackTrace: this.includeStackTrace ? error.stack : undefined,
      context: this.sanitizeContext(context)
    }
  }

  /**
   * Analyze error to extract key information
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context
   * @returns {Object} Error analysis
   * @private
   */
  analyzeError(error, context) {
    const message = typeof error === 'string' ? error : error.message || ''
    const lowerMessage = message.toLowerCase()
    
    // Extract error code if present
    let code = null
    const codeMatch = message.match(/error code:?\s*(\w+)/i)
    if (codeMatch) {
      code = codeMatch[1]
    }
    
    return {
      message,
      lowerMessage,
      code,
      hasStack: error.stack !== undefined,
      isSystemError: error.errno !== undefined
    }
  }

  /**
   * Categorize error by type
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context
   * @returns {string} Error category
   * @private
   */
  categorizeError(error, context) {
    const message = typeof error === 'string' ? error : error.message || ''
    const lowerMessage = message.toLowerCase()
    
    // File processing errors
    if (lowerMessage.includes('csv') || 
        lowerMessage.includes('parse') ||
        lowerMessage.includes('malformed') ||
        lowerMessage.includes('invalid format') ||
        lowerMessage.includes('encoding') ||
        lowerMessage.includes('column')) {
      return ERROR_CATEGORIES.FILE_PROCESSING
    }
    
    // Network errors
    if (lowerMessage.includes('network') ||
        lowerMessage.includes('connection') ||
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('econnreset') ||
        lowerMessage.includes('enotfound') ||
        lowerMessage.includes('fetch')) {
      return ERROR_CATEGORIES.NETWORK
    }
    
    // Database errors
    if (lowerMessage.includes('database') ||
        lowerMessage.includes('postgresql') ||
        lowerMessage.includes('query') ||
        lowerMessage.includes('transaction') ||
        lowerMessage.includes('constraint')) {
      return ERROR_CATEGORIES.DATABASE
    }
    
    // Memory errors
    if (lowerMessage.includes('memory') ||
        lowerMessage.includes('heap') ||
        lowerMessage.includes('out of memory') ||
        lowerMessage.includes('allocation failed')) {
      return ERROR_CATEGORIES.MEMORY
    }
    
    // Validation errors
    if (lowerMessage.includes('validation') ||
        lowerMessage.includes('invalid') ||
        lowerMessage.includes('required') ||
        lowerMessage.includes('missing') ||
        context.validationError) {
      return ERROR_CATEGORIES.VALIDATION
    }
    
    // Authentication errors
    if (lowerMessage.includes('unauthorized') ||
        lowerMessage.includes('authentication') ||
        lowerMessage.includes('token') ||
        lowerMessage.includes('credential')) {
      return ERROR_CATEGORIES.AUTHENTICATION
    }
    
    // Permission errors
    if (lowerMessage.includes('permission') ||
        lowerMessage.includes('forbidden') ||
        lowerMessage.includes('access denied')) {
      return ERROR_CATEGORIES.PERMISSION
    }
    
    // Rate limit errors
    if (lowerMessage.includes('rate limit') ||
        lowerMessage.includes('too many requests') ||
        lowerMessage.includes('quota exceeded')) {
      return ERROR_CATEGORIES.RATE_LIMIT
    }
    
    // Timeout errors
    if (lowerMessage.includes('timeout') ||
        lowerMessage.includes('timed out')) {
      return ERROR_CATEGORIES.TIMEOUT
    }
    
    return ERROR_CATEGORIES.UNKNOWN
  }

  /**
   * Determine error severity
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context
   * @returns {string} Error severity
   * @private
   */
  determineSeverity(error, context) {
    const message = typeof error === 'string' ? error : error.message || ''
    const lowerMessage = message.toLowerCase()
    
    // Critical errors
    if (lowerMessage.includes('critical') ||
        lowerMessage.includes('fatal') ||
        lowerMessage.includes('system error') ||
        lowerMessage.includes('out of memory')) {
      return ERROR_SEVERITY.CRITICAL
    }
    
    // High severity errors
    if (lowerMessage.includes('database') ||
        lowerMessage.includes('authentication') ||
        lowerMessage.includes('permission') ||
        context.jobId) { // Job processing errors are high priority
      return ERROR_SEVERITY.HIGH
    }
    
    // Medium severity errors
    if (lowerMessage.includes('validation') ||
        lowerMessage.includes('network') ||
        lowerMessage.includes('timeout')) {
      return ERROR_SEVERITY.MEDIUM
    }
    
    // Default to low severity
    return ERROR_SEVERITY.LOW
  }

  /**
   * Get user-friendly message
   * @param {Error|string} error - Error object or message
   * @param {string} category - Error category
   * @param {Object} context - Additional context
   * @returns {string} User-friendly message
   * @private
   */
  getUserFriendlyMessage(error, category, context) {
    const message = typeof error === 'string' ? error : error.message || ''
    const lowerMessage = message.toLowerCase()
    const categoryMessages = ERROR_MESSAGES[category]?.messages || {}
    
    // Try to match specific error patterns
    for (const [pattern, friendlyMessage] of Object.entries(categoryMessages)) {
      if (lowerMessage.includes(pattern.replace('_', ' '))) {
        return friendlyMessage
      }
    }
    
    // Special handling for specific error types
    if (category === ERROR_CATEGORIES.FILE_PROCESSING) {
      if (lowerMessage.includes('empty')) return categoryMessages.empty_file
      if (lowerMessage.includes('size') || lowerMessage.includes('large')) return categoryMessages.file_too_large
      if (lowerMessage.includes('csv')) return categoryMessages.malformed_csv
      return categoryMessages.invalid_format || 'ไฟล์มีปัญหา กรุณาตรวจสอบและลองใหม่'
    }
    
    // Default message for category
    return ERROR_MESSAGES[category]?.title || 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง'
  }

  /**
   * Get suggestion for error resolution
   * @param {Error|string} error - Error object or message
   * @param {string} category - Error category
   * @param {Object} context - Additional context
   * @returns {string} Suggestion message
   * @private
   */
  getSuggestion(error, category, context) {
    const message = typeof error === 'string' ? error : error.message || ''
    const lowerMessage = message.toLowerCase()
    const categorySuggestions = ERROR_MESSAGES[category]?.suggestions || {}
    
    // Try to match specific error patterns
    for (const [pattern, suggestion] of Object.entries(categorySuggestions)) {
      if (lowerMessage.includes(pattern.replace('_', ' '))) {
        return suggestion
      }
    }
    
    // Default suggestions by category
    const defaultSuggestions = {
      [ERROR_CATEGORIES.FILE_PROCESSING]: 'ตรวจสอบรูปแบบไฟล์ CSV และลองอัปโหลดใหม่',
      [ERROR_CATEGORIES.NETWORK]: 'ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและลองใหม่',
      [ERROR_CATEGORIES.DATABASE]: 'ระบบอาจไม่พร้อมใช้งาน กรุณาลองใหม่ในภายหลัง',
      [ERROR_CATEGORIES.MEMORY]: 'ลองใช้ไฟล์ที่มีขนาดเล็กกว่า',
      [ERROR_CATEGORIES.VALIDATION]: 'ตรวจสอบข้อมูลในไฟล์ให้ถูกต้องครบถ้วน',
      [ERROR_CATEGORIES.AUTHENTICATION]: 'กรุณาเข้าสู่ระบบใหม่',
      [ERROR_CATEGORIES.RATE_LIMIT]: 'กรุณารอสักครู่แล้วลองใหม่',
      [ERROR_CATEGORIES.TIMEOUT]: 'กรุณาลองใหม่ หรือใช้ไฟล์ที่เล็กกว่า'
    }
    
    return defaultSuggestions[category] || 'กรุณาลองใหม่อีกครั้ง หากปัญหายังคงมีอยู่ กรุณาติดต่อฝ่ายสนับสนุน'
  }

  /**
   * Get technical details for debugging
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context
   * @returns {Object} Technical details
   * @private
   */
  getTechnicalDetails(error, context) {
    const details = {
      errorType: error.constructor?.name || 'Error',
      timestamp: new Date().toISOString(),
      workerId: process.env.WORKER_ID || process.pid
    }
    
    if (error.code) details.errorCode = error.code
    if (error.errno) details.errno = error.errno
    if (error.syscall) details.syscall = error.syscall
    if (context.jobId) details.jobId = context.jobId
    if (context.filename) details.filename = context.filename
    if (context.lineNumber) details.lineNumber = context.lineNumber
    
    return details
  }

  /**
   * Check if error is retryable
   * @param {Error|string} error - Error object or message
   * @param {string} category - Error category
   * @returns {boolean} Whether error is retryable
   * @private
   */
  isRetryable(error, category) {
    const retryableCategories = [
      ERROR_CATEGORIES.NETWORK,
      ERROR_CATEGORIES.DATABASE,
      ERROR_CATEGORIES.TIMEOUT,
      ERROR_CATEGORIES.MEMORY
    ]
    
    const nonRetryableCategories = [
      ERROR_CATEGORIES.AUTHENTICATION,
      ERROR_CATEGORIES.PERMISSION,
      ERROR_CATEGORIES.VALIDATION
    ]
    
    if (nonRetryableCategories.includes(category)) {
      return false
    }
    
    if (retryableCategories.includes(category)) {
      return true
    }
    
    // Check specific error patterns
    const message = typeof error === 'string' ? error : error.message || ''
    const lowerMessage = message.toLowerCase()
    
    return !lowerMessage.includes('malformed') && 
           !lowerMessage.includes('invalid format') &&
           !lowerMessage.includes('permission')
  }

  /**
   * Sanitize context to remove sensitive information
   * @param {Object} context - Context object
   * @returns {Object} Sanitized context
   * @private
   */
  sanitizeContext(context) {
    const sanitized = { ...context }
    
    // Remove sensitive fields
    delete sanitized.password
    delete sanitized.token
    delete sanitized.apiKey
    delete sanitized.secret
    
    // Truncate large fields
    if (sanitized.data && typeof sanitized.data === 'string' && sanitized.data.length > 1000) {
      sanitized.data = sanitized.data.substring(0, 1000) + '...'
    }
    
    return sanitized
  }

  /**
   * Generate unique error ID
   * @returns {string} Unique error ID
   * @private
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  }
}

/**
 * Factory function to create error formatter
 * @param {Object} options - Configuration options
 * @returns {ErrorFormatter} New error formatter instance
 */
export function createErrorFormatter(options = {}) {
  return new ErrorFormatter(options)
}

/**
 * Quick format function for simple error formatting
 * @param {Error|string} error - Error object or message
 * @param {Object} context - Additional context
 * @returns {Object} Formatted error
 */
export function formatError(error, context = {}) {
  const formatter = new ErrorFormatter()
  return formatter.formatError(error, context)
}

/**
 * Format error for user display (simplified)
 * @param {Error|string} error - Error object or message
 * @param {Object} context - Additional context
 * @returns {Object} User-friendly error
 */
export function formatUserError(error, context = {}) {
  const formatted = formatError(error, context)
  
  return {
    title: formatted.title,
    message: formatted.message,
    suggestion: formatted.suggestion,
    retryable: formatted.retryable,
    errorId: formatted.id
  }
}

/**
 * Format error for logging (with technical details)
 * @param {Error|string} error - Error object or message
 * @param {Object} context - Additional context
 * @returns {Object} Technical error details
 */
export function formatLogError(error, context = {}) {
  const formatter = new ErrorFormatter({ 
    includeStackTrace: true, 
    includeOriginalError: true 
  })
  
  return formatter.formatError(error, context)
}