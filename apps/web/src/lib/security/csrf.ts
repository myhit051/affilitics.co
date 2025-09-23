import crypto from 'crypto'
import { NextRequest } from 'next/server'

// Security: CSRF protection utility
class CSRFError extends Error {
  constructor(message: string, public statusCode: number = 403) {
    super(message)
    this.name = 'CSRFError'
  }
}

// Security: Rate limiting for CSRF token requests
interface RateLimitEntry {
  count: number
  resetTime: number
}

class CSRFRateLimit {
  private limits = new Map<string, RateLimitEntry>()
  private maxRequests: number
  private windowMs: number

  constructor() {
    this.maxRequests = parseInt(process.env.CSRF_RATE_LIMIT || '100')
    this.windowMs = 60 * 60 * 1000 // 1 hour
  }

  isAllowed(userId: string): boolean {
    const now = Date.now()
    const entry = this.limits.get(userId)

    if (!entry || now > entry.resetTime) {
      // Reset or create new entry
      this.limits.set(userId, {
        count: 1,
        resetTime: now + this.windowMs
      })
      return true
    }

    if (entry.count >= this.maxRequests) {
      return false
    }

    entry.count++
    return true
  }

  cleanup(): void {
    const now = Date.now()
    for (const [userId, entry] of Array.from(this.limits.entries())) {
      if (now > entry.resetTime) {
        this.limits.delete(userId)
      }
    }
  }
}

const csrfRateLimit = new CSRFRateLimit()

// Cleanup rate limit entries every 5 minutes
setInterval(() => csrfRateLimit.cleanup(), 5 * 60 * 1000)

// Security: Generate a cryptographically secure CSRF token
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Security: Create CSRF token with timestamp for expiration
export function createCSRFToken(sessionId: string): string {
  const timestamp = Date.now()
  const data = `${sessionId}:${timestamp}`
  const token = crypto.createHmac('sha256', process.env.NEXTAUTH_SECRET || 'default-secret')
    .update(data)
    .digest('hex')
  
  return `${timestamp}.${token}`
}

// Security: Verify CSRF token
export function verifyCSRFToken(token: string, sessionId: string, maxAge: number = 3600000): boolean {
  try {
    if (!token || !sessionId) {
      return false
    }

    const [timestampStr, tokenHash] = token.split('.')
    if (!timestampStr || !tokenHash) {
      return false
    }

    const timestamp = parseInt(timestampStr, 10)
    if (isNaN(timestamp)) {
      return false
    }

    // Security: Check token expiration
    const now = Date.now()
    if (now - timestamp > maxAge) {
      return false
    }

    // Security: Regenerate token and compare
    const data = `${sessionId}:${timestamp}`
    const expectedToken = crypto.createHmac('sha256', process.env.NEXTAUTH_SECRET || 'default-secret')
      .update(data)
      .digest('hex')

    // Security: Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(tokenHash, 'hex'),
      Buffer.from(expectedToken, 'hex')
    )
  } catch (error) {
    return false
  }
}

// Security: Extract CSRF token from request
export function getCSRFToken(request: NextRequest): string | null {
  // Check for token in header first (recommended)
  const headerToken = request.headers.get('x-csrf-token')
  if (headerToken) {
    return headerToken
  }

  // Fallback to form data for non-JSON requests
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    // This would require parsing form data, which is more complex
    // For now, we'll focus on header-based CSRF protection
  }

  return null
}

// Security: Middleware function to verify CSRF token
export async function verifyCSRF(request: NextRequest, sessionId: string): Promise<void> {
  // Security: Skip CSRF check for GET, HEAD, OPTIONS requests (safe methods)
  const method = request.method.toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return
  }

  const token = getCSRFToken(request)
  if (!token) {
    throw new CSRFError('CSRF token missing')
  }

  const isValid = verifyCSRFToken(token, sessionId)
  if (!isValid) {
    throw new CSRFError('Invalid CSRF token')
  }
}

