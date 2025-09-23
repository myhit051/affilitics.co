import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createCSRFToken, checkCSRFRateLimit, logCSRFEvent } from '@/lib/security/csrf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Security: CSRF Token Generation Endpoint
 * 
 * Provides secure CSRF tokens to authenticated clients for state-changing operations.
 * Uses HMAC-based tokens tied to user sessions with configurable expiration.
 * 
 * Security measures:
 * - Requires authentication
 * - Tokens are session-bound and time-limited
 * - Uses cryptographically secure token generation
 * - Implements proper origin validation
 * - Includes comprehensive security logging
 */
export async function GET(req: NextRequest) {
  try {
    // Security: Verify origin for additional protection
    const origin = req.headers.get('origin') || ''
    const appOrigin = process.env.APP_ORIGIN
    if (appOrigin && origin && !origin.startsWith(appOrigin)) {
      console.warn('CSRF token request from unauthorized origin:', origin)
      return NextResponse.json(
        { error: 'Origin not allowed' }, 
        { status: 403 }
      )
    }

    // Security: Get authenticated user context
    const { user } = await getAuthContext()
    
    if (!user?.id) {
      logCSRFEvent('TOKEN_REQUEST_UNAUTHENTICATED', {
        origin: origin || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown'
      })
      return NextResponse.json(
        { error: 'Authentication required' }, 
        { status: 401 }
      )
    }

    // Security: Check rate limiting
    if (!checkCSRFRateLimit(user.id)) {
      logCSRFEvent('TOKEN_REQUEST_RATE_LIMITED', {
        userId: user.id,
        origin: origin || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown'
      })
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          details: 'Too many CSRF token requests. Please try again later.'
        }, 
        { status: 429 }
      )
    }

    // Security: Generate session-bound CSRF token
    const sessionId = user.id
    const csrfToken = createCSRFToken(sessionId)
    
    // Security: Get token expiration from environment or use secure default
    const tokenExpiry = parseInt(process.env.CSRF_TOKEN_EXPIRY || '3600000') // 1 hour default
    const expiresAt = new Date(Date.now() + tokenExpiry)
    
    // Security: Log token generation for audit trail
    logCSRFEvent('TOKEN_GENERATED', {
      userId: user.id,
      origin: origin || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown'
    })

    // Security: Set secure response headers
    const response = NextResponse.json({
      token: csrfToken,
      expiresAt: expiresAt.toISOString(),
      maxAge: tokenExpiry
    })

    // Security: Add security headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    
    return response

  } catch (error) {
    console.error('CSRF token generation error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    })
    
    if (error instanceof Response) {
      return error // Re-throw auth errors
    }

    return NextResponse.json(
      { error: 'Failed to generate CSRF token' }, 
      { status: 500 }
    )
  }
}

/**
 * Security: Handle preflight OPTIONS requests
 */
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || ''
  const appOrigin = process.env.APP_ORIGIN
  
  // Only allow CORS for the configured app origin
  if (!appOrigin || !origin.startsWith(appOrigin)) {
    return new NextResponse(null, { status: 403 })
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  })
}