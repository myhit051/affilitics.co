import { RegisterForm } from '@/components/auth/register-form'
import { Suspense } from 'react'

export const metadata = {
  title: 'Sign Up | Affilitics',
  description: 'Create your Affilitics account',
}

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Create your account</h2>
        <p className="text-slate-600 text-base sm:text-lg">Start your affiliate marketing journey</p>
      </div>

      {/* Register Form */}
      <Suspense fallback={
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
          <span className="ml-2 text-slate-600">Loading...</span>
        </div>
      }>
        <RegisterForm />
      </Suspense>

      {/* Footer Links */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <div className="text-center">
          <p className="text-slate-600">
            Already have an account?{' '}
            <a
              href="/login"
              className="font-semibold text-blue-600 hover:text-blue-500 transition-colors touch-manipulation"
            >
              Sign in
            </a>
          </p>
        </div>

        <div className="text-center text-sm text-slate-500 leading-relaxed">
          By signing up, you agree to our{' '}
          <a 
            href="/terms" 
            className="text-blue-600 underline hover:text-blue-500 touch-manipulation"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a 
            href="/privacy" 
            className="text-blue-600 underline hover:text-blue-500 touch-manipulation"
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  )
}