// Security: Add CSRF token to response headers for client-side use
export function addCSRFHeaders(response: Response, sessionId: string): void {
  const token = createCSRFToken(sessionId)
  response.headers.set('x-csrf-token', token)
}

// Security: Check rate limiting for CSRF token requests
export function checkCSRFRateLimit(userId: string): boolean {
  return csrfRateLimit.isAllowed(userId)
}

// Security: Enhanced origin validation with additional checks
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin') || ''
  const referer = request.headers.get('referer') || ''
  const appOrigin = process.env.APP_ORIGIN

  if (!appOrigin) {
    console.warn('APP_ORIGIN not configured - CSRF protection weakened')
    return true // Allow if not configured, but log warning
  }

  // Check origin header
  if (origin && !origin.startsWith(appOrigin)) {
    return false
  }

  // Check referer header as additional validation
  if (referer && !referer.startsWith(appOrigin)) {
    return false
  }

  return true
}

// Security: Double-submit cookie pattern support
export function createCSRFCookie(sessionId: string): string {
  const token = createCSRFToken(sessionId)
  // Return a hash of the token for cookie storage
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Security: Validate double-submit pattern
export function validateDoubleSubmit(token: string, cookieValue: string): boolean {
  if (!token || !cookieValue) {
    return false
  }
  
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(cookieValue, 'hex'),
    Buffer.from(tokenHash, 'hex')
  )
}

// Security: Comprehensive CSRF logging
export function logCSRFEvent(event: string, details: Record<string, any>): void {
  if (process.env.CSRF_LOGGING_ENABLED !== 'true') {
    return
  }

  console.log('CSRF Security Event', {
    event,
    timestamp: new Date().toISOString(),
    ...details
  })
}

// Security: Enhanced CSRF middleware with additional protections
export async function verifyCSRFEnhanced(
  request: NextRequest, 
  sessionId: string,
  options: {
    enableDoubleSubmit?: boolean
    enableOriginValidation?: boolean
    enableRateLimit?: boolean
  } = {}
): Promise<void> {
  const {
    enableDoubleSubmit = false,
    enableOriginValidation = true,
    enableRateLimit = true
  } = options

  // Security: Skip CSRF check for safe methods
  const method = request.method.toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return
  }

  // Security: Origin validation
  if (enableOriginValidation && !validateOrigin(request)) {
    logCSRFEvent('ORIGIN_VALIDATION_FAILED', {
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
      userAgent: request.headers.get('user-agent'),
      method
    })
    throw new CSRFError('Invalid origin')
  }

  // Security: Rate limiting
  if (enableRateLimit && !checkCSRFRateLimit(sessionId)) {
    logCSRFEvent('RATE_LIMIT_EXCEEDED', {
      sessionId,
      method,
      userAgent: request.headers.get('user-agent')
    })
    throw new CSRFError('Rate limit exceeded', 429)
  }

  const token = getCSRFToken(request)
  if (!token) {
    logCSRFEvent('TOKEN_MISSING', {
      sessionId,
      method,
      contentType: request.headers.get('content-type')
    })
    throw new CSRFError('CSRF token missing')
  }

  const isValid = verifyCSRFToken(token, sessionId)
  if (!isValid) {
    logCSRFEvent('TOKEN_INVALID', {
      sessionId,
      method,
      tokenLength: token.length,
      userAgent: request.headers.get('user-agent')
    })
    throw new CSRFError('Invalid CSRF token')
  }

  // Security: Double-submit validation if enabled
  if (enableDoubleSubmit) {
    const cookieValue = request.cookies.get('csrf-token')?.value
    if (!cookieValue || !validateDoubleSubmit(token, cookieValue)) {
      logCSRFEvent('DOUBLE_SUBMIT_FAILED', {
        sessionId,
        method,
        hasCookie: !!cookieValue
      })
      throw new CSRFError('Double-submit validation failed')
    }
  }

  logCSRFEvent('TOKEN_VALIDATED', {
    sessionId,
    method,
    success: true
  })
}

export { CSRFError, csrfRateLimit }