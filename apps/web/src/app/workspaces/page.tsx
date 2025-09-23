import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Your Workspaces | Affilitics',
  description: 'Select or create a workspace',
}

export default async function WorkspacesPage() {
  const supabase = createClient()
  
  // Security: Get authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user) {
    redirect('/login')
  }

  // Security: Get user's workspace memberships with workspace details
  const { data: memberships, error: membershipError } = await supabase
    .from('members')
    .select(`
      id,
      role,
      workspace:workspaces(
        id,
        name,
        plan,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (membershipError) {
    console.error('Error fetching workspaces:', membershipError)
  }

  // If user has only one workspace, redirect directly
  if (memberships && memberships.length === 1) {
    redirect(`/workspace/${(memberships[0] as any).workspace.id}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Your Workspaces</h1>
            <p className="text-slate-600">Select a workspace to continue</p>
          </div>

          {/* Workspace list */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
            {memberships?.map((membership) => (
              <div key={membership.id} className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-slate-900">
                      {(membership as any).workspace.name}
                    </h2>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      (membership as any).role === 'owner' 
                        ? 'bg-purple-100 text-purple-800'
                        : (membership as any).role === 'admin'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {(membership as any).role}
                    </span>
                  </div>
                  <p className="text-slate-600 text-sm mb-4">
                    Plan: <span className="font-medium capitalize">{(membership as any).workspace.plan}</span>
                  </p>
                  <a
                    href={`/workspace/${(membership as any).workspace.id}`}
                    className="inline-flex items-center justify-center w-full px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    Open Workspace
                  </a>
                </div>
              </div>
            ))}

            {/* Create new workspace card */}
            <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border-2 border-dashed border-slate-300">
              <div className="p-6 text-center">
                <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">Create New Workspace</h3>
                <p className="text-slate-600 text-sm mb-4">Start a new affiliate marketing project</p>
                <button className="inline-flex items-center justify-center w-full px-4 py-2 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                  Create Workspace
                </button>
              </div>
            </div>
          </div>

          {/* User info and sign out */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Signed in as</p>
                <p className="font-medium text-slate-900">{user.email}</p>
              </div>
              <form action="/api/auth/signout" method="post">
                <button
                  type="submit"
                  className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}