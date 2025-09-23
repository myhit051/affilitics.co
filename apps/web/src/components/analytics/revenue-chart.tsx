"use client"

import * as React from "react"
import { 
  Area, 
  AreaChart, 
  ResponsiveContainer, 
  Tooltip, 
  XAxis, 
  YAxis,
  CartesianGrid 
} from "recharts"
import { CalendarDays, Download, TrendingUp, AlertCircle } from "lucide-react"
import { format } from "date-fns"
import { ChartContainer } from "./chart-container"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useRevenueAnalytics } from "@/lib/hooks/use-analytics"

interface RevenueChartProps {
  workspaceId: string
  timeRange?: '7d' | '30d' | '90d' | '1y'
}

export function RevenueChart({ 
  workspaceId, 
  timeRange = '30d' 
}: RevenueChartProps) {
  const [selectedMetric, setSelectedMetric] = React.useState<'revenue' | 'orders' | 'commission'>('revenue')
  
  const { data, loading, error, refetch } = useRevenueAnalytics({
    workspaceId,
    timeRange,
    refreshInterval: 5 * 60 * 1000 // Refresh every 5 minutes
  })

  const getMetricValue = (item: any) => {
    switch (selectedMetric) {
      case 'orders':
        return item.orders
      case 'commission':
        return item.commission
      default:
        return item.revenue
    }
  }

  const getMetricLabel = () => {
    switch (selectedMetric) {
      case 'orders':
        return 'Orders'
      case 'commission':
        return 'Commission ($)'
      default:
        return 'Revenue ($)'
    }
  }

  const getMetricColor = () => {
    switch (selectedMetric) {
      case 'orders':
        return '#10b981' // green
      case 'commission':
        return '#f59e0b' // yellow
      default:
        return '#3b82f6' // blue
    }
  }

  const formatTooltipValue = (value: number) => {
    if (selectedMetric === 'orders') {
      return `${value} orders`
    }
    return `$${value.toLocaleString()}`
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="rounded-lg border bg-background p-3 shadow-md">
          <p className="font-medium">{label}</p>
          <div className="mt-1 space-y-1">
            <p className="text-sm">
              <span className="text-muted-foreground">Revenue:</span> ${data.revenue.toLocaleString()}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Orders:</span> {data.orders}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Commission:</span> ${data.commission.toLocaleString()}
            </p>
          </div>
        </div>
      )
    }
    return null
  }

  const exportData = () => {
    if (!data) return
    
    const csvContent = [
      ['Date', 'Revenue', 'Orders', 'Commission'],
      ...data.map(item => [
        item.date,
        item.revenue,
        item.orders,
        item.commission
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revenue-data-${timeRange}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const actions = (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          variant={selectedMetric === 'revenue' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedMetric('revenue')}
        >
          Revenue
        </Button>
        <Button
          variant={selectedMetric === 'orders' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedMetric('orders')}
        >
          Orders
        </Button>
        <Button
          variant={selectedMetric === 'commission' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedMetric('commission')}
        >
          Commission
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={exportData}>
        <Download className="h-4 w-4 mr-2" />
        Export
      </Button>
    </div>
  )

  if (error) {
    return (
      <ChartContainer
        title="Revenue Trends"
        description="Track your revenue performance over time"
        actions={actions}
      >
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load revenue data. 
            <button 
              onClick={refetch}
              className="ml-2 underline hover:no-underline"
            >
              Try again
            </button>
          </AlertDescription>
        </Alert>
      </ChartContainer>
    )
  }

  if (loading) {
    return (
      <ChartContainer
        title="Revenue Trends"
        description="Track your revenue performance over time"
        actions={actions}
      >
        <div className="h-64 bg-muted animate-pulse rounded" />
      </ChartContainer>
    )
  }

  if (!data || data.length === 0) {
    return (
      <ChartContainer
        title="Revenue Trends"
        description="Track your revenue performance over time"
        actions={actions}
      >
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <div className="text-center">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">No revenue data available</p>
            <p className="text-xs mt-1">Data will appear once you have affiliate orders</p>
          </div>
        </div>
      </ChartContainer>
    )
  }

  return (
    <ChartContainer
      title="Revenue Trends"
      description={`${getMetricLabel()} over the last ${timeRange}`}
      actions={actions}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={getMetricColor()} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={getMetricColor()} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="date" 
              className="text-xs fill-muted-foreground"
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              className="text-xs fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => selectedMetric === 'orders' ? value : `$${value}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={selectedMetric}
              stroke={getMetricColor()}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div 
              className="h-3 w-3 rounded-full" 
              style={{ backgroundColor: getMetricColor() }}
            />
            <span className="text-muted-foreground">{getMetricLabel()}</span>
          </div>
          <Badge variant="secondary" className="gap-1">
            <TrendingUp className="h-3 w-3" />
            +12.3% vs last period
          </Badge>
        </div>
        
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          Last updated: {format(new Date(), 'MMM dd, HH:mm')}
        </div>
      </div>
    </ChartContainer>
  )
}