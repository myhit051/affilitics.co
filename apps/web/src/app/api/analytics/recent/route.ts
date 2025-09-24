import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@aff/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      )
    }

    // Get recent orders
    const recentOrders = await prisma.affiliateOrder.findMany({
      where: {
        workspaceId
      },
      select: {
        id: true,
        orderId: true,
        platform: true,
        amount: true,
        commission: true,
        eventDate: true,
        subid: true
      },
      orderBy: {
        eventDate: 'desc'
      },
      take: limit
    })

    // Transform data for frontend
    const formattedOrders = recentOrders.map((order: any, index: number) => ({
      id: order.id,
      orderId: order.orderId,
      platform: order.platform,
      amount: order.amount ? Number(order.amount) : 0,
      commission: order.commission ? Number(order.commission) : 0,
      status: 'completed', // All orders in DB are completed
      date: order.eventDate.toISOString(),
      customer: order.subid || `Customer ${index + 1}` // Use subid as customer identifier or fallback
    }))

    return NextResponse.json(formattedOrders)
  } catch (error) {
    console.error('Recent orders error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Get import job status
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      )
    }

    // Get recent import jobs
    const importJobs = await prisma.importJob.findMany({
      where: {
        workspaceId
      },
      select: {
        id: true,
        filename: true,
        platform: true,
        status: true,
        size: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        error: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    })

    // Get error counts for failed jobs
    const failedJobIds = importJobs
      .filter((job: any) => job.status === 'failed')
      .map((job: any) => job.id)

    const errorCounts = await prisma.importError.groupBy({
      by: ['jobId'],
      where: {
        jobId: {
          in: failedJobIds
        }
      },
      _count: {
        id: true
      }
    })

    // Transform data for frontend
    const formattedJobs = importJobs.map((job: any) => {
      const errorCount = errorCounts.find((e: any) => e.jobId === job.id)?._count.id || 0
      
      return {
        id: job.id,
        filename: job.filename,
        platform: job.platform,
        status: job.status,
        totalRecords: 1000, // Mock value - you might want to store this in the DB
        processedRecords: job.status === 'completed' ? 1000 : 
                         job.status === 'processing' ? 600 :
                         job.status === 'failed' ? 300 : 0,
        errorCount,
        date: job.createdAt.toISOString(),
        size: (job.size / 1024).toFixed(1) // Convert to KB
      }
    })

    return NextResponse.json(formattedJobs)
  } catch (error) {
    console.error('Import jobs error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}