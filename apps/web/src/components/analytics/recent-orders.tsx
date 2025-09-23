"use client"

import * as React from "react"
import { MoreHorizontal, ExternalLink, Eye, AlertCircle } from "lucide-react"
import { format } from "date-fns"
import { ChartContainer } from "./chart-container"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { useRecentOrdersAnalytics } from "@/lib/hooks/use-analytics"

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'completed':
      return <Badge variant="default" className="bg-green-100 text-green-800">Completed</Badge>
    case 'pending':
      return <Badge variant="secondary">Pending</Badge>
    case 'processing':
      return <Badge variant="outline" className="border-blue-200 text-blue-800">Processing</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

const getPlatformColor = (platform: string) => {
  switch (platform) {
    case 'Shopee':
      return 'bg-orange-100 text-orange-800'
    case 'Lazada':
      return 'bg-blue-100 text-blue-800'
    case 'TikTok':
      return 'bg-pink-100 text-pink-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

interface RecentOrdersProps {
  workspaceId: string
}

export function RecentOrders({ workspaceId }: RecentOrdersProps) {
  const { data: orders, loading, error, refetch } = useRecentOrdersAnalytics({
    workspaceId,
    limit: 6
  })

  const actions = (
    <Button variant="outline" size="sm">
      <Eye className="h-4 w-4 mr-2" />
      View All
    </Button>
  )

  if (error) {
    return (
      <ChartContainer
        title="Recent Orders"
        description="Latest affiliate orders from all platforms"
        actions={actions}
      >
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load recent orders. 
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
        title="Recent Orders"
        description="Latest affiliate orders from all platforms"
        actions={actions}
      >
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center py-2">
              <div className="space-y-1">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
              </div>
              <div className="text-right space-y-1">
                <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                <div className="h-3 w-16 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </ChartContainer>
    )
  }

  return (
    <ChartContainer
      title="Recent Orders"
      description="Latest affiliate orders from all platforms"
      actions={actions}
    >
      <div className="space-y-4">
        {!orders || orders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">No recent orders found</p>
            <p className="text-xs mt-1">Orders will appear here once you have affiliate sales</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.slice(0, 6).map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <div>
                    <div className="font-medium text-sm">{order.orderId}</div>
                    <div className="text-xs text-muted-foreground">{order.customer}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getPlatformColor(order.platform)}>
                    {order.platform}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">
                  ${order.amount.toFixed(2)}
                </TableCell>
                <TableCell className="text-green-600 font-medium">
                  ${order.commission.toFixed(2)}
                </TableCell>
                <TableCell>
                  {getStatusBadge(order.status)}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(order.date), 'MMM dd, HH:mm')}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {orders && orders.length > 6 && (
          <div className="text-center pt-2">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              View {orders.length - 6} more orders
            </Button>
          </div>
        )}
      </div>
    </ChartContainer>
  )
}