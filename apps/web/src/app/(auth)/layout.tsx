import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Security: Check if user is already authenticated
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // If user is authenticated, redirect to workspaces
  if (user) {
    redirect('/workspaces')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 sm:space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Affilitics</h1>
          <p className="text-slate-600 text-base sm:text-lg">Affiliate Marketing Analytics</p>
        </div>
        
        {/* Main Content Card */}
        <div className="bg-white rounded-xl shadow-xl px-6 py-8 sm:px-8 sm:py-10">
          {children}
        </div>
      </div>
    </div>
  )
}