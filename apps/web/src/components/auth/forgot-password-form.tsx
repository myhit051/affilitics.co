'use client'

import { useState } from 'react'
import { useAuth } from './auth-provider'
import { ForgotPasswordFormData, forgotPasswordSchema, validateFormData } from '@/lib/auth/validation'
import { checkRateLimit, sanitizeAuthInput } from '@/lib/auth/client-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import * as React from 'react'

// Custom hook for mobile detection
const useIsMobile = () => {
  const [isMobile, setIsMobile] = React.useState(false)
  
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  return isMobile
}

interface FormErrors {
  [key: string]: string[]
}

export function ForgotPasswordForm() {
  const [formData, setFormData] = useState<ForgotPasswordFormData>({
    email: ''
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const isMobile = useIsMobile()

  const { resetPassword } = useAuth()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    
    // Security: Clear previous errors
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: []
      }))
    }
    setGeneralError(null)

    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setGeneralError(null)
    setSuccessMessage(null)

    try {
      // Security: Rate limiting check (more restrictive for password reset)
      const clientIP = 'client-ip' // In a real app, get from headers
      checkRateLimit(clientIP, 3, 30 * 60 * 1000) // 3 attempts per 30 minutes

      // Security: Validate form data
      const validation = validateFormData(forgotPasswordSchema, formData)
      if (!validation.success) {
        setErrors(validation.errors)
        return
      }

      // Security: Sanitize email
      const sanitizedEmail = sanitizeAuthInput(validation.data.email)

      // Attempt password reset
      const { error } = await resetPassword(sanitizedEmail)

      if (error) {
        // Security: Don't reveal whether email exists or not
        console.error('Password reset error:', error)
      }

      // Security: Always show success message to prevent email enumeration
      setSuccessMessage(
        `If an account with email ${sanitizedEmail} exists, you'll receive a password reset link shortly. Please check your email and spam folder.`
      )

      // Clear form
      setFormData({ email: '' })

    } catch (error: any) {
      console.error('Password reset error:', error)
      if (error.code === 'RATE_LIMITED') {
        setGeneralError(error.message)
      } else {
        setGeneralError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (successMessage) {
    return (
      <div className="text-center space-y-4">
        <Alert variant="default" className="border-green-200 bg-green-50">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <AlertDescription className="text-green-800 font-medium text-left">
              {successMessage}
            </AlertDescription>
          </div>
        </Alert>
        
        <div className="space-y-3 text-slate-600">
          <p className="text-sm">The reset link will expire in 1 hour for security reasons.</p>
          <p className="text-sm">
            If you don't receive an email, check your spam folder or{' '}
            <button
              type="button"
              onClick={() => {
                setSuccessMessage(null)
                setFormData({ email: '' })
              }}
              className="text-blue-600 hover:text-blue-500 underline touch-manipulation font-medium"
            >
              try again
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={cn(
      "space-y-5",
      isMobile && "space-y-6"
    )} noValidate>
      {/* Security: Show general errors */}
      {generalError && (
        <Alert variant="destructive">
          <AlertDescription>{generalError}</AlertDescription>
        </Alert>
      )}

      {/* Email field */}
      <Input
        type="email"
        id="email"
        name="email"
        label="Email address"
        value={formData.email}
        onChange={handleInputChange}
        disabled={isLoading}
        placeholder="Enter your email address"
        autoComplete="email"
        required
        error={errors.email?.[0]}
        helperText="We'll send a password reset link to this email address"
        mobileOptimized={true}
        variant={errors.email?.length ? "destructive" : "default"}
      />

      {/* Submit button */}
      <Button
        type="submit"
        disabled={isLoading}
        loading={isLoading}
        className="w-full"
        size={isMobile ? "mobile-default" : "default"}
        mobileOptimized={true}
      >
        {isLoading ? 'Sending reset link...' : 'Send reset link'}
      </Button>

      {/* Security Notice */}
      <Alert variant="default" className="border-blue-200 bg-blue-50">
        <AlertDescription className="text-blue-800">
          <strong>Security Notice:</strong> For your protection, we'll send a confirmation message regardless of whether the email exists in our system.
        </AlertDescription>
      </Alert>
    </form>
  )
}