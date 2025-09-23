"use client"

import * as React from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"
import { ChartContainer } from "./chart-container"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { TrendingUp, TrendingDown, AlertCircle, BarChart } from "lucide-react"
import { usePlatformAnalytics } from "@/lib/hooks/use-analytics"

interface PlatformPerformanceProps {
  workspaceId: string
  timeRange?: '7d' | '30d' | '90d' | '1y'
}

export function PlatformPerformance({ 
  workspaceId, 
  timeRange = "30d" 
}: PlatformPerformanceProps) {
  const { data, loading, error, refetch } = usePlatformAnalytics({
    workspaceId,
    timeRange,
    refreshInterval: 5 * 60 * 1000 // Refresh every 5 minutes
  })

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="rounded-lg border bg-background p-3 shadow-md">
          <p className="font-medium">{data.name}</p>
          <div className="mt-1 space-y-1">
            <p className="text-sm">
              <span className="text-muted-foreground">Share:</span> {data.value}%
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Revenue:</span> ${data.revenue.toLocaleString()}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Orders:</span> {data.orders}
            </p>
          </div>
        </div>
      )
    }
    return null
  }

  const CustomLegend = ({ payload }: any) => {
    if (!data) return null
    
    return (
      <div className="mt-4 space-y-2">
        {payload.map((entry: any, index: number) => {
          const platformData = data.find(d => d.name === entry.value)
          return (
            <div key={index} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div 
                  className="h-3 w-3 rounded-full" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="font-medium">{entry.value}</span>
                <span className="text-muted-foreground">{platformData?.value}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  ${platformData?.revenue.toLocaleString()}
                </span>
                <Badge 
                  variant={platformData && platformData.change > 0 ? "default" : "destructive"}
                  className="text-xs"
                >
                  {platformData && platformData.change > 0 ? (
                    <TrendingUp className="h-3 w-3 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-1" />
                  )}
                  {(platformData?.change ?? 0) > 0 ? '+' : ''}{platformData?.change ?? 0}%
                </Badge>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (error) {
    return (
      <ChartContainer
        title="Platform Performance"
        description="Revenue breakdown by platform"
      >
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load platform data. 
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
        title="Platform Performance"
        description="Revenue breakdown by platform"
      >
        <div className="h-64 bg-muted animate-pulse rounded" />
      </ChartContainer>
    )
  }

  if (!data || data.length === 0) {
    return (
      <ChartContainer
        title="Platform Performance"
        description="Revenue breakdown by platform"
      >
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <div className="text-center">
            <BarChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">No platform data available</p>
            <p className="text-xs mt-1">Data will appear once you have orders from different platforms</p>
          </div>
        </div>
      </ChartContainer>
    )
  }

  return (
    <ChartContainer
      title="Platform Performance"
      description="Revenue breakdown by platform"
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  )
}