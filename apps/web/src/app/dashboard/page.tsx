"use client"

import { Suspense } from "react"
import { useWorkspace } from "@/contexts/workspace-context"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { 
  DashboardOverview, 
  RevenueChart, 
  PlatformPerformance, 
  RecentOrders,
  ImportStatus,
  QuickActions
} from "@/components/analytics"
import { RealTimeMetrics } from "@/components/analytics/real-time-metrics"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loading } from "@/components/ui/loading"

export default function DashboardPage() {
  const { currentWorkspace, user, isLoading, isAuthenticated } = useWorkspace()
  
  if (isLoading) {
    return <div>Loading...</div>
  }
  
  if (!isAuthenticated || !user || !currentWorkspace) {
    return <div>Please sign in to access the dashboard.</div>
  }
  
  const workspaceForLayout = {
    id: currentWorkspace.id,
    name: currentWorkspace.name,
    plan: currentWorkspace.plan,
    role: currentWorkspace.role,
    usage: {
      campaigns: 0, // Will be populated by actual data
      maxCampaigns: 50,
      links: 0,
      maxLinks: 1000
    }
  }
  
  const userForLayout = {
    id: user.id,
    email: user.email || '',
    name: (user as any).name || user.email || '',
    avatar: user.user_metadata?.avatar_url
  }
  
  return (
    <DashboardLayout user={userForLayout} workspace={workspaceForLayout}>
      <div className="space-y-4 md:space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              Welcome back! Here's what's happening with your affiliate marketing performance.
            </p>
          </div>
          <div className="flex-shrink-0">
            <QuickActions />
          </div>
        </div>

        {/* Overview Statistics */}
        <Suspense fallback={<DashboardOverviewSkeleton />}>
          <DashboardOverview workspaceId={currentWorkspace.id} />
        </Suspense>

        {/* Real-time Metrics */}
        <RealTimeMetrics workspaceId={currentWorkspace.id} />

        {/* Charts and Analytics Grid */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2 xl:grid-cols-7">
          {/* Revenue Chart - Takes up 4 columns on XL screens, full width on smaller */}
          <div className="lg:col-span-2 xl:col-span-4">
            <Suspense fallback={<ChartSkeleton />}>
              <RevenueChart workspaceId={currentWorkspace.id} />
            </Suspense>
          </div>

          {/* Platform Performance - Takes up 3 columns on XL screens, full width on smaller */}
          <div className="xl:col-span-3">
            <Suspense fallback={<ChartSkeleton />}>
              <PlatformPerformance workspaceId={currentWorkspace.id} />
            </Suspense>
          </div>
        </div>

        {/* Recent Activity and Import Status */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
          <Suspense fallback={<TableSkeleton />}>
            <RecentOrders workspaceId={currentWorkspace.id} />
          </Suspense>
          
          <Suspense fallback={<TableSkeleton />}>
            <ImportStatus workspaceId={currentWorkspace.id} />
          </Suspense>
        </div>
      </div>
    </DashboardLayout>
  )
}

// Loading skeletons
function DashboardOverviewSkeleton() {
  return (
    <div className="grid gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="h-4 w-4 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-6 md:h-8 w-32 bg-muted animate-pulse rounded mb-2" />
            <div className="h-3 w-20 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 md:h-6 w-32 md:w-48 bg-muted animate-pulse rounded mb-2" />
        <div className="h-3 md:h-4 w-48 md:w-64 bg-muted animate-pulse rounded" />
      </CardHeader>
      <CardContent>
        <div className="h-48 md:h-64 bg-muted animate-pulse rounded" />
      </CardContent>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 md:h-6 w-32 md:w-48 bg-muted animate-pulse rounded mb-2" />
        <div className="h-3 md:h-4 w-48 md:w-64 bg-muted animate-pulse rounded" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="h-4 w-24 md:w-32 bg-muted animate-pulse rounded" />
              <div className="h-4 w-16 md:w-20 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}