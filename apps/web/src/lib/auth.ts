import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function getAuthContext() {
  const supabase = createClient()
  
  try {
    // Get user from Supabase auth
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      throw new Response(JSON.stringify({ 
        error: 'Unauthorized',
        details: 'Authentication required'
      }), { status: 401 })
    }

    // Security: Get workspace ID from validated headers (set by middleware)
    const h = headers()
    const workspaceId = h.get('x-workspace-id')
    
    if (!workspaceId) {
      throw new Response(JSON.stringify({ 
        error: 'Missing workspace',
        details: 'Workspace ID is required'
      }), { status: 400 })
    }

    return { 
      user: {
        id: user.id,
        email: user.email || '',
        name: user.user_metadata?.name || null
      },
      workspaceId,
      supabase
    }
  } catch (error) {
    if (error instanceof Response) {
      throw error
    }
    
    throw new Response(JSON.stringify({ 
      error: 'Authentication failed',
      details: 'Could not verify user authentication'
    }), { status: 401 })
  }
}

