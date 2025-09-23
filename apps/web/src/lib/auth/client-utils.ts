// Client-side auth utilities that don't depend on server-only APIs
import jwt from 'jsonwebtoken'

export class AuthSecurityError extends Error {
  constructor(message: string, public code: string, public statusCode: number = 401) {
    super(message)
    this.name = 'AuthSecurityError'
  }
}

// Security: Rate limiting storage (in production, use Redis)
const authAttempts = new Map<string, { count: number; lastAttempt: number }>()

// Security: Rate limiting for authentication attempts
export function checkRateLimit(identifier: string, maxAttempts = 5, windowMs = 15 * 60 * 1000): void {
  const now = Date.now()
  const attempts = authAttempts.get(identifier) || { count: 0, lastAttempt: now }

  // Reset attempts if window has passed
  if (now - attempts.lastAttempt > windowMs) {
    attempts.count = 0
    attempts.lastAttempt = now
  }

  if (attempts.count >= maxAttempts) {
    const timeLeft = Math.ceil((windowMs - (now - attempts.lastAttempt)) / 1000 / 60)
    throw new AuthSecurityError(
      `Too many authentication attempts. Try again in ${timeLeft} minutes.`,
      'RATE_LIMITED',
      429
    )
  }

  attempts.count++
  attempts.lastAttempt = now
  authAttempts.set(identifier, attempts)
}

// Security: Input sanitization for auth-related inputs
export function sanitizeAuthInput(input: string): string {
  if (typeof input !== 'string') {
    throw new AuthSecurityError('Invalid input type', 'INVALID_INPUT', 400)
  }

  // Remove potentially harmful characters
  return input
    .trim()
    .replace(/[<>'"&]/g, '') // Basic XSS protection
    .slice(0, 255) // Limit length
}

// Security: Validate email format with strict regex
export function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  return emailRegex.test(email) && email.length <= 254
}

// Security: Validate password strength
export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long')
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character')
  }

  // Security: Check for common weak passwords
  const commonPasswords = ['password', '123456', 'password123', 'admin', 'qwerty']
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    errors.push('Password contains common weak patterns')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}