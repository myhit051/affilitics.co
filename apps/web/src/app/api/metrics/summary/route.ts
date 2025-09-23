import { NextRequest } from 'next/server'
import { prisma } from '@aff/db'
import { getAuthContext } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const platform = searchParams.get('platform')
    const subid = searchParams.get('subid')
    
    if (!from || !to) {
      return new Response(JSON.stringify({ error: 'from/to required' }), { status: 400 })
    }

    const rows = await prisma.$queryRaw`
      SELECT date, platform, subid, orders, revenue, commission
      FROM metrics_daily
      WHERE workspace_id = ${workspaceId}::uuid 
        AND date BETWEEN ${from}::date AND ${to}::date
        AND (${platform}::text IS NULL OR platform = ${platform})
        AND (${subid}::text IS NULL OR subid = ${subid})
      ORDER BY date ASC
    `
    
    return new Response(JSON.stringify({ data: rows }), { status: 200 })
  } catch (error) {
    console.error('Metrics summary error:', error)
    
    if (error instanceof Response) {
      return error
    }

    return new Response(JSON.stringify({
      error: 'Failed to retrieve metrics',
      details: 'An error occurred while fetching metrics summary'
    }), { status: 500 })
  }
}
