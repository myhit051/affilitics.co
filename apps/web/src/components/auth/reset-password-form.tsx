'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from './auth-provider'
import { ResetPasswordFormData, resetPasswordSchema, validateFormData } from '@/lib/auth/validation'
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

export function ResetPasswordForm() {
  const [formData, setFormData] = useState<ResetPasswordFormData>({
    password: '',
    confirmPassword: '',
    token: ''
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const isMobile = useIsMobile()

  const router = useRouter()
  const searchParams = useSearchParams()
  const { updatePassword } = useAuth()

  // Get token from URL parameters on component mount
  useEffect(() => {
    const token = searchParams.get('token')
    if (token) {
      setFormData(prev => ({ ...prev, token }))
    } else {
      setGeneralError('Invalid or missing reset token. Please request a new password reset.')
    }
  }, [searchParams])

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
      // Security: Validate form data
      const validation = validateFormData(resetPasswordSchema, formData)
      if (!validation.success) {
        setErrors(validation.errors)
        return
      }

      // Security: Validate token exists
      if (!validation.data.token) {
        setGeneralError('Invalid or missing reset token. Please request a new password reset.')
        return
      }

      // Attempt password update
      const { error } = await updatePassword(validation.data.password)

      if (error) {
        // Security: Handle specific error cases
        switch (error.message) {
          case 'New password should be different from the old password':
            setErrors({ password: ['New password must be different from your current password'] })
            break
          case 'Password should be at least 6 characters':
            setErrors({ password: ['Password must be at least 12 characters long'] })
            break
          case 'Invalid token':
          case 'Token expired':
            setGeneralError('The reset link has expired or is invalid. Please request a new password reset.')
            break
          default:
            setGeneralError('An error occurred while updating your password. Please try again.')
        }
        return
      }

      // Success
      setSuccessMessage('Your password has been successfully updated!')
      
      // Clear form
      setFormData({
        password: '',
        confirmPassword: '',
        token: ''
      })

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/login?message=Password updated successfully')
      }, 3000)

    } catch (error: any) {
      console.error('Password reset error:', error)
      setGeneralError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Show success message
  if (successMessage) {
    return (
      <div className="text-center space-y-4">
        <Alert variant="default" className="border-green-200 bg-green-50">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-green-600 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <AlertDescription className="text-green-800 font-medium">
              {successMessage}
            </AlertDescription>
          </div>
        </Alert>
        <p className="text-slate-600">Redirecting to sign in...</p>
        <div className="flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
        </div>
      </div>
    )
  }

  // Show error if no token
  if (!formData.token && generalError) {
    return (
      <div className="text-center space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{generalError}</AlertDescription>
        </Alert>
        <Button
          asChild
          className="w-full sm:w-auto"
          size={isMobile ? "mobile-default" : "default"}
          mobileOptimized={true}
        >
          <a href="/forgot-password">
            Request new reset link
          </a>
        </Button>
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

      {/* Password field */}
      <Input
        type="password"
        id="password"
        name="password"
        label="New Password"
        value={formData.password}
        onChange={handleInputChange}
        disabled={isLoading}
        placeholder="Create a strong password"
        autoComplete="new-password"
        required
        error={errors.password?.[0]}
        helperText="Must be at least 12 characters with uppercase, lowercase, number, and special character"
        mobileOptimized={true}
        variant={errors.password?.length ? "destructive" : "default"}
      />

      {/* Confirm Password field */}
      <Input
        type="password"
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm New Password"
        value={formData.confirmPassword}
        onChange={handleInputChange}
        disabled={isLoading}
        placeholder="Confirm your new password"
        autoComplete="new-password"
        required
        error={errors.confirmPassword?.[0]}
        mobileOptimized={true}
        variant={errors.confirmPassword?.length ? "destructive" : "default"}
      />

      {/* Submit button */}
      <Button
        type="submit"
        disabled={isLoading || !formData.token}
        loading={isLoading}
        className="w-full"
        size={isMobile ? "mobile-default" : "default"}
        mobileOptimized={true}
      >
        {isLoading ? 'Updating password...' : 'Update password'}
      </Button>

      {/* Security Notice */}
      <Alert variant="default" className="border-amber-200 bg-amber-50">
        <AlertDescription className="text-amber-800">
          <strong>Security Note:</strong> After updating your password, you'll be signed out of all devices and need to sign in again.
        </AlertDescription>
      </Alert>
    </form>
  )
}