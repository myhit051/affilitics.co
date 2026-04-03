"use client"

import * as React from "react"
import { Activity, Users, DollarSign, TrendingUp } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface RealTimeMetric {
  id: string
  label: string
  value: string | number
  change: number
  timestamp: string
  status: 'up' | 'down' | 'stable'
}

interface RealTimeMetricsProps {
  workspaceId: string
  className?: string
}

// Mock real-time data generator
const generateRealTimeMetrics = (): RealTimeMetric[] => {
  const now = new Date().toISOString()
  
  return [
    {
      id: 'active-visitors',
      label: 'Active Visitors',
      value: Math.floor(45 + Math.random() * 20),
      change: (Math.random() - 0.5) * 10,
      timestamp: now,
      status: Math.random() > 0.5 ? 'up' : 'down'
    },
    {
      id: 'orders-today',
      label: 'Orders Today',
      value: Math.floor(28 + Math.random() * 15),
      change: (Math.random() - 0.2) * 8,
      timestamp: now,
      status: Math.random() > 0.3 ? 'up' : 'stable'
    },
    {
      id: 'revenue-today',
      label: 'Revenue Today',
      value: `$${(1200 + Math.random() * 800).toFixed(0)}`,
      change: (Math.random() - 0.1) * 12,
      timestamp: now,
      status: Math.random() > 0.4 ? 'up' : 'down'
    },
    {
      id: 'conversion-rate',
      label: 'Live Conversion Rate',
      value: `${(3.2 + (Math.random() - 0.5) * 1.5).toFixed(2)}%`,
      change: (Math.random() - 0.5) * 5,
      timestamp: now,
      status: Math.random() > 0.6 ? 'up' : 'stable'
    }
  ]
}

export function RealTimeMetrics({ workspaceId, className }: RealTimeMetricsProps) {
  const [metrics, setMetrics] = React.useState<RealTimeMetric[]>([])
  const [isLive, setIsLive] = React.useState(true)

  // Simulate real-time updates
  React.useEffect(() => {
    if (!isLive) return

    const updateMetrics = () => {
      setMetrics(generateRealTimeMetrics())
    }

    // Initial load
    updateMetrics()

    // Update every 10 seconds
    const interval = setInterval(updateMetrics, 10000)

    return () => clearInterval(interval)
  }, [isLive, workspaceId])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'up':
        return 'text-green-600'
      case 'down':
        return 'text-red-600'
      default:
        return 'text-muted-foreground'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'up':
        return '↗'
      case 'down':
        return '↘'
      default:
        return '→'
    }
  }

  const getIcon = (id: string) => {
    switch (id) {
      case 'active-visitors':
        return <Users className="h-4 w-4" />
      case 'orders-today':
        return <Activity className="h-4 w-4" />
      case 'revenue-today':
        return <DollarSign className="h-4 w-4" />
      case 'conversion-rate':
        return <TrendingUp className="h-4 w-4" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <div className={cn(
              "h-2 w-2 rounded-full transition-colors",
              isLive ? "bg-green-500 animate-pulse" : "bg-gray-400"
            )} />
            Real-Time Metrics
          </CardTitle>
          <CardDescription>
            Live performance indicators updated every 10 seconds
          </CardDescription>
        </div>
        <button
          onClick={() => setIsLive(!isLive)}
          className={cn(
            "text-xs px-2 py-1 rounded border transition-colors",
            isLive 
              ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" 
              : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
          )}
        >
          {isLive ? 'LIVE' : 'PAUSED'}
        </button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <div key={metric.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground font-medium">
                  {metric.label}
                </div>
                {getIcon(metric.id)}
              </div>
              
              <div className="flex items-baseline gap-2">
                <div className="text-xl font-bold">
                  {metric.value}
                </div>
                <div className={cn(
                  "text-xs font-medium flex items-center gap-1",
                  getStatusColor(metric.status)
                )}>
                  <span>{getStatusIcon(metric.status)}</span>
                  <span>
                    {metric.change > 0 ? '+' : ''}{metric.change.toFixed(1)}%
                  </span>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground">
                Updated: {new Date(metric.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>

        {!isLive && (
          <div className="mt-4 p-3 bg-muted rounded-lg text-center text-sm text-muted-foreground">
            Real-time updates paused. Click "PAUSED" to resume live monitoring.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// WebSocket hook for real Supabase real-time subscriptions
export function useSupabaseRealtime(workspaceId: string) {
  const [data, setData] = React.useState<any>(null)
  const [isConnected, setIsConnected] = React.useState(false)

  React.useEffect(() => {
    // In a real implementation, you would use Supabase realtime:
    /*
    const supabase = createClientComponentClient()
    
    const subscription = supabase
      .channel(`workspace-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'affiliate_orders',
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload) => {
          // Handle new order
          setData(prev => ({ ...prev, newOrder: payload.new }))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'import_jobs',
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload) => {
          // Handle import job updates
          setData(prev => ({ ...prev, jobUpdate: payload.new }))
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      subscription.unsubscribe()
    }
    */

    // Mock connection for demo
    setIsConnected(true)
    return () => setIsConnected(false)
  }, [workspaceId])

  return { data, isConnected }
}