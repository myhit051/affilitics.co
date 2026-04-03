'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'
import { Loading } from '@/components/ui/loading'

export default function HomePage() {
  const router = useRouter()
  const { session, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading) {
      if (session) {
        router.push('/workspaces')
      } else {
        router.push('/login')
      }
    }
  }, [isLoading, session, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-6">
      <div className="text-center space-y-6 max-w-md w-full">
        <div className="space-y-4">
          <div className="flex justify-center">
            <Loading size="lg" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Welcome to Affilitics</h1>
            <p className="text-slate-600 text-base sm:text-lg">Redirecting...</p>
          </div>
        </div>
      </div>
    </div>
  )
}