"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Building2,
  Calendar,
  ChevronDown,
  Database,
  ExternalLink,
  FileText,
  Home,
  Link as LinkIcon,
  PieChart,
  Settings,
  Target,
  TrendingUp,
  Users,
  Zap,
  X
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface NavigationItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  children?: NavigationItem[]
}

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
  workspace?: {
    name: string
    plan: string
    usage?: {
      campaigns: number
      maxCampaigns: number
      links: number
      maxLinks: number
    }
  }
  className?: string
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

const navigationItems: NavigationItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: Home,
  },
  {
    title: "Campaigns",
    href: "/campaigns",
    icon: Target,
    children: [
      { title: "All Campaigns", href: "/campaigns", icon: Target },
      { title: "Create Campaign", href: "/campaigns/create", icon: Target },
      { title: "Templates", href: "/campaigns/templates", icon: FileText },
    ]
  },
  {
    title: "Links",
    href: "/links",
    icon: LinkIcon,
    children: [
      { title: "All Links", href: "/links", icon: LinkIcon },
      { title: "Create Link", href: "/links/create", icon: LinkIcon },
      { title: "Bulk Import", href: "/links/import", icon: Database },
    ]
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    children: [
      { title: "Overview", href: "/analytics", icon: BarChart3 },
      { title: "Performance", href: "/analytics/performance", icon: TrendingUp },
      { title: "Conversions", href: "/analytics/conversions", icon: PieChart },
      { title: "Geography", href: "/analytics/geography", icon: BarChart3 },
    ]
  },
  {
    title: "Reports",
    href: "/reports",
    icon: FileText,
  },
  {
    title: "Events",
    href: "/events",
    icon: Calendar,
    badge: "New"
  },
  {
    title: "Integrations",
    href: "/integrations",
    icon: Zap,
  },
  {
    title: "Team",
    href: "/team",
    icon: Users,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
]

