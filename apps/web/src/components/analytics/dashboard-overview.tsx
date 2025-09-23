"use client"

import * as React from "react"
import { DollarSign, ShoppingCart, TrendingUp, Target, AlertCircle } from "lucide-react"
import { MetricCard } from "./metric-card"
import { useOverviewAnalytics } from "@/lib/hooks/use-analytics"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface DashboardOverviewProps {
  workspaceId: string
  timeRange?: '7d' | '30d' | '90d' | '1y'
}

export function DashboardOverview({ 
  workspaceId, 
  timeRange = "30d" 
}: DashboardOverviewProps) {
  const { data, loading, error, refetch } = useOverviewAnalytics({
    workspaceId,
    timeRange,
    refreshInterval: 5 * 60 * 1000 // Refresh every 5 minutes
  })

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load overview data. 
          <button 
            onClick={refetch}
            className="ml-2 underline hover:no-underline"
          >
            Try again
          </button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-3 grid-cols-2 md:gap-4 lg:grid-cols-4">
      <MetricCard
        title="Total Revenue"
        value={data ? `$${data.totalRevenue.value.toLocaleString()}` : "$0"}
        change={data?.totalRevenue.change as any}
        icon={<DollarSign className="h-4 w-4" />}
        loading={loading}
      />
      
      <MetricCard
        title="Total Orders"
        value={data?.totalOrders.value || 0}
        change={data?.totalOrders.change as any}
        icon={<ShoppingCart className="h-4 w-4" />}
        loading={loading}
      />
      
      <MetricCard
        title="Commission Earned"
        value={data ? `$${data.totalCommission.value.toLocaleString()}` : "$0"}
        change={data?.totalCommission.change as any}
        icon={<TrendingUp className="h-4 w-4" />}
        loading={loading}
      />
      
      <MetricCard
        title="Conversion Rate"
        value={data ? `${data.conversionRate.value}%` : "0%"}
        change={data?.conversionRate.change as any}
        icon={<Target className="h-4 w-4" />}
        loading={loading}
      />
    </div>
  )
}