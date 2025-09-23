import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Security: Enable auto refresh for better UX while maintaining security
        autoRefreshToken: true,
        // Security: Persist session in secure storage
        persistSession: true,
        // Security: Detect session from URL for OAuth flows
        detectSessionInUrl: true,
        // Security: Configure session storage
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        // Security: Flow type for PKCE (more secure than implicit)
        flowType: 'pkce'
      },
      // Security: Configure global headers for better security
      global: {
        headers: {
          'X-Client-Info': 'affilitics-web'
        }
      }
    }
  )
}