const NavItem = ({ 
  item, 
  isActive, 
  level = 0,
  onItemClick
}: { 
  item: NavigationItem
  isActive: boolean
  level?: number
  onItemClick?: () => void
}) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const hasChildren = item.children && item.children.length > 0
  const pathname = usePathname()
  const isMobile = useIsMobile()

  React.useEffect(() => {
    if (hasChildren) {
      const hasActiveChild = item.children!.some(child => 
        pathname === child.href || pathname.startsWith(child.href + '/')
      )
      setIsOpen(hasActiveChild)
    }
  }, [pathname, hasChildren, item.children])

  const ItemContent = () => (
    <>
      <div className="flex items-center gap-3">
        <item.icon className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 truncate">{item.title}</span>
        {item.badge && (
          <Badge variant="brand" size="sm">
            {item.badge}
          </Badge>
        )}
        {hasChildren && (
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        )}
      </div>
    </>
  )

  if (hasChildren) {
    return (
      <div>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start px-3 transition-colors",
            // Larger touch targets on mobile
            isMobile ? "h-12" : "h-9",
            level > 0 && "ml-4 w-[calc(100%-1rem)]",
            isActive && "bg-accent text-accent-foreground"
          )}
          onClick={() => setIsOpen(!isOpen)}
        >
          <ItemContent />
        </Button>
        {isOpen && (
          <div className="mt-1 space-y-1">
            {item.children!.map((child) => {
              const childActive = pathname === child.href || 
                (child.href !== '/dashboard' && pathname.startsWith(child.href + '/'))
              
              return (
                <Link key={child.href} href={child.href} onClick={isMobile ? onItemClick : undefined}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start px-3 ml-6 w-[calc(100%-1.5rem)] text-sm transition-colors",
                      // Larger touch targets on mobile
                      isMobile ? "h-11" : "h-8",
                      childActive && "bg-accent text-accent-foreground"
                    )}
                  >
                    <child.icon className="mr-3 h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{child.title}</span>
                    {child.badge && (
                      <Badge variant="brand" size="sm" className="ml-auto flex-shrink-0">
                        {child.badge}
                      </Badge>
                    )}
                  </Button>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link href={item.href} onClick={isMobile ? onItemClick : undefined}>
      <Button
        variant="ghost"
        className={cn(
          "w-full justify-start px-3 transition-colors",
          // Larger touch targets on mobile
          isMobile ? "h-12" : "h-9",
          level > 0 && "ml-4 w-[calc(100%-1rem)]",
          isActive && "bg-accent text-accent-foreground"
        )}
      >
        <ItemContent />
      </Button>
    </Link>
  )
}

export const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ isOpen = true, onClose, workspace, className }, ref) => {
    const pathname = usePathname()
    const isMobile = useIsMobile()

    // Close sidebar on mobile when clicking outside
    React.useEffect(() => {
      if (isMobile && isOpen) {
        const handleEscape = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            onClose?.()
          }
        }
        
        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
      }
    }, [isMobile, isOpen, onClose])

    // Prevent body scroll when mobile sidebar is open
    React.useEffect(() => {
      if (isMobile && isOpen) {
        document.body.style.overflow = 'hidden'
        return () => {
          document.body.style.overflow = 'unset'
        }
      }
    }, [isMobile, isOpen])

    return (
      <>
        {/* Mobile overlay */}
        {isMobile && isOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
            onClick={onClose}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onClose?.()
              }
            }}
            aria-label="Close sidebar"
          />
        )}

        {/* Sidebar */}
        <aside
          ref={ref}
          className={cn(
            "fixed left-0 z-50 w-64 border-r bg-background transition-all duration-300 ease-in-out",
            // Mobile: Full height overlay drawer
            isMobile ? [
              "top-0 h-full",
              isOpen ? "translate-x-0" : "-translate-x-full"
            ] : [
              // Desktop: Fixed sidebar
              "top-16 h-[calc(100vh-4rem)] translate-x-0"
            ],
            className
          )}
          role="navigation"
          aria-label="Main navigation"
        >
          <div className="flex h-full flex-col">
            {/* Mobile close button */}
            {isMobile && (
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue text-white">
                    <span className="text-sm font-bold">A</span>
                  </div>
                  <span className="font-semibold">Affilitics</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8"
                  aria-label="Close navigation"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            
            {/* Workspace info */}
            {workspace && (
              <div className="border-b p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue text-white">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{workspace.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {workspace.plan} Plan
                    </div>
                  </div>
                </div>

                {workspace.usage && (
                  <div className="mt-3 space-y-2">
                    <div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Campaigns</span>
                        <span>
                          {workspace.usage.campaigns}/{workspace.usage.maxCampaigns}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-brand-blue transition-all"
                          style={{ 
                            width: `${(workspace.usage.campaigns / workspace.usage.maxCampaigns) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Links</span>
                        <span>
                          {workspace.usage.links}/{workspace.usage.maxLinks}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-brand-blue transition-all"
                          style={{ 
                            width: `${(workspace.usage.links / workspace.usage.maxLinks) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <nav className={cn(
              "flex-1 overflow-y-auto scrollbar-thin",
              // Mobile spacing optimization
              isMobile ? "space-y-1 p-3" : "space-y-1 p-4"
            )}>
              {navigationItems.map((item) => {
                const isActive = pathname === item.href || 
                  (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
                
                return (
                  <NavItem 
                    key={item.href} 
                    item={item} 
                    isActive={isActive}
                    onItemClick={isMobile ? onClose : undefined}
                  />
                )
              })}
            </nav>

            {/* Footer */}
            <div className={cn(
              "border-t",
              isMobile ? "p-3" : "p-4"
            )}>
              <Button 
                variant="ghost" 
                size={isMobile ? "default" : "sm"} 
                className={cn(
                  "w-full justify-start transition-colors",
                  isMobile && "h-12"
                )}
                onClick={isMobile ? onClose : undefined}
              >
                <ExternalLink className="mr-2 h-4 w-4 flex-shrink-0" />
                <span className="truncate">Help & Support</span>
              </Button>
            </div>
          </div>
        </aside>
      </>
    )
  }
)
Sidebar.displayName = "Sidebar"