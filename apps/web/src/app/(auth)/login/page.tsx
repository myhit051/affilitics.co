import { LoginForm } from '@/components/auth/login-form'
import { Suspense } from 'react'

export const metadata = {
  title: 'Sign In | Affilitics',
  description: 'Sign in to your Affilitics account',
}

export default function LoginPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Welcome back</h2>
        <p className="text-slate-600 text-base sm:text-lg">Sign in to your account</p>
      </div>

      {/* Login Form */}
      <Suspense fallback={
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
          <span className="ml-2 text-slate-600">Loading...</span>
        </div>
      }>
        <LoginForm />
      </Suspense>

      {/* Footer Links */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <div className="text-center">
          <p className="text-slate-600">
            Don&apos;t have an account?{' '}
            <a
              href="/register"
              className="font-semibold text-blue-600 hover:text-blue-500 transition-colors touch-manipulation"
            >
              Sign up
            </a>
          </p>
        </div>

        <div className="text-center">
          <a
            href="/forgot-password"
            className="text-slate-500 hover:text-slate-700 transition-colors touch-manipulation inline-block py-2"
          >
            Forgot your password?
          </a>
        </div>
      </div>
    </div>
  )
}