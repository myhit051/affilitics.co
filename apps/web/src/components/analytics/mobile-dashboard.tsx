"use client"

import * as React from "react"
import { 
  TrendingUp, 
  DollarSign, 
  ShoppingCart, 
  Target,
  ChevronRight,
  Activity,
  BarChart3
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MobileMetricCard, useResponsive } from "./responsive-grid"
import { useOverviewAnalytics } from "@/lib/hooks/use-analytics"

interface MobileDashboardProps {
  workspaceId: string
  onViewDetails?: (metric: string) => void
}

export function MobileDashboard({ 
  workspaceId, 
  onViewDetails 
}: MobileDashboardProps) {
  const { isMobile } = useResponsive()
  const { data, loading, error } = useOverviewAnalytics({
    workspaceId,
    timeRange: "30d"
  })

  if (!isMobile) return null

  const quickMetrics = [
    {
      id: 'revenue',
      title: 'Total Revenue',
      value: data ? `$${data.totalRevenue.value.toLocaleString()}` : '$0',
      trend: data?.totalRevenue.change ? {
        value: data.totalRevenue.change.value,
        direction: data.totalRevenue.change.type === 'increase' ? 'up' as const : 
                  data.totalRevenue.change.type === 'decrease' ? 'down' as const : 
                  'flat' as const
      } : undefined,
      icon: <DollarSign className="h-4 w-4" />,
      subtitle: 'Last 30 days'
    },
    {
      id: 'orders',
      title: 'Orders',
      value: data?.totalOrders.value || 0,
      trend: data?.totalOrders.change ? {
        value: data.totalOrders.change.value,
        direction: data.totalOrders.change.type === 'increase' ? 'up' as const : 
                  data.totalOrders.change.type === 'decrease' ? 'down' as const : 
                  'flat' as const
      } : undefined,
      icon: <ShoppingCart className="h-4 w-4" />,
      subtitle: 'This month'
    },
    {
      id: 'commission',
      title: 'Commission',
      value: data ? `$${data.totalCommission.value.toLocaleString()}` : '$0',
      trend: data?.totalCommission.change ? {
        value: data.totalCommission.change.value,
        direction: data.totalCommission.change.type === 'increase' ? 'up' as const : 
                  data.totalCommission.change.type === 'decrease' ? 'down' as const : 
                  'flat' as const
      } : undefined,
      icon: <TrendingUp className="h-4 w-4" />,
      subtitle: 'Earned this month'
    },
    {
      id: 'conversion',
      title: 'Conversion',
      value: data ? `${data.conversionRate.value}%` : '0%',
      trend: data?.conversionRate.change ? {
        value: data.conversionRate.change.value,
        direction: data.conversionRate.change.type === 'increase' ? 'up' as const : 
                  data.conversionRate.change.type === 'decrease' ? 'down' as const : 
                  'flat' as const
      } : undefined,
      icon: <Target className="h-4 w-4" />,
      subtitle: 'Current rate'
    }
  ]

  const quickActions = [
    { 
      label: 'View Analytics', 
      icon: <BarChart3 className="h-4 w-4" />,
      action: () => onViewDetails?.('analytics')
    },
    { 
      label: 'Recent Orders', 
      icon: <ShoppingCart className="h-4 w-4" />,
      action: () => onViewDetails?.('orders')
    },
    { 
      label: 'Performance', 
      icon: <Activity className="h-4 w-4" />,
      action: () => onViewDetails?.('performance')
    }
  ]

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border rounded-lg p-4 space-y-2">
              <div className="h-3 w-20 bg-muted animate-pulse rounded" />
              <div className="h-6 w-16 bg-muted animate-pulse rounded" />
              <div className="h-2 w-24 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4">
      {/* Quick Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {quickMetrics.map((metric) => (
          <MobileMetricCard
            key={metric.id}
            title={metric.title}
            value={metric.value}
            subtitle={metric.subtitle}
            icon={metric.icon}
            trend={metric.trend}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onViewDetails?.(metric.id)}
          />
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>
            Access key features with one tap
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {quickActions.map((action, index) => (
            <Button
              key={index}
              variant="ghost"
              className="w-full justify-between h-12"
              onClick={action.action}
            >
              <div className="flex items-center gap-3">
                {action.icon}
                <span>{action.label}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Recent Activity Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Today's Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm">5 new orders</span>
            </div>
            <Badge variant="secondary">+12%</Badge>
          </div>
          
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-sm">$1,245 revenue</span>
            </div>
            <Badge variant="secondary">+8%</Badge>
          </div>
          
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
              <span className="text-sm">3.2% conversion</span>
            </div>
            <Badge variant="secondary">+0.3%</Badge>
          </div>
          
          <Button 
            variant="outline" 
            className="w-full mt-3"
            onClick={() => onViewDetails?.('recent')}
          >
            View Full Report
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}