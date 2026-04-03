import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata = {
  title: 'Reset Password | Affilitics',
  description: 'Reset your Affilitics account password',
}

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Reset your password</h2>
        <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
          Enter your email address and we&apos;ll send you a link to reset your password
        </p>
      </div>

      {/* Forgot Password Form */}
      <ForgotPasswordForm />

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