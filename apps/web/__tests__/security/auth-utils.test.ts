/**
 * Security Testing for Authentication Utilities
 * Tests JWT validation, rate limiting, and authentication security fixes
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import {
  validateJWTToken,
  checkRateLimit,
  AuthSecurityError,
  sanitizeAuthInput,
  validateEmail,
  validatePassword,
  requireRole
} from '@/lib/auth/utils'

// Mock environment variables
const mockJWTSecret = 'test-secret-key-for-testing-only'
process.env.SUPABASE_JWT_SECRET = mockJWTSecret

describe('JWT Security Validation', () => {
  const validPayload = {
    sub: 'user-123',
    email: 'test@example.com',
    aud: ['authenticated'],
    role: 'user',
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iss: 'supabase'
  }

  it('should validate a properly signed JWT token', () => {
    const token = jwt.sign(validPayload, mockJWTSecret, { algorithm: 'HS256' })
    
    const result = validateJWTToken(token)
    
    expect(result).toMatchObject({
      id: 'user-123',
      email: 'test@example.com',
      role: 'user',
      aud: ['authenticated']
    })
  })

  it('should reject tampered JWT tokens', () => {
    const token = jwt.sign(validPayload, mockJWTSecret, { algorithm: 'HS256' })
    const tamperedToken = token.slice(0, -10) + 'tampered123'
    
    expect(() => validateJWTToken(tamperedToken)).toThrow(AuthSecurityError)
    expect(() => validateJWTToken(tamperedToken)).toThrow('Invalid token signature')
  })

  it('should reject tokens signed with wrong secret', () => {
    const token = jwt.sign(validPayload, 'wrong-secret', { algorithm: 'HS256' })
    
    expect(() => validateJWTToken(token)).toThrow(AuthSecurityError)
    expect(() => validateJWTToken(token)).toThrow('Invalid token signature')
  })

  it('should reject expired tokens', () => {
    const expiredPayload = {
      ...validPayload,
      exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
    }
    const token = jwt.sign(expiredPayload, mockJWTSecret, { algorithm: 'HS256' })
    
    expect(() => validateJWTToken(token)).toThrow(AuthSecurityError)
    expect(() => validateJWTToken(token)).toThrow('Token expired')
  })

  it('should reject tokens with missing required claims', () => {
    const invalidPayload = {
      sub: 'user-123',
      // Missing email and aud
      exp: Math.floor(Date.now() / 1000) + 3600
    }
    const token = jwt.sign(invalidPayload, mockJWTSecret, { algorithm: 'HS256' })
    
    expect(() => validateJWTToken(token)).toThrow(AuthSecurityError)
    expect(() => validateJWTToken(token)).toThrow('Missing required token claims')
  })

  it('should reject tokens with invalid audience', () => {
    const invalidAudPayload = {
      ...validPayload,
      aud: ['unauthenticated'] // Wrong audience
    }
    const token = jwt.sign(invalidAudPayload, mockJWTSecret, { algorithm: 'HS256' })
    
    expect(() => validateJWTToken(token)).toThrow(AuthSecurityError)
    expect(() => validateJWTToken(token)).toThrow('Invalid token audience')
  })

  it('should throw error when JWT secret is not configured', () => {
    delete process.env.SUPABASE_JWT_SECRET
    delete process.env.NEXTAUTH_SECRET
    
    const token = jwt.sign(validPayload, mockJWTSecret, { algorithm: 'HS256' })
    
    expect(() => validateJWTToken(token)).toThrow(AuthSecurityError)
    expect(() => validateJWTToken(token)).toThrow('JWT secret not configured')
    
    // Restore for other tests
    process.env.SUPABASE_JWT_SECRET = mockJWTSecret
  })
})

describe('Rate Limiting Security', () => {
  beforeEach(() => {
    // Clear rate limiting cache before each test
    vi.clearAllMocks()
  })

  it('should allow requests within rate limit', () => {
    expect(() => checkRateLimit('test-ip', 5, 60000)).not.toThrow()
    expect(() => checkRateLimit('test-ip', 5, 60000)).not.toThrow()
    expect(() => checkRateLimit('test-ip', 5, 60000)).not.toThrow()
  })

  it('should block requests exceeding rate limit', () => {
    const identifier = 'blocked-ip'
    
    // Make 5 attempts (should be allowed)
    for (let i = 0; i < 5; i++) {
      expect(() => checkRateLimit(identifier, 5, 60000)).not.toThrow()
    }
    
    // 6th attempt should be blocked
    expect(() => checkRateLimit(identifier, 5, 60000)).toThrow(AuthSecurityError)
    expect(() => checkRateLimit(identifier, 5, 60000)).toThrow('Too many authentication attempts')
  })

  it('should reset rate limit after time window', () => {
    vi.useFakeTimers()
    const identifier = 'reset-test-ip'
    
    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      checkRateLimit(identifier, 5, 60000)
    }
    
    // Should be blocked
    expect(() => checkRateLimit(identifier, 5, 60000)).toThrow()
    
    // Fast forward past window
    vi.advanceTimersByTime(61000)
    
    // Should be allowed again
    expect(() => checkRateLimit(identifier, 5, 60000)).not.toThrow()
    
    vi.useRealTimers()
  })
})

describe('Input Sanitization and Validation', () => {
  describe('sanitizeAuthInput', () => {
    it('should sanitize XSS attempts', () => {
      const maliciousInput = '<script>alert("xss")</script>test@example.com'
      const sanitized = sanitizeAuthInput(maliciousInput)
      
      expect(sanitized).not.toContain('<script>')
      expect(sanitized).not.toContain('>')
      expect(sanitized).toBe('scriptalert(xss)/scripttest@example.com')
    })

    it('should trim whitespace and limit length', () => {
      const longInput = '  ' + 'a'.repeat(300) + '  '
      const sanitized = sanitizeAuthInput(longInput)
      
      expect(sanitized.length).toBeLessThanOrEqual(255)
      expect(sanitized).not.toMatch(/^\s|\s$/)
    })

    it('should throw error for non-string input', () => {
      expect(() => sanitizeAuthInput(123 as any)).toThrow(AuthSecurityError)
      expect(() => sanitizeAuthInput(null as any)).toThrow(AuthSecurityError)
    })
  })

  describe('validateEmail', () => {
    it('should validate legitimate email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@domain.org',
        'user123@test-domain.net'
      ]
      
      validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true)
      })
    })

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user..name@domain.com',
        'user@domain',
        'a'.repeat(250) + '@domain.com' // Too long
      ]
      
      invalidEmails.forEach(email => {
        expect(validateEmail(email)).toBe(false)
      })
    })
  })

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      const strongPassword = 'MyStr0ng!P@ssw0rd123'
      const result = validatePassword(strongPassword)
      
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject weak passwords', () => {
      const testCases = [
        { password: 'short', expectedError: 'at least 12 characters' },
        { password: 'nouppercase123!', expectedError: 'uppercase letter' },
        { password: 'NOLOWERCASE123!', expectedError: 'lowercase letter' },
        { password: 'NoNumbers!', expectedError: 'number' },
        { password: 'NoSpecialChars123', expectedError: 'special character' },
        { password: 'password123!', expectedError: 'common weak patterns' }
      ]
      
      testCases.forEach(({ password, expectedError }) => {
        const result = validatePassword(password)
        expect(result.isValid).toBe(false)
        expect(result.errors.some(error => error.includes(expectedError))).toBe(true)
      })
    })
  })
})

describe('Role-Based Access Control', () => {
  it('should allow access for users with required role', () => {
    expect(() => requireRole('admin', ['admin', 'moderator'])).not.toThrow()
    expect(() => requireRole('moderator', ['admin', 'moderator'])).not.toThrow()
  })

  it('should deny access for users without required role', () => {
    expect(() => requireRole('user', ['admin', 'moderator'])).toThrow(AuthSecurityError)
    expect(() => requireRole('guest', ['admin'])).toThrow(AuthSecurityError)
  })

  it('should provide informative error messages', () => {
    try {
      requireRole('user', ['admin', 'moderator'])
    } catch (error) {
      expect(error).toBeInstanceOf(AuthSecurityError)
      expect((error as AuthSecurityError).message).toContain('Required: admin or moderator')
      expect((error as AuthSecurityError).statusCode).toBe(403)
    }
  })
})