"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ResponsiveGridProps {
  children: React.ReactNode
  className?: string
  cols?: {
    xs?: number
    sm?: number
    md?: number
    lg?: number
    xl?: number
    '2xl'?: number
  }
  gap?: number
}

export function ResponsiveGrid({ 
  children, 
  className,
  cols = { xs: 1, sm: 1, md: 2, lg: 2, xl: 3, '2xl': 4 },
  gap = 6 
}: ResponsiveGridProps) {
  const gridClasses = [
    `grid gap-${gap}`,
    cols.xs && `grid-cols-${cols.xs}`,
    cols.sm && `sm:grid-cols-${cols.sm}`,
    cols.md && `md:grid-cols-${cols.md}`,
    cols.lg && `lg:grid-cols-${cols.lg}`,
    cols.xl && `xl:grid-cols-${cols.xl}`,
    cols['2xl'] && `2xl:grid-cols-${cols['2xl']}`
  ].filter(Boolean).join(' ')

  return (
    <div className={cn(gridClasses, className)}>
      {children}
    </div>
  )
}

// Breakpoint-aware component wrapper
interface ResponsiveWrapperProps {
  children: React.ReactNode
  hideOn?: ('xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl')[]
  showOn?: ('xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl')[]
  className?: string
}

export function ResponsiveWrapper({ 
  children, 
  hideOn = [], 
  showOn = [],
  className 
}: ResponsiveWrapperProps) {
  const hiddenClasses = hideOn.map(bp => {
    switch (bp) {
      case 'xs':
        return 'hidden'
      case 'sm':
        return 'sm:hidden'
      case 'md':
        return 'md:hidden'
      case 'lg':
        return 'lg:hidden'
      case 'xl':
        return 'xl:hidden'
      case '2xl':
        return '2xl:hidden'
      default:
        return ''
    }
  }).join(' ')

  const shownClasses = showOn.map(bp => {
    switch (bp) {
      case 'xs':
        return 'block'
      case 'sm':
        return 'sm:block'
      case 'md':
        return 'md:block'
      case 'lg':
        return 'lg:block'
      case 'xl':
        return 'xl:block'
      case '2xl':
        return '2xl:block'
      default:
        return ''
    }
  }).join(' ')

  return (
    <div className={cn(hiddenClasses, shownClasses, className)}>
      {children}
    </div>
  )
}

// Mobile-optimized metric cards
interface MobileMetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: React.ReactNode
  trend?: {
    value: number
    direction: 'up' | 'down' | 'flat'
  }
  className?: string
  onClick?: () => void
}

export function MobileMetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
  onClick
}: MobileMetricCardProps) {
  return (
    <div 
      className={cn(
        "bg-card border rounded-lg p-4 space-y-2",
        onClick && "cursor-pointer hover:shadow-md transition-shadow",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground font-medium">
          {title}
        </span>
        {icon && (
          <div className="text-muted-foreground">
            {icon}
          </div>
        )}
      </div>
      
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold">
          {value}
        </span>
        {trend && (
          <div className={cn(
            "text-xs font-medium flex items-center gap-1",
            trend.direction === 'up' ? "text-green-600" :
            trend.direction === 'down' ? "text-red-600" :
            "text-muted-foreground"
          )}>
            <span>
              {trend.direction === 'up' ? '↗' : 
               trend.direction === 'down' ? '↘' : '→'}
            </span>
            <span>
              {trend.value > 0 ? '+' : ''}{trend.value}%
            </span>
          </div>
        )}
      </div>
      
      {subtitle && (
        <div className="text-xs text-muted-foreground">
          {subtitle}
        </div>
      )}
    </div>
  )
}

// Hook for responsive behavior
export function useResponsive() {
  const [breakpoint, setBreakpoint] = React.useState<string>('xs')

  React.useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth
      if (width >= 1536) setBreakpoint('2xl')
      else if (width >= 1280) setBreakpoint('xl')
      else if (width >= 1024) setBreakpoint('lg')
      else if (width >= 768) setBreakpoint('md')
      else if (width >= 640) setBreakpoint('sm')
      else setBreakpoint('xs')
    }

    updateBreakpoint()
    window.addEventListener('resize', updateBreakpoint)
    return () => window.removeEventListener('resize', updateBreakpoint)
  }, [])

  const isMobile = ['xs', 'sm'].includes(breakpoint)
  const isTablet = ['md', 'lg'].includes(breakpoint)
  const isDesktop = ['xl', '2xl'].includes(breakpoint)

  return {
    breakpoint,
    isMobile,
    isTablet,
    isDesktop,
    width: {
      xs: breakpoint === 'xs',
      sm: breakpoint === 'sm',
      md: breakpoint === 'md',
      lg: breakpoint === 'lg',
      xl: breakpoint === 'xl',
      '2xl': breakpoint === '2xl'
    }
  }
}