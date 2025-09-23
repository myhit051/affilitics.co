"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Header } from "./header"
import { Sidebar } from "./sidebar"

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
  usage?: {
    campaigns: number
    maxCampaigns: number
    links: number
    maxLinks: number
  }
}

interface DashboardLayoutProps {
  children: React.ReactNode
  user?: User
  workspace?: Workspace
  className?: string
}

export const DashboardLayout = React.forwardRef<HTMLDivElement, DashboardLayoutProps>(
  ({ children, user, workspace, className }, ref) => {
    const [sidebarOpen, setSidebarOpen] = React.useState(false)

    // Close sidebar when clicking outside on mobile
    React.useEffect(() => {
      const handleResize = () => {
        if (window.innerWidth >= 768) {
          setSidebarOpen(false)
        }
      }

      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
      <div ref={ref} className={cn("min-h-screen bg-background", className)}>
        {/* Header */}
        <Header
          user={user}
          workspace={workspace}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          showMobileMenu={sidebarOpen}
        />

        <div className="flex">
          {/* Sidebar */}
          <Sidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            workspace={workspace}
          />

          {/* Main content */}
          <main className="flex-1 md:ml-64">
            <div className="container mx-auto p-4 md:p-6 lg:p-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    )
  }
)
DashboardLayout.displayName = "DashboardLayout"

// Wrapper component for pages that need authentication
interface AuthenticatedLayoutProps extends DashboardLayoutProps {
  requireAuth?: boolean
  fallback?: React.ReactNode
}

export const AuthenticatedLayout: React.FC<AuthenticatedLayoutProps> = ({
  children,
  user,
  workspace,
  requireAuth = true,
  fallback,
  ...props
}) => {
  // If authentication is required but no user is provided, show fallback
  if (requireAuth && !user) {
    return fallback || <div>Please log in to access this page.</div>
  }

  return (
    <DashboardLayout user={user} workspace={workspace} {...props}>
      {children}
    </DashboardLayout>
  )
}