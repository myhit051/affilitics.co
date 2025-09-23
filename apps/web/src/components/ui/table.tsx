import * as React from "react"

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

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  mobileOptimized?: boolean
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, mobileOptimized = false, ...props }, ref) => {
    const isMobile = useIsMobile()
    
    return (
      <div className={cn(
        "relative w-full",
        isMobile && mobileOptimized 
          ? "overflow-visible" 
          : "overflow-auto"
      )}>
        <table
          ref={ref}
          className={cn(
            "w-full caption-bottom",
            isMobile ? "text-xs" : "text-sm",
            className
          )}
          {...props}
        />
      </div>
    )
  }
)
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  mobileCard?: boolean
}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, mobileCard = false, ...props }, ref) => {
    const isMobile = useIsMobile()
    
    return (
      <tr
        ref={ref}
        className={cn(
          "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted touch-manipulation",
          isMobile && mobileCard && "block border border-muted rounded-lg mb-3 p-3 hover:shadow-sm",
          className
        )}
        {...props}
      />
    )
  }
)
TableRow.displayName = "TableRow"

interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  hideOnMobile?: boolean
}

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, hideOnMobile = false, ...props }, ref) => {
    const isMobile = useIsMobile()
    
    if (isMobile && hideOnMobile) {
      return null
    }
    
    return (
      <th
        ref={ref}
        className={cn(
          "text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
          isMobile ? "h-10 px-2 text-xs" : "h-12 px-4",
          className
        )}
        {...props}
      />
    )
  }
)
TableHead.displayName = "TableHead"

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  hideOnMobile?: boolean
  mobileLabel?: string
  mobileCard?: boolean
}

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, hideOnMobile = false, mobileLabel, mobileCard = false, children, ...props }, ref) => {
    const isMobile = useIsMobile()
    
    if (isMobile && hideOnMobile) {
      return null
    }
    
    return (
      <td
        ref={ref}
        className={cn(
          "align-middle [&:has([role=checkbox])]:pr-0",
          isMobile ? (
            mobileCard 
              ? "block py-1 px-0 border-0" 
              : "p-2 text-xs"
          ) : "p-4",
          className
        )}
        {...props}
      >
        {isMobile && mobileCard && mobileLabel && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-muted-foreground">
              {mobileLabel}:
            </span>
            <span className="text-sm">{children}</span>
          </div>
        )}
        {(!isMobile || !mobileCard) && children}
      </td>
    )
  }
)
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}