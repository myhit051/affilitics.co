import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
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
import { Card, CardContent, CardHeader } from "@/components/ui/card"

interface Props {
  params: {
    id: string
  }
}

export default async function WorkspaceDashboardPage({ params }: Props) {
  const supabase = createClient()
  
  // Security: Get authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user) {
    redirect('/login')
  }

  // Security: Verify user has access to this workspace
  const { data: membership, error: membershipError } = await supabase
    .from('members')
    .select(`
      id,
      role,
      workspace:workspaces(
        id,
        name,
        plan,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .eq('workspace_id', params.id)
    .single()

  if (membershipError || !membership) {
    redirect('/workspaces')
  }

  // Prepare user and workspace data for components
  const userData = {
    id: user.id,
    email: user.email!,
    name: user.user_metadata?.full_name || user.email!,
    avatar: user.user_metadata?.avatar_url
  }

  const workspaceData = {
    id: (membership as any).workspace.id,
    name: (membership as any).workspace.name,
    plan: (membership as any).workspace.plan,
    role: (membership as any).role,
    usage: {
      campaigns: 12, // Mock data - replace with actual queries
      maxCampaigns: 50,
      links: 234,
      maxLinks: 1000
    }
  }

  return (
    <DashboardLayout user={userData} workspace={workspaceData}>
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
          <DashboardOverview workspaceId={params.id} />
        </Suspense>

        {/* Real-time Metrics */}
        <RealTimeMetrics workspaceId={params.id} />

        {/* Charts and Analytics Grid */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2 xl:grid-cols-7">
          {/* Revenue Chart - Takes up 4 columns on XL screens, full width on smaller */}
          <div className="lg:col-span-2 xl:col-span-4">
            <Suspense fallback={<ChartSkeleton />}>
              <RevenueChart workspaceId={params.id} />
            </Suspense>
          </div>

          {/* Platform Performance - Takes up 3 columns on XL screens, full width on smaller */}
          <div className="xl:col-span-3">
            <Suspense fallback={<ChartSkeleton />}>
              <PlatformPerformance workspaceId={params.id} />
            </Suspense>
          </div>
        </div>

        {/* Recent Activity and Import Status */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
          <Suspense fallback={<TableSkeleton />}>
            <RecentOrders workspaceId={params.id} />
          </Suspense>
          
          <Suspense fallback={<TableSkeleton />}>
            <ImportStatus workspaceId={params.id} />
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