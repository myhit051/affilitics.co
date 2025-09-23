import { z } from 'zod'

// Security: Strong validation schemas with comprehensive checks

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .email('Invalid email format')
  .refine((email) => {
    // Security: Additional email validation
    const parts = email.split('@')
    if (parts.length !== 2) return false
    
    const [local, domain] = parts
    // Check local part length (RFC 5321)
    if (local.length > 64) return false
    
    // Check for dangerous characters
    const dangerousChars = /[<>'"&]/
    return !dangerousChars.test(email)
  }, 'Email contains invalid characters')

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long')
  .max(128, 'Password is too long')
  .refine((password) => /[a-z]/.test(password), 'Password must contain at least one lowercase letter')
  .refine((password) => /[A-Z]/.test(password), 'Password must contain at least one uppercase letter')
  .refine((password) => /\d/.test(password), 'Password must contain at least one number')
  .refine((password) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password), 'Password must contain at least one special character')
  .refine((password) => {
    // Security: Check against common weak passwords
    const commonPatterns = ['password', '123456', 'qwerty', 'admin', 'letmein']
    return !commonPatterns.some(pattern => password.toLowerCase().includes(pattern))
  }, 'Password contains common weak patterns')

export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name is too long')
  .refine((name) => {
    // Security: Sanitize name input
    const dangerousChars = /[<>'"&]/
    return !dangerousChars.test(name)
  }, 'Name contains invalid characters')
  .refine((name) => {
    // Allow letters, spaces, hyphens, apostrophes
    const validPattern = /^[a-zA-Z\s\-']+$/
    return validPattern.test(name)
  }, 'Name can only contain letters, spaces, hyphens, and apostrophes')

export const workspaceNameSchema = z
  .string()
  .min(1, 'Workspace name is required')
  .max(50, 'Workspace name is too long')
  .refine((name) => {
    // Security: Sanitize workspace name
    const dangerousChars = /[<>'"&]/
    return !dangerousChars.test(name)
  }, 'Workspace name contains invalid characters')

export const roleSchema = z.enum(['owner', 'admin', 'member'], {
  errorMap: () => ({ message: 'Invalid role' })
})

export const workspaceIdSchema = z
  .string()
  .uuid('Invalid workspace ID format')

export const userIdSchema = z
  .string()
  .uuid('Invalid user ID format')

// Security: Authentication form schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional().default(false)
})

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
  fullName: nameSchema,
  workspaceName: workspaceNameSchema,
  acceptTerms: z.boolean().refine(val => val === true, 'You must accept the terms and conditions')
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
})

export const forgotPasswordSchema = z.object({
  email: emailSchema
})

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
  token: z.string().min(1, 'Reset token is required')
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Password confirmation is required')
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword']
})

export const updateProfileSchema = z.object({
  fullName: nameSchema,
  email: emailSchema
})

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: roleSchema,
  workspaceId: workspaceIdSchema
})

// Security: API request validation schemas
export const authRequestSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  role: roleSchema.optional()
})

// Security: Session validation schema
export const sessionSchema = z.object({
  user: z.object({
    id: userIdSchema,
    email: emailSchema,
    role: roleSchema.optional()
  }),
  workspace: z.object({
    id: workspaceIdSchema,
    name: workspaceNameSchema,
    role: roleSchema
  }).optional()
})

// Type exports for use in components
export type LoginFormData = z.infer<typeof loginSchema>
export type RegisterFormData = z.infer<typeof registerSchema>
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>
export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>
export type InviteMemberFormData = z.infer<typeof inviteMemberSchema>

// Security: Validation helper functions
export function validateFormData<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: Record<string, string[]> } {
  try {
    const result = schema.parse(data)
    return { success: true, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string[]> = {}
      error.errors.forEach((err) => {
        const path = err.path.join('.')
        if (!errors[path]) {
          errors[path] = []
        }
        errors[path].push(err.message)
      })
      return { success: false, errors }
    }
    return { success: false, errors: { root: ['Validation failed'] } }
  }
}

// Security: CSRF token validation (basic implementation)
export const csrfTokenSchema = z.string().min(32, 'Invalid CSRF token')

export function generateCSRFToken(): string {
  // In production, use a cryptographically secure method
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}