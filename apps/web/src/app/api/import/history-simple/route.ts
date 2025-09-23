import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@aff/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const { searchParams } = new URL(req.url)
    
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const status = searchParams.get('status')

    // Build where clause
    const where: any = { workspaceId }
    if (status) {
      where.status = status
    }

    // Get import jobs
    const jobs = await prisma.importJob.findMany({
      where,
      select: {
        id: true,
        platform: true,
        filename: true,
        size: true,
        status: true,
        createdAt: true,
        createdBy: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    })

    // Get simple statistics
    const statusStats = await prisma.importJob.groupBy({
      by: ['status'],
      where: { workspaceId },
      _count: {
        id: true
      }
    })

    return new Response(JSON.stringify({
      success: true,
      jobs: jobs.map(job => ({
        id: job.id,
        platform: job.platform,
        filename: job.filename,
        size: job.size,
        status: job.status,
        progress: calculateProgress(job),
        rows: {
          total: 0,
          valid: 0,
          processed: 0,
          errors: 0
        },
        summaries: {
          validation: null,
          processing: null
        },
        timestamps: {
          created: job.createdAt,
          uploaded: null,
          validated: null,
          started: null,
          completed: null
        }
      })),
      statistics: {
        statusBreakdown: statusStats.map(stat => ({
          status: stat.status,
          count: stat._count.id,
          totalRows: 0,
          totalErrors: 0
        }))
      }
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Get history error:', error)
    
    return new Response(JSON.stringify({
      error: 'Failed to retrieve import history',
      details: 'An error occurred while fetching import history'
    }), { status: 500 })
  }
}

function calculateProgress(job: any): number {
  switch (job.status) {
    case 'uploaded': return 10
    case 'validated': return 25
    case 'validation_failed': return 20
    case 'queued': return 30
    case 'processing': 
      if (job.totalRows > 0 && job.processedRows > 0) {
        return Math.min(30 + (job.processedRows / job.totalRows) * 60, 90)
      }
      return 40
    case 'completed': return 100
    case 'failed': return Math.max(30, job.processedRows && job.totalRows ? 
      (job.processedRows / job.totalRows) * 80 : 30)
    default: return 0
  }
}