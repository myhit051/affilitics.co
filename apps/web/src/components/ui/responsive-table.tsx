"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
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

interface ResponsiveTableColumn {
  key: string
  label: string
  hideOnMobile?: boolean
  priority?: number // Lower number = higher priority (show first on mobile)
  render?: (value: any, row: any) => React.ReactNode
}

interface ResponsiveTableProps {
  columns: ResponsiveTableColumn[]
  data: any[]
  loading?: boolean
  className?: string
  onRowClick?: (row: any) => void
}

export function ResponsiveTable({ 
  columns, 
  data, 
  loading = false, 
  className,
  onRowClick 
}: ResponsiveTableProps) {
  const isMobile = useIsMobile()

  // Sort columns by priority for mobile display
  const mobileColumns = columns
    .filter(col => !col.hideOnMobile)
    .sort((a, b) => (a.priority || 0) - (b.priority || 0))
    .slice(0, 3) // Show max 3 columns on mobile

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className={cn("space-y-3", className)}>
        {data.map((row, index) => (
          <Card 
            key={index} 
            className={cn(
              "touch-manipulation transition-colors",
              onRowClick && "cursor-pointer hover:shadow-md active:shadow-sm"
            )}
            onClick={() => onRowClick?.(row)}
          >
            <CardContent className="p-4">
              <div className="space-y-2">
                {mobileColumns.map((column) => {
                  const value = row[column.key]
                  const displayValue = column.render ? column.render(value, row) : value
                  
                  return (
                    <div 
                      key={column.key} 
                      className="flex justify-between items-center"
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        {column.label}:
                      </span>
                      <span className="text-sm font-medium truncate ml-2 flex-1 text-right">
                        {displayValue}
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  // Desktop table view
  return (
    <div className={cn("relative w-full overflow-auto", className)}>
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b">
            {columns.map((column) => (
              <th
                key={column.key}
                className="h-12 px-4 text-left align-middle font-medium text-muted-foreground"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={index}
              className={cn(
                "border-b transition-colors hover:bg-muted/50",
                onRowClick && "cursor-pointer"
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((column) => {
                const value = row[column.key]
                const displayValue = column.render ? column.render(value, row) : value
                
                return (
                  <td key={column.key} className="p-4 align-middle">
                    {displayValue}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Hook for responsive table configuration
export function useResponsiveColumns(baseColumns: ResponsiveTableColumn[]) {
  const isMobile = useIsMobile()
  
  return React.useMemo(() => {
    if (isMobile) {
      return baseColumns
        .filter(col => !col.hideOnMobile)
        .sort((a, b) => (a.priority || 0) - (b.priority || 0))
        .slice(0, 3)
    }
    return baseColumns
  }, [baseColumns, isMobile])
}