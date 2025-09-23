"use client"

import * as React from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

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

interface MetricCardProps {
  title: string
  value: string | number
  description?: string
  change?: {
    value: number
    type: 'increase' | 'decrease' | 'neutral'
    period: string
  }
  icon?: React.ReactNode
  loading?: boolean
  className?: string
}

export function MetricCard({
  title,
  value,
  description,
  change,
  icon,
  loading = false,
  className
}: MetricCardProps) {
  const isMobile = useIsMobile()
  
  if (loading) {
    return (
      <Card className={cn(
        "touch-manipulation",
        className
      )}>
        <CardHeader className={cn(
          "flex flex-row items-center justify-between space-y-0",
          isMobile ? "pb-1.5 px-4 pt-4" : "pb-2"
        )}>
          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
          {icon && <div className="h-4 w-4 bg-muted animate-pulse rounded" />}
        </CardHeader>
        <CardContent className={cn(
          isMobile ? "px-4 pb-4" : ""
        )}>
          <div className={cn(
            "bg-muted animate-pulse rounded mb-2",
            isMobile ? "h-6 w-28" : "h-8 w-32"
          )} />
          {description && <div className="h-3 w-20 bg-muted animate-pulse rounded" />}
        </CardContent>
      </Card>
    )
  }

  const getTrendIcon = () => {
    if (!change) return null
    
    switch (change.type) {
      case 'increase':
        return <TrendingUp className="h-3 w-3" />
      case 'decrease':
        return <TrendingDown className="h-3 w-3" />
      default:
        return <Minus className="h-3 w-3" />
    }
  }

  const getTrendColor = () => {
    if (!change) return ""
    
    switch (change.type) {
      case 'increase':
        return "text-green-600"
      case 'decrease':
        return "text-red-600"
      default:
        return "text-muted-foreground"
    }
  }

  const formatValue = (val: string | number): string => {
    if (typeof val === 'number') {
      // Format numbers with appropriate suffixes
      if (val >= 1000000) {
        return `${(val / 1000000).toFixed(1)}M`
      } else if (val >= 1000) {
        return `${(val / 1000).toFixed(1)}K`
      }
      // Use shorter format on mobile for very long numbers
      if (isMobile && val.toString().length > 8) {
        return val.toExponential(1)
      }
      return val.toLocaleString()
    }
    return val
  }

  return (
    <Card className={cn(
      "touch-manipulation transition-colors hover:shadow-md",
      className
    )}>
      <CardHeader className={cn(
        "flex flex-row items-center justify-between space-y-0",
        isMobile ? "pb-1.5 px-4 pt-4" : "pb-2"
      )}>
        <CardTitle className={cn(
          "font-medium text-muted-foreground truncate",
          isMobile ? "text-xs" : "text-sm"
        )}>
          {title}
        </CardTitle>
        {icon && (
          <div className={cn(
            "text-muted-foreground flex-shrink-0",
            isMobile ? "h-3.5 w-3.5" : "h-4 w-4"
          )}>
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent className={cn(
        isMobile ? "px-4 pb-4" : ""
      )}>
        <div className={cn(
          "font-bold",
          isMobile ? "text-xl" : "text-2xl"
        )}>{formatValue(value)}</div>
        {change && (
          <div className={cn(
            "flex items-center gap-1 mt-1 flex-wrap",
            isMobile && "text-xs"
          )}>
            <div className={cn("flex items-center gap-1 text-xs", getTrendColor())}>
              {getTrendIcon()}
              <span>
                {change.value > 0 ? '+' : ''}{change.value}%
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              vs {change.period}
            </span>
          </div>
        )}
        {description && !change && (
          <CardDescription className={cn(
            isMobile ? "text-xs leading-relaxed" : "text-xs"
          )}>
            {description}
          </CardDescription>
        )}
      </CardContent>
    </Card>
  )
}