'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from './auth-provider'
import { LoginFormData, loginSchema, validateFormData } from '@/lib/auth/validation'
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

export function LoginForm() {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
    remember: false
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const isMobile = useIsMobile()

  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn, signInWithGoogle } = useAuth()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    
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
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setGeneralError(null)

    try {
      // Security: Rate limiting check
      const clientIP = 'client-ip' // In a real app, get from headers
      checkRateLimit(clientIP, 5, 15 * 60 * 1000) // 5 attempts per 15 minutes

      // Security: Validate form data
      const validation = validateFormData(loginSchema, formData)
      if (!validation.success) {
        setErrors(validation.errors)
        return
      }

      // Security: Sanitize inputs
      const sanitizedEmail = sanitizeAuthInput(validation.data.email)
      const password = validation.data.password

      // Attempt sign in
      const { error } = await signIn(sanitizedEmail, password)

      if (error) {
        // Security: Generic error message to prevent user enumeration
        switch (error.message) {
          case 'Invalid login credentials':
            setGeneralError('Invalid email or password. Please check your credentials and try again.')
            break
          case 'Email not confirmed':
            setGeneralError('Please check your email and click the confirmation link before signing in.')
            break
          case 'Too many requests':
            setGeneralError('Too many login attempts. Please wait a few minutes before trying again.')
            break
          default:
            setGeneralError('An error occurred during sign in. Please try again.')
        }
        return
      }

      // Success - redirect to intended destination
      const callbackUrl = searchParams.get('callbackUrl')
      if (callbackUrl && callbackUrl.startsWith('/')) {
        router.push(callbackUrl)
      } else {
        router.push('/workspaces')
      }

    } catch (error: any) {
      console.error('Login error:', error)
      if (error.code === 'RATE_LIMITED') {
        setGeneralError(error.message)
      } else {
        setGeneralError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setGeneralError(null)

    try {
      const { error } = await signInWithGoogle()
      
      if (error) {
        console.error('Google OAuth Error Details:', error)
        
        // Security: Provide specific error messages based on error type
        if (error.message.includes('400') || error.message.includes('Bad Request')) {
          setGeneralError('Google OAuth configuration error. Please contact support if this persists.')
        } else if (error.message.includes('network')) {
          setGeneralError('Network error. Please check your connection and try again.')
        } else if (error.message.includes('popup')) {
          setGeneralError('Popup was blocked. Please allow popups for this site or try again.')
        } else {
          setGeneralError('Failed to sign in with Google. Please try again or use email/password.')
        }
      }
      // Success case is handled by the auth provider and callback
    } catch (error) {
      console.error('Unexpected Google sign in error:', error)
      setGeneralError('An unexpected error occurred with Google sign in. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn(
      "space-y-4",
      isMobile && "space-y-5"
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
        placeholder="Enter your email"
        autoComplete="email"
        required
        error={errors.email?.[0]}
        mobileOptimized={true}
        variant={errors.email?.length ? "destructive" : "default"}
      />

      {/* Password field */}
      <Input
        type="password"
        id="password"
        name="password"
        label="Password"
        value={formData.password}
        onChange={handleInputChange}
        disabled={isLoading}
        placeholder="Enter your password"
        autoComplete="current-password"
        required
        error={errors.password?.[0]}
        mobileOptimized={true}
        variant={errors.password?.length ? "destructive" : "default"}
      />

      {/* Remember me checkbox */}
      <div className={cn(
        "flex items-center space-x-3 touch-manipulation",
        isMobile && "py-1"
      )}>
        <input
          type="checkbox"
          id="remember"
          name="remember"
          checked={formData.remember}
          onChange={handleInputChange}
          disabled={isLoading}
          className={cn(
            "text-blue-600 focus:ring-blue-500 border-slate-300 rounded touch-manipulation",
            isMobile ? "h-5 w-5" : "h-4 w-4"
          )}
        />
        <label 
          htmlFor="remember" 
          className={cn(
            "block text-slate-700 cursor-pointer touch-manipulation",
            isMobile ? "text-base" : "text-sm"
          )}
        >
          Remember me for 30 days
        </label>
      </div>

      {/* Submit button */}
      <Button
        type="submit"
        disabled={isLoading}
        loading={isLoading}
        className="w-full"
        size={isMobile ? "mobile-default" : "default"}
        mobileOptimized={true}
      >
        {isLoading ? 'Signing in...' : 'Sign in'}
      </Button>

      {/* Divider */}
      <div className={cn(
        "relative",
        isMobile && "py-2"
      )}>
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className={cn(
            "px-2 bg-background text-muted-foreground",
            isMobile ? "text-sm" : "text-sm"
          )}>
            Or continue with
          </span>
        </div>
      </div>

      {/* Google sign in */}
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        className="w-full"
        size={isMobile ? "mobile-default" : "default"}
        mobileOptimized={true}
      >
        <svg className={cn(
          "mr-2",
          isMobile ? "w-6 h-6" : "w-5 h-5"
        )} viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </Button>
    </form>
  )
}