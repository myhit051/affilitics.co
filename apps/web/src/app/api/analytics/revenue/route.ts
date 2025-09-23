import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@aff/db'
import { startOfDay, subDays, format, eachDayOfInterval } from 'date-fns'

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

    // Get orders for the period
    const orders = await prisma.affiliateOrder.findMany({
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
      },
      orderBy: {
        eventDate: 'asc'
      }
    })

    // Generate all dates in the range
    const dateRange = eachDayOfInterval({ start: startDate, end: today })
    
    // Group orders by date and calculate metrics
    const revenueData = dateRange.map(date => {
      const dayStart = startOfDay(date)
      const dayOrders = orders.filter(order => {
        const orderDate = startOfDay(new Date(order.eventDate))
        return orderDate.getTime() === dayStart.getTime()
      })

      const revenue = dayOrders.reduce((sum, order) => 
        sum + (order.amount ? Number(order.amount) : 0), 0
      )
      const commission = dayOrders.reduce((sum, order) => 
        sum + (order.commission ? Number(order.commission) : 0), 0
      )
      const orderCount = dayOrders.length

      return {
        date: format(date, 'MMM dd'),
        fullDate: date.toISOString(),
        revenue: Math.round(revenue * 100) / 100,
        orders: orderCount,
        commission: Math.round(commission * 100) / 100
      }
    })

    return NextResponse.json(revenueData)
  } catch (error) {
    console.error('Revenue analytics error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}