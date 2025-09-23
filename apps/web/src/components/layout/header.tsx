"use client"

import * as React from "react"
import Link from "next/link"
import { 
  Bell, 
  ChevronDown, 
  LogOut, 
  Menu, 
  Search, 
  Settings, 
  User, 
  Building2
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface User {
  id: string
  email: string
  name: string
  avatar?: string
}

interface Workspace {
  id: string
  name: string
  plan: string
  role: string
}

interface HeaderProps {
  user?: User
  workspace?: Workspace
  onMenuToggle?: () => void
  showMobileMenu?: boolean
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

export const Header = React.forwardRef<HTMLElement, HeaderProps>(
  ({ user, workspace, onMenuToggle, showMobileMenu = false, className }, ref) => {
    const [showUserMenu, setShowUserMenu] = React.useState(false)
    const [showWorkspaceMenu, setShowWorkspaceMenu] = React.useState(false)
    const [showNotifications, setShowNotifications] = React.useState(false)
    const isMobile = useIsMobile()

    // Close menus when clicking outside on mobile
    React.useEffect(() => {
      if (isMobile) {
        const handleClickOutside = (event: MouseEvent) => {
          const target = event.target as Element
          if (!target.closest('[data-menu]')) {
            setShowUserMenu(false)
            setShowWorkspaceMenu(false)
            setShowNotifications(false)
          }
        }

        document.addEventListener('click', handleClickOutside)
        return () => document.removeEventListener('click', handleClickOutside)
      }
    }, [isMobile])

    // Prevent body scroll when mobile menus are open
    React.useEffect(() => {
      if (isMobile && (showUserMenu || showWorkspaceMenu || showNotifications)) {
        document.body.style.overflow = 'hidden'
        return () => {
          document.body.style.overflow = 'unset'
        }
      }
    }, [isMobile, showUserMenu, showWorkspaceMenu, showNotifications])

    return (
      <header
        ref={ref}
        className={cn(
          "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
          className
        )}
      >
        <div className="flex h-16 items-center px-4 md:px-6">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "md:hidden touch-manipulation",
              isMobile && "h-12 w-12"
            )}
            onClick={onMenuToggle}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>

          {/* Logo and workspace selector */}
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue text-white">
                <span className="text-sm font-bold">A</span>
              </div>
              <span className="hidden font-semibold sm:inline-block">
                Affilitics
              </span>
            </Link>

            {workspace && (
              <div className="relative" data-menu>
                <Button
                  variant="ghost"
                  className="h-8 gap-2 px-2 text-left"
                  onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
                >
                  <Building2 className="h-4 w-4" />
                  <div className="hidden md:block">
                    <div className="text-sm font-medium">{workspace.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {workspace.plan} • {workspace.role}
                    </div>
                  </div>
                  <ChevronDown className="h-3 w-3" />
                </Button>

                {showWorkspaceMenu && (
                  <div className={cn(
                    "absolute top-full z-50 mt-2 rounded-lg border bg-popover shadow-lg",
                    isMobile ? "left-0 right-0 mx-4 p-2" : "left-0 w-64 p-2"
                  )}>
                    <div className="space-y-1">
                      <div className="px-2 py-1.5">
                        <div className="font-medium truncate">{workspace.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {workspace.plan} plan • {workspace.role}
                        </div>
                      </div>
                      <div className="h-px bg-border" />
                      <Button 
                        variant="ghost" 
                        className={cn(
                          "w-full justify-start touch-manipulation",
                          isMobile && "min-h-[44px]"
                        )} 
                        size={isMobile ? "default" : "sm"}
                      >
                        <Settings className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="truncate">Workspace Settings</span>
                      </Button>
                      <Button 
                        variant="ghost" 
                        className={cn(
                          "w-full justify-start touch-manipulation",
                          isMobile && "min-h-[44px]"
                        )} 
                        size={isMobile ? "default" : "sm"}
                      >
                        <Building2 className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="truncate">Switch Workspace</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Search bar */}
          <div className={cn(
            "flex-1",
            isMobile ? "mx-2" : "mx-4 md:mx-6"
          )}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={isMobile ? "Search..." : "Search campaigns, links, metrics..."}
                className={cn(
                  "w-full pl-10 touch-manipulation",
                  isMobile ? "h-10" : "max-w-sm"
                )}
              />
            </div>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div className="relative" data-menu>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowNotifications(!showNotifications)}
                className={cn(
                  "touch-manipulation",
                  isMobile && "h-12 w-12"
                )}
              >
                <Bell className="h-5 w-5" />
                <Badge 
                  variant="destructive" 
                  className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs"
                >
                  3
                </Badge>
              </Button>

              {showNotifications && (
                <div className={cn(
                  "absolute top-full z-50 mt-2 rounded-lg border bg-popover shadow-lg",
                  isMobile ? "left-0 right-0 mx-4 p-3" : "right-0 w-80 p-4"
                )}>
                  <div className={cn(
                    "flex items-center justify-between",
                    isMobile ? "mb-2" : "mb-3"
                  )}>
                    <h3 className="font-semibold">Notifications</h3>
                    <Badge variant="secondary">3 new</Badge>
                  </div>
                  <div className={cn(
                    isMobile ? "space-y-2" : "space-y-3"
                  )}>
                    <div className={cn(
                      "rounded-lg border",
                      isMobile ? "p-2" : "p-3"
                    )}>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 h-2 w-2 rounded-full bg-brand-blue flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "font-medium",
                            isMobile ? "text-xs" : "text-sm"
                          )}>
                            Campaign performance alert
                          </p>
                          <p className={cn(
                            "text-muted-foreground line-clamp-2",
                            isMobile ? "text-xs" : "text-xs"
                          )}>
                            Your "Summer Sale" campaign has exceeded target conversion rate
                          </p>
                          <p className="text-xs text-muted-foreground">2 minutes ago</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-center">
                      <Button 
                        variant="ghost" 
                        size={isMobile ? "sm" : "sm"}
                        className={cn(
                          "touch-manipulation",
                          isMobile && "min-h-[44px]"
                        )}
                      >
                        View all notifications
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* User menu */}
            {user && (
              <div className="relative" data-menu>
                <Button
                  variant="ghost"
                  className={cn(
                    "rounded-full touch-manipulation",
                    isMobile ? "h-12 w-12" : "h-8 w-8"
                  )}
                  onClick={() => setShowUserMenu(!showUserMenu)}
                >
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className={cn(
                        "rounded-full",
                        isMobile ? "h-10 w-10" : "h-8 w-8"
                      )}
                    />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </Button>

                {showUserMenu && (
                  <div className={cn(
                    "absolute top-full z-50 mt-2 rounded-lg border bg-popover p-2 shadow-lg",
                    isMobile ? "right-0 left-0 mx-4 w-auto" : "right-0 w-56"
                  )}>
                    <div className="px-2 py-1.5">
                      <div className="font-medium truncate">{user.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                    </div>
                    <div className="h-px bg-border my-1" />
                    <div className="space-y-1">
                      <Button 
                        variant="ghost" 
                        className={cn(
                          "w-full justify-start touch-manipulation",
                          isMobile && "h-11"
                        )}
                        size={isMobile ? "default" : "sm"}
                      >
                        <User className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="truncate">Profile</span>
                      </Button>
                      <Button 
                        variant="ghost" 
                        className={cn(
                          "w-full justify-start touch-manipulation",
                          isMobile && "h-11"
                        )}
                        size={isMobile ? "default" : "sm"}
                      >
                        <Settings className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="truncate">Settings</span>
                      </Button>
                      <div className="h-px bg-border my-1" />
                      <Button 
                        variant="ghost" 
                        className={cn(
                          "w-full justify-start text-destructive touch-manipulation",
                          isMobile && "h-11"
                        )}
                        size={isMobile ? "default" : "sm"}
                      >
                        <LogOut className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="truncate">Sign out</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
    )
  }
)
Header.displayName = "Header"