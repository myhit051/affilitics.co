import * as React from "react"

import { cn } from "@/lib/utils"

interface PageWrapperProps {
  children: React.ReactNode
  className?: string
}

export const PageWrapper = React.forwardRef<HTMLDivElement, PageWrapperProps>(
  ({ children, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("min-h-full space-y-6", className)}
      >
        {children}
      </div>
    )
  }
)
PageWrapper.displayName = "PageWrapper"

interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}

export const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ title, description, children, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col gap-4 pb-6 md:flex-row md:items-center md:justify-between",
          className
        )}
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-2">
            {children}
          </div>
        )}
      </div>
    )
  }
)
PageHeader.displayName = "PageHeader"

interface PageContentProps {
  children: React.ReactNode
  className?: string
}

export const PageContent = React.forwardRef<HTMLDivElement, PageContentProps>(
  ({ children, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("space-y-6", className)}
      >
        {children}
      </div>
    )
  }
)
PageContent.displayName = "PageContent"