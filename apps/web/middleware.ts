import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/server'

// Security: Define protected routes and their access levels
const protectedRoutes = {
  // Public routes that don't require authentication
  public: [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify',
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/verify',
    '/api/auth/callback'
  ],
  
  // Routes that require authentication but no specific workspace
  authenticated: [
    '/workspaces',
    '/profile',
    '/api/profile'
  ],
  
  // Routes that require workspace access
  workspace: [
    '/workspace',
    '/api/workspace',
    '/api/import',
    '/api/metrics',
    '/api/analytics'
  ]
}

// Security: Rate limiting storage (in production, use Redis)
const requestCounts = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(ip: string, limit = 100, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now()
  const record = requestCounts.get(ip)
  
  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + windowMs })
    return true
  }
  
  if (record.count >= limit) {
    return false
  }
  
  record.count++
  return true
}

function getClientIP(request: NextRequest): string {
  // Security: Get real client IP, handling various proxy headers
  const xForwardedFor = request.headers.get('x-forwarded-for')
  const xRealIp = request.headers.get('x-real-ip')
  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim()
  }
  
  if (xRealIp) {
    return xRealIp
  }
  
  if (cfConnectingIp) {
    return cfConnectingIp
  }
  
  return request.ip || 'unknown'
}

function isPublicRoute(pathname: string): boolean {
  return protectedRoutes.public.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  )
}

function isAuthenticatedRoute(pathname: string): boolean {
  return protectedRoutes.authenticated.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )
}

function isWorkspaceRoute(pathname: string): boolean {
  return protectedRoutes.workspace.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )
}

function extractWorkspaceId(pathname: string): string | null {
  // Extract workspace ID from URL patterns like /workspace/[id]/...
  const match = pathname.match(/^\/workspace\/([a-f0-9\-]{36})/)
  return match ? match[1] : null
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const pathname = request.nextUrl.pathname
  const clientIP = getClientIP(request)

  try {
    // Security: Apply rate limiting
    if (!checkRateLimit(clientIP)) {
      return new Response('Too Many Requests', { 
        status: 429,
        headers: {
          'Retry-After': '900', // 15 minutes
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '0'
        }
      })
    }

    // Security: Add security headers to all responses
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    
    // Security: CSP header for additional protection
    const cspHeader = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Note: In production, remove unsafe-inline and unsafe-eval
      "style-src 'self' 'unsafe-inline'", // Note: In production, remove unsafe-inline
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'"
    ].join('; ')
    
    response.headers.set('Content-Security-Policy', cspHeader)

    // Security: Skip auth checks for public routes
    if (isPublicRoute(pathname)) {
      return response
    }

    // Create Supabase client for middleware
    const supabase = createMiddlewareClient(request, response)

    // Security: Get user session with proper error handling
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      // Security: Clear any potentially corrupted auth cookies
      response.cookies.delete('sb-access-token')
      response.cookies.delete('sb-refresh-token')
      
      // Redirect to login with callback URL
      const callbackUrl = encodeURIComponent(request.url)
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('callbackUrl', callbackUrl)
      
      return NextResponse.redirect(loginUrl)
    }

    // Handle authenticated routes (user is logged in but no workspace required)
    if (isAuthenticatedRoute(pathname)) {
      return response
    }

    // Handle workspace-specific routes
    if (isWorkspaceRoute(pathname)) {
      const workspaceId = extractWorkspaceId(pathname) || 
                         request.headers.get('x-workspace-id') ||
                         request.nextUrl.searchParams.get('workspaceId')

      if (!workspaceId) {
        // Security: No workspace ID provided, redirect to workspace selection
        return NextResponse.redirect(new URL('/workspaces', request.url))
      }

      // Security: Validate workspace ID format (UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(workspaceId)) {
        return NextResponse.redirect(new URL('/workspaces', request.url))
      }

      // Security: Check workspace membership using service client
      try {
        const { data: membership, error: membershipError } = await supabase
          .from('members')
          .select('id, role')
          .eq('user_id', user.id)
          .eq('workspace_id', workspaceId)
          .single()

        if (membershipError || !membership) {
          // Security: User doesn't have access to this workspace
          return NextResponse.redirect(new URL('/workspaces', request.url))
        }

        // Security: Add workspace context to request headers for downstream use
        response.headers.set('x-user-id', user.id)
        response.headers.set('x-workspace-id', workspaceId)
        response.headers.set('x-user-role', membership.role)

      } catch (error) {
        console.error('Workspace authorization error:', error)
        return NextResponse.redirect(new URL('/workspaces', request.url))
      }
    }

    // Security: For API routes, add additional security headers
    if (pathname.startsWith('/api/')) {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
      response.headers.set('Pragma', 'no-cache')
    }

    return response

  } catch (error) {
    console.error('Middleware error:', error)
    
    // Security: In case of any error, fail securely by redirecting to login
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}