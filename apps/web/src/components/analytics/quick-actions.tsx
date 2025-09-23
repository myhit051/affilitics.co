"use client"

import * as React from "react"
import { useRouter, useParams } from "next/navigation"
import { 
  Plus, 
  Upload, 
  Download, 
  BarChart3, 
  Settings,
  RefreshCw,
  MoreVertical
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

export function QuickActions() {
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const isMobile = useIsMobile()
  const router = useRouter()
  const params = useParams()

  const handleRefresh = async () => {
    setIsRefreshing(true)
    // Simulate refresh delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    setIsRefreshing(false)
  }

  return (
    <div className={cn(
      "flex items-center",
      isMobile ? "gap-1" : "gap-2"
    )}>
      {/* Refresh button - always visible but mobile optimized */}
      <Button 
        variant="outline" 
        size={isMobile ? "default" : "sm"}
        onClick={handleRefresh} 
        disabled={isRefreshing}
        className={cn(
          "touch-manipulation",
          isMobile && "min-h-[44px] px-3"
        )}
      >
        <RefreshCw className={cn(
          isRefreshing ? 'animate-spin' : '',
          isMobile ? "h-4 w-4" : "h-4 w-4 mr-2"
        )} />
        {!isMobile && "Refresh"}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            size={isMobile ? "default" : "sm"}
            className={cn(
              "touch-manipulation",
              isMobile && "min-h-[44px] px-3"
            )}
          >
            {isMobile ? (
              <MoreVertical className="h-4 w-4" />
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Quick Actions
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="end" 
          className={cn(
            isMobile ? "w-56" : "w-48"
          )}
        >
          <DropdownMenuItem 
            className={cn(
              "touch-manipulation cursor-pointer",
              isMobile && "h-11 text-base"
            )}
            onClick={() => {
              const workspaceId = params.id
              router.push(`/workspace/${workspaceId}/import`)
            }}
          >
            <Upload className="h-4 w-4 mr-3 flex-shrink-0" />
            <span className="truncate">Import Data</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={cn(
            "touch-manipulation",
            isMobile && "h-11 text-base"
          )}>
            <Plus className="h-4 w-4 mr-3 flex-shrink-0" />
            <span className="truncate">New Campaign</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={cn(
            "touch-manipulation",
            isMobile && "h-11 text-base"
          )}>
            <BarChart3 className="h-4 w-4 mr-3 flex-shrink-0" />
            <span className="truncate">Generate Report</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={cn(
            "touch-manipulation",
            isMobile && "h-11 text-base"
          )}>
            <Download className="h-4 w-4 mr-3 flex-shrink-0" />
            <span className="truncate">Export Data</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={cn(
            "touch-manipulation",
            isMobile && "h-11 text-base"
          )}>
            <Settings className="h-4 w-4 mr-3 flex-shrink-0" />
            <span className="truncate">Settings</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}