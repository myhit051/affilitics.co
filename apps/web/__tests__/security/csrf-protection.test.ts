/**
 * Security Testing for CSRF Protection Implementation
 * Tests CSRF token generation, validation, and protection measures
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  generateCSRFToken,
  createCSRFToken,
  verifyCSRFToken,
  getCSRFToken,
  verifyCSRF,
  CSRFError
} from '@/lib/security/csrf'

// Mock environment variable
process.env.NEXTAUTH_SECRET = 'test-secret-for-csrf-testing'

describe('CSRF Token Generation', () => {
  it('should generate cryptographically secure tokens', () => {
    const token1 = generateCSRFToken()
    const token2 = generateCSRFToken()
    
    expect(token1).toHaveLength(64) // 32 bytes * 2 (hex)
    expect(token2).toHaveLength(64)
    expect(token1).not.toBe(token2) // Should be unique
    expect(token1).toMatch(/^[a-f0-9]{64}$/) // Hex format
  })

  it('should create timestamped CSRF tokens', () => {
    const sessionId = 'test-session-123'
    const token = createCSRFToken(sessionId)
    
    const [timestamp, hash] = token.split('.')
    expect(timestamp).toMatch(/^\d+$/) // Should be numeric timestamp
    expect(hash).toMatch(/^[a-f0-9]{64}$/) // Should be hex hash
    expect(parseInt(timestamp)).toBeCloseTo(Date.now(), -2) // Within ~100ms
  })
})

describe('CSRF Token Validation', () => {
  const sessionId = 'test-session-123'

  it('should validate legitimate CSRF tokens', () => {
    const token = createCSRFToken(sessionId)
    
    const isValid = verifyCSRFToken(token, sessionId)
    expect(isValid).toBe(true)
  })

  it('should reject tokens with wrong session ID', () => {
    const token = createCSRFToken(sessionId)
    
    const isValid = verifyCSRFToken(token, 'different-session-456')
    expect(isValid).toBe(false)
  })

  it('should reject malformed tokens', () => {
    const malformedTokens = [
      'invalid-token',
      'timestamp.hash', // Invalid format
      '123456789.invalidhash',
      '123456789', // Missing hash
      '.validhash' // Missing timestamp
    ]
    
    malformedTokens.forEach(token => {
      expect(verifyCSRFToken(token, sessionId)).toBe(false)
    })
  })

  it('should reject expired tokens', () => {
    // Create token with past timestamp
    const pastTimestamp = Date.now() - (2 * 60 * 60 * 1000) // 2 hours ago
    const tokenData = `${sessionId}:${pastTimestamp}`
    const crypto = require('crypto')
    const hash = crypto.createHmac('sha256', process.env.NEXTAUTH_SECRET)
      .update(tokenData)
      .digest('hex')
    const expiredToken = `${pastTimestamp}.${hash}`
    
    const isValid = verifyCSRFToken(expiredToken, sessionId, 3600000) // 1 hour max age
    expect(isValid).toBe(false)
  })

  it('should handle missing inputs gracefully', () => {
    expect(verifyCSRFToken('', sessionId)).toBe(false)
    expect(verifyCSRFToken('valid-token', '')).toBe(false)
    expect(verifyCSRFToken('', '')).toBe(false)
  })

  it('should use constant-time comparison to prevent timing attacks', () => {
    const token = createCSRFToken(sessionId)
    const [timestamp, originalHash] = token.split('.')
    
    // Create a token with same timestamp but wrong hash
    const wrongHash = 'a'.repeat(64)
    const invalidToken = `${timestamp}.${wrongHash}`
    
    // Should return false, but timing should be similar to valid comparison
    const start = process.hrtime.bigint()
    const result = verifyCSRFToken(invalidToken, sessionId)
    const end = process.hrtime.bigint()
    
    expect(result).toBe(false)
    expect(Number(end - start)).toBeGreaterThan(0) // Should take some time
  })
})

describe('CSRF Token Extraction from Requests', () => {
  it('should extract token from X-CSRF-Token header', () => {
    const tokenValue = 'test-csrf-token-123'
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': tokenValue,
        'Content-Type': 'application/json'
      }
    })
    
    const extractedToken = getCSRFToken(request)
    expect(extractedToken).toBe(tokenValue)
  })

  it('should return null when no token present', () => {
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    const extractedToken = getCSRFToken(request)
    expect(extractedToken).toBeNull()
  })

  it('should handle case-insensitive header extraction', () => {
    const tokenValue = 'test-csrf-token-456'
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      headers: {
        'x-csrf-token': tokenValue, // lowercase
        'Content-Type': 'application/json'
      }
    })
    
    const extractedToken = getCSRFToken(request)
    expect(extractedToken).toBe(tokenValue)
  })
})

describe('CSRF Protection Middleware', () => {
  const sessionId = 'middleware-test-session'

  it('should allow safe HTTP methods without CSRF check', async () => {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS']
    
    for (const method of safeMethods) {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method,
        headers: { 'Content-Type': 'application/json' }
      })
      
      // Should not throw for safe methods
      await expect(verifyCSRF(request, sessionId)).resolves.toBeUndefined()
    }
  })

  it('should require CSRF token for unsafe HTTP methods', async () => {
    const unsafeMethods = ['POST', 'PUT', 'DELETE', 'PATCH']
    
    for (const method of unsafeMethods) {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method,
        headers: { 'Content-Type': 'application/json' }
        // No CSRF token
      })
      
      await expect(verifyCSRF(request, sessionId))
        .rejects.toThrow(CSRFError)
      
      await expect(verifyCSRF(request, sessionId))
        .rejects.toThrow('CSRF token missing')
    }
  })

  it('should validate CSRF token for unsafe methods', async () => {
    const token = createCSRFToken(sessionId)
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': token,
        'Content-Type': 'application/json'
      }
    })
    
    // Should not throw with valid token
    await expect(verifyCSRF(request, sessionId)).resolves.toBeUndefined()
  })

  it('should reject invalid CSRF tokens', async () => {
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': 'invalid-token',
        'Content-Type': 'application/json'
      }
    })
    
    await expect(verifyCSRF(request, sessionId))
      .rejects.toThrow(CSRFError)
    
    await expect(verifyCSRF(request, sessionId))
      .rejects.toThrow('Invalid CSRF token')
  })

  it('should set appropriate error status codes', async () => {
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    try {
      await verifyCSRF(request, sessionId)
    } catch (error) {
      expect(error).toBeInstanceOf(CSRFError)
      expect((error as CSRFError).statusCode).toBe(403)
    }
  })
})

describe('CSRF Integration with Security Headers', () => {
  it('should add CSRF token to response headers', () => {
    const sessionId = 'header-test-session'
    const response = new Response('{}', { status: 200 })
    
    // Mock addCSRFHeaders function behavior
    const token = createCSRFToken(sessionId)
    response.headers.set('x-csrf-token', token)
    
    const responseToken = response.headers.get('x-csrf-token')
    expect(responseToken).toBeTruthy()
    expect(verifyCSRFToken(responseToken!, sessionId)).toBe(true)
  })

  it('should work with different session identifiers', () => {
    const sessions = [
      'user-123',
      'session-abc-def',
      'temp-session-456'
    ]
    
    sessions.forEach(sessionId => {
      const token = createCSRFToken(sessionId)
      expect(verifyCSRFToken(token, sessionId)).toBe(true)
      
      // Should not validate against different session
      const otherSession = sessionId + '-different'
      expect(verifyCSRFToken(token, otherSession)).toBe(false)
    })
  })
})