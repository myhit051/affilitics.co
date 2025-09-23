/**
 * Simple rate limiting utility for API endpoints
 */

import { NextRequest } from 'next/server'

interface RateLimitOptions {
  windowMs: number
  maxRequests: number
  keyGenerator?: (req: NextRequest) => string
}

interface RateLimitResult {
  success: boolean
  retryAfter?: number
  remaining?: number
}

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export async function rateLimit(
  request: NextRequest,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { windowMs, maxRequests, keyGenerator } = options
  
  // Generate key for rate limiting
  const key = keyGenerator ? keyGenerator(request) : getDefaultKey(request)
  
  const now = Date.now()
  const resetTime = now + windowMs
  
  // Get or create rate limit entry
  const entry = rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs }
  
  // Reset if window has expired
  if (now > entry.resetTime) {
    entry.count = 0
    entry.resetTime = resetTime
  }
  
  entry.count++
  rateLimitStore.set(key, entry)
  
  // Clean up expired entries periodically
  if (Math.random() < 0.01) { // 1% chance
    cleanupExpiredEntries()
  }
  
  if (entry.count > maxRequests) {
    return {
      success: false,
      retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      remaining: 0
    }
  }
  
  return {
    success: true,
    remaining: Math.max(0, maxRequests - entry.count)
  }
}

function getDefaultKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 
            request.headers.get('x-real-ip') || 
            'unknown'
  return ip
}

function cleanupExpiredEntries(): void {
  const now = Date.now()
  for (const [key, entry] of Array.from(rateLimitStore.entries())) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}