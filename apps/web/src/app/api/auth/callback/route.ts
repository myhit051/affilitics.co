import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error_param = requestUrl.searchParams.get('error')
  const error_description = requestUrl.searchParams.get('error_description')
  const origin = requestUrl.origin

  // Security: Handle OAuth errors from provider
  if (error_param) {
    console.error('OAuth Provider Error:', error_param, error_description)
    const errorType = error_param === 'access_denied' ? 'access_denied' : 'oauth_error'
    return NextResponse.redirect(`${origin}/auth/login?error=${errorType}&message=${encodeURIComponent(error_description || 'OAuth authentication failed')}`)
  }

  if (code) {
    const supabase = createClient()
    
    try {
      console.log('Processing auth callback with code:', code.substring(0, 10) + '...')
      
      // Security: Exchange code for session with proper error handling
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) {
        console.error('Auth callback error:', error)
        // Security: Provide specific error types for better UX
        let errorType = 'callback_error'
        if (error.message.includes('expired')) {
          errorType = 'code_expired'
        } else if (error.message.includes('invalid')) {
          errorType = 'invalid_code'
        }
        return NextResponse.redirect(`${origin}/auth/login?error=${errorType}&message=${encodeURIComponent(error.message)}`)
      }

      // Security: Get the authenticated user to verify session
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        console.error('User verification error:', userError)
        return NextResponse.redirect(`${origin}/login?error=session_error`)
      }

      // Security: Check if user has any workspace memberships
      const { data: memberships, error: membershipError } = await supabase
        .from('members')
        .select(`
          id,
          workspace_id,
          role,
          workspace:workspaces(id, name, plan)
        `)
        .eq('user_id', user.id)

      if (membershipError) {
        console.error('Membership check error:', membershipError)
        return NextResponse.redirect(`${origin}/workspaces`)
      }

      // Redirect based on workspace membership
      if (memberships && memberships.length > 0) {
        // If user has only one workspace, redirect directly to it
        if (memberships.length === 1) {
          return NextResponse.redirect(`${origin}/workspace/${memberships[0].workspace_id}`)
        }
        // If multiple workspaces, let them choose
        return NextResponse.redirect(`${origin}/workspaces`)
      }

      // New user without workspace - redirect to workspace creation
      return NextResponse.redirect(`${origin}/workspaces`)

    } catch (error) {
      console.error('Unexpected auth callback error:', error)
      return NextResponse.redirect(`${origin}/login?error=unexpected_error`)
    }
  }

  // Security: If no code provided, redirect to login
  return NextResponse.redirect(`${origin}/login?error=missing_code`)
}