import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@aff/db'
import { startOfDay, subDays } from 'date-fns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    const timeRange = searchParams.get('timeRange') || '30d'

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      )
    }

    // Calculate date range
    const today = startOfDay(new Date())
    const days = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : timeRange === '1y' ? 365 : 30
    const startDate = subDays(today, days)

    // Get current period platform performance
    const currentPeriodOrders = await prisma.affiliateOrder.groupBy({
      by: ['platform'],
      where: {
        workspaceId,
        eventDate: {
          gte: startDate,
          lte: today
        }
      },
      _sum: {
        amount: true,
        commission: true
      },
      _count: {
        id: true
      }
    })

    // Get previous period for comparison
    const previousStartDate = subDays(startDate, days)
    const previousPeriodOrders = await prisma.affiliateOrder.groupBy({
      by: ['platform'],
      where: {
        workspaceId,
        eventDate: {
          gte: previousStartDate,
          lt: startDate
        }
      },
      _sum: {
        amount: true,
        commission: true
      },
      _count: {
        id: true
      }
    })

    // Calculate total revenue for percentage calculation
    const totalRevenue = currentPeriodOrders.reduce((sum: number, platform: any) => 
      sum + (platform._sum.amount ? Number(platform._sum.amount) : 0), 0
    )

    // Platform colors mapping
    const platformColors: Record<string, string> = {
      'Shopee': '#ee4d2d',
      'Lazada': '#0f146d',
      'TikTok': '#fe2c55',
      'Amazon': '#ff9900',
      'Tokopedia': '#42b549'
    }

    // Prepare response data
    const platformData = currentPeriodOrders.map((platform: any) => {
      const revenue = platform._sum.amount ? Number(platform._sum.amount) : 0
      const commission = platform._sum.commission ? Number(platform._sum.commission) : 0
      const orders = platform._count.id

      // Find previous period data for comparison
      const previousData = previousPeriodOrders.find((p: any) => p.platform === platform.platform)
      const previousRevenue = previousData?._sum.amount ? Number(previousData._sum.amount) : 0
      
      // Calculate change percentage
      const change = previousRevenue > 0 
        ? ((revenue - previousRevenue) / previousRevenue) * 100
        : revenue > 0 ? 100 : 0

      return {
        name: platform.platform,
        value: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 100 * 10) / 10 : 0,
        revenue: Math.round(revenue * 100) / 100,
        commission: Math.round(commission * 100) / 100,
        orders,
        change: Math.round(change * 10) / 10,
        color: platformColors[platform.platform] || '#6b7280'
      }
    })

    // Sort by revenue descending
    platformData.sort((a: any, b: any) => b.revenue - a.revenue)

    return NextResponse.json(platformData)
  } catch (error) {
    console.error('Platform analytics error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}