"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 touch-manipulation",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground active:bg-accent/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/85",
        ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent/90",
        link: "text-primary underline-offset-4 hover:underline active:text-primary/90",
        brand: "bg-brand-blue text-white hover:bg-brand-blue-dark active:bg-brand-blue/90",
        success: "bg-success text-success-foreground hover:bg-success/90 active:bg-success/95",
        warning: "bg-warning text-warning-foreground hover:bg-warning/90 active:bg-warning/95",
        info: "bg-info text-info-foreground hover:bg-info/90 active:bg-info/95",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        xl: "h-12 rounded-md px-10 text-base",
        icon: "h-10 w-10",
        // Mobile-optimized sizes for better touch targets
        "mobile-sm": "h-11 rounded-md px-3 text-sm",
        "mobile-default": "h-12 px-4 py-2",
        "mobile-lg": "h-14 rounded-md px-8 text-base",
        "mobile-icon": "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
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

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, mobileOptimized = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
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
        case 'icon':
          adjustedSize = 'mobile-icon'
          break
        default:
          adjustedSize = size
      }
    }
    
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size: adjustedSize, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      )
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size: adjustedSize, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }