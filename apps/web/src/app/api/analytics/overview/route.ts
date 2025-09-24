import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@aff/db'
import { startOfDay, subDays, format } from 'date-fns'
import { withAuth } from '@/lib/auth/production-auth'

export const GET = withAuth(async (request: NextRequest, { workspaceId }) => {
  try {
    const { searchParams } = new URL(request.url)

    const timeRange = searchParams.get('timeRange') || '30d'

    // Security: Validate time range parameter
    const validTimeRanges = ['7d', '30d', '90d', '1y']
    if (!validTimeRanges.includes(timeRange)) {
      return NextResponse.json(
        { error: 'Invalid time range. Must be one of: 7d, 30d, 90d, 1y' },
        { status: 400 }
      )
    }

    // Calculate date range
    const today = startOfDay(new Date())
    const days = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : timeRange === '1y' ? 365 : 30
    const startDate = subDays(today, days)

    // Get current period data
    const currentPeriodOrders = await prisma.affiliateOrder.findMany({
      where: {
        workspaceId,
        eventDate: {
          gte: startDate,
          lte: today
        }
      },
      select: {
        amount: true,
        commission: true,
        eventDate: true
      }
    })

    // Get previous period data for comparison
    const previousStartDate = subDays(startDate, days)
    const previousPeriodOrders = await prisma.affiliateOrder.findMany({
      where: {
        workspaceId,
        eventDate: {
          gte: previousStartDate,
          lt: startDate
        }
      },
      select: {
        amount: true,
        commission: true
      }
    })

    // Calculate current period metrics
    const totalRevenue = currentPeriodOrders.reduce((sum: number, order: any) => 
      sum + (order.amount ? Number(order.amount) : 0), 0
    )
    const totalCommission = currentPeriodOrders.reduce((sum: number, order: any) => 
      sum + (order.commission ? Number(order.commission) : 0), 0
    )
    const totalOrders = currentPeriodOrders.length

    // Calculate previous period metrics
    const previousRevenue = previousPeriodOrders.reduce((sum: number, order: any) => 
      sum + (order.amount ? Number(order.amount) : 0), 0
    )
    const previousCommission = previousPeriodOrders.reduce((sum: number, order: any) => 
      sum + (order.commission ? Number(order.commission) : 0), 0
    )
    const previousOrders = previousPeriodOrders.length

    // Calculate conversion rate (mock calculation - you'll need actual click/impression data)
    const conversionRate = totalOrders > 0 ? (totalOrders / (totalOrders * 25)) * 100 : 0
    const previousConversionRate = previousOrders > 0 ? (previousOrders / (previousOrders * 25)) * 100 : 0

    // Calculate percentage changes
    const revenueChange = previousRevenue > 0 
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 
      : totalRevenue > 0 ? 100 : 0

    const ordersChange = previousOrders > 0 
      ? ((totalOrders - previousOrders) / previousOrders) * 100 
      : totalOrders > 0 ? 100 : 0

    const commissionChange = previousCommission > 0 
      ? ((totalCommission - previousCommission) / previousCommission) * 100 
      : totalCommission > 0 ? 100 : 0

    const conversionChange = previousConversionRate > 0 
      ? ((conversionRate - previousConversionRate) / previousConversionRate) * 100 
      : conversionRate > 0 ? 100 : 0

    const getChangeType = (change: number) => 
      change > 0 ? 'increase' : change < 0 ? 'decrease' : 'neutral'

    const response = {
      totalRevenue: {
        value: Math.round(totalRevenue * 100) / 100,
        change: {
          value: Math.round(revenueChange * 10) / 10,
          type: getChangeType(revenueChange),
          period: 'last period'
        }
      },
      totalOrders: {
        value: totalOrders,
        change: {
          value: Math.round(ordersChange * 10) / 10,
          type: getChangeType(ordersChange),
          period: 'last period'
        }
      },
      totalCommission: {
        value: Math.round(totalCommission * 100) / 100,
        change: {
          value: Math.round(commissionChange * 10) / 10,
          type: getChangeType(commissionChange),
          period: 'last period'
        }
      },
      conversionRate: {
        value: Math.round(conversionRate * 100) / 100,
        change: {
          value: Math.round(conversionChange * 10) / 10,
          type: getChangeType(conversionChange),
          period: 'last period'
        }
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Analytics overview error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})