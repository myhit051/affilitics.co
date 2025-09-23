import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { Suspense } from 'react'

export const metadata = {
  title: 'Reset Password | Affilitics',
  description: 'Set your new Affilitics account password',
}

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Set new password</h2>
        <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
          Choose a strong password for your account
        </p>
      </div>

      {/* Reset Password Form */}
      <Suspense fallback={
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
          <span className="ml-2 text-slate-600">Loading...</span>
        </div>
      }>
        <ResetPasswordForm />
      </Suspense>

      {/* Footer Link */}
      <div className="pt-4 border-t border-slate-200 text-center">
        <a
          href="/login"
          className="text-slate-500 hover:text-slate-700 transition-colors touch-manipulation inline-block py-2"
        >
          Back to sign in
        </a>
      </div>
    </div>
  )
}