import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation",
  {
    variants: {
      variant: {
        default: "",
        destructive: "border-destructive focus-visible:ring-destructive",
        success: "border-success focus-visible:ring-success",
        warning: "border-warning focus-visible:ring-warning",
      },
      size: {
        default: "h-10",
        sm: "h-9 px-2 text-xs",
        lg: "h-11 px-4 text-base",
        // Mobile-optimized sizes
        "mobile-default": "h-12 px-3 py-3 text-base",
        "mobile-sm": "h-11 px-2 text-sm",
        "mobile-lg": "h-14 px-4 text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  error?: string
  helperText?: string
  label?: string
  startIcon?: React.ReactNode
  endIcon?: React.ReactNode
  mobileOptimized?: boolean
}

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

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, size, type, error, helperText, label, startIcon, endIcon, mobileOptimized = false, ...props }, ref) => {
    const hasError = !!error
    const effectiveVariant = hasError ? "destructive" : variant
    const isMobile = useIsMobile()
    
    // Auto-adjust size for mobile when mobileOptimized is true
    let adjustedSize = size
    if (mobileOptimized && isMobile) {
      switch (size) {
        case 'sm':
          adjustedSize = 'mobile-sm'
          break
        case 'default':
          adjustedSize = 'mobile-default'
          break
        case 'lg':
          adjustedSize = 'mobile-lg'
          break
        default:
          adjustedSize = size
      }
    }

    return (
      <div className="w-full">
        {label && (
          <label className={cn(
            "mb-2 block font-medium text-foreground",
            isMobile ? "text-base" : "text-sm"
          )}>
            {label}
            {props.required && <span className="ml-1 text-destructive">*</span>}
          </label>
        )}
        <div className="relative">
          {startIcon && (
            <div className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground",
              isMobile ? "h-5 w-5" : "h-4 w-4"
            )}>
              {startIcon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              inputVariants({ variant: effectiveVariant, size: adjustedSize, className }),
              startIcon && (isMobile ? "pl-12" : "pl-10"),
              endIcon && (isMobile ? "pr-12" : "pr-10")
            )}
            ref={ref}
            {...props}
          />
          {endIcon && (
            <div className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground",
              isMobile ? "h-5 w-5" : "h-4 w-4"
            )}>
              {endIcon}
            </div>
          )}
        </div>
        {(error || helperText) && (
          <p className={cn(
            "mt-2 text-sm",
            hasError ? "text-destructive" : "text-muted-foreground"
          )}>
            {error || helperText}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input, inputVariants }