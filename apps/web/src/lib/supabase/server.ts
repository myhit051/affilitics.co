import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { Database } from './types'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Security: Don't persist session on server
        persistSession: false,
        // Security: Don't detect session from URL on server  
        detectSessionInUrl: false,
        // Security: Use PKCE flow
        flowType: 'pkce'
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
      // Security: Add server-specific headers
      global: {
        headers: {
          'X-Client-Info': 'affilitics-server'
        }
      }
    }
  )
}

export function createMiddlewareClient(req: NextRequest, res: NextResponse) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Security: Don't persist session in middleware
        persistSession: false,
        // Security: Don't detect session from URL
        detectSessionInUrl: false,
        // Security: Use PKCE flow
        flowType: 'pkce'
      },
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
      global: {
        headers: {
          'X-Client-Info': 'affilitics-middleware'
        }
      }
    }
  )
}

// Security: Service role client for admin operations (use with caution)
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      cookies: {
        getAll() { return [] },
        setAll() {}
      },
      global: {
        headers: {
          'X-Client-Info': 'affilitics-service'
        }
      }
    }
  )
}