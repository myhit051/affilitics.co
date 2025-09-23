import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/analytics/revenue/route'

// Mock Prisma
vi.mock('@aff/db', () => ({
  prisma: {
    affiliateOrder: {
      findMany: vi.fn()
    }
  }
}))

import { prisma } from '@aff/db'

const mockPrisma = vi.mocked(prisma)

describe('/api/analytics/revenue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns 400 error when workspace ID is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/analytics/revenue')
    const response = await GET(request)
    
    expect(response.status).toBe(400)
    
    const data = await response.json()
    expect(data.error).toBe('Workspace ID is required')
  })

  it('returns revenue data for valid workspace ID', async () => {
    const mockOrders = [
      {
        amount: 100,
        commission: 10,
        eventDate: new Date('2023-12-01T00:00:00.000Z')
      },
      {
        amount: 200,
        commission: 20,
        eventDate: new Date('2023-12-02T00:00:00.000Z')
      },
      {
        amount: 150,
        commission: 15,
        eventDate: new Date('2023-12-01T00:00:00.000Z') // Same day as first order
      }
    ]

    mockPrisma.affiliateOrder.findMany.mockResolvedValue(mockOrders)

    const request = new NextRequest('http://localhost:3000/api/analytics/revenue?workspaceId=test-workspace')
    const response = await GET(request)
    
    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)

    // Should aggregate orders by date
    const dec01Data = data.find((item: any) => item.date === 'Dec 01')
    expect(dec01Data).toBeDefined()
    expect(dec01Data.revenue).toBe(250) // 100 + 150
    expect(dec01Data.orders).toBe(2)
    expect(dec01Data.commission).toBe(25) // 10 + 15

    const dec02Data = data.find((item: any) => item.date === 'Dec 02')
    expect(dec02Data).toBeDefined()
    expect(dec02Data.revenue).toBe(200)
    expect(dec02Data.orders).toBe(1)
    expect(dec02Data.commission).toBe(20)
  })

  it('handles different time ranges correctly', async () => {
    mockPrisma.affiliateOrder.findMany.mockResolvedValue([])

    const timeRanges = ['7d', '30d', '90d', '1y']

    for (const timeRange of timeRanges) {
      const request = new NextRequest(`http://localhost:3000/api/analytics/revenue?workspaceId=test&timeRange=${timeRange}`)
      const response = await GET(request)
      
      expect(response.status).toBe(200)
      
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    }
  })

  it('defaults to 30d time range when not specified', async () => {
    mockPrisma.affiliateOrder.findMany.mockResolvedValue([])

    const request = new NextRequest('http://localhost:3000/api/analytics/revenue?workspaceId=test')
    const response = await GET(request)
    
    expect(response.status).toBe(200)
    
    // Verify Prisma was called with date range for 30 days
    expect(mockPrisma.affiliateOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'test',
          eventDate: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date)
          })
        })
      })
    )
  })

  it('generates data for all dates in range even with no orders', async () => {
    mockPrisma.affiliateOrder.findMany.mockResolvedValue([])

    const request = new NextRequest('http://localhost:3000/api/analytics/revenue?workspaceId=test&timeRange=7d')
    const response = await GET(request)
    
    const data = await response.json()
    
    // Should have 8 data points (7 days + today)
    expect(data.length).toBe(8)
    
    // All should have zero values
    data.forEach((item: any) => {
      expect(item.revenue).toBe(0)
      expect(item.orders).toBe(0)
      expect(item.commission).toBe(0)
      expect(item.date).toBeDefined()
      expect(item.fullDate).toBeDefined()
    })
  })

  it('properly formats dates', async () => {
    const mockOrders = [
      {
        amount: 100,
        commission: 10,
        eventDate: new Date('2023-12-01T12:30:45.000Z')
      }
    ]

    mockPrisma.affiliateOrder.findMany.mockResolvedValue(mockOrders)

    const request = new NextRequest('http://localhost:3000/api/analytics/revenue?workspaceId=test&timeRange=7d')
    const response = await GET(request)
    
    const data = await response.json()
    
    // Should format date as "MMM dd"
    const orderData = data.find((item: any) => item.revenue > 0)
    expect(orderData.date).toMatch(/^[A-Z][a-z]{2} \d{2}$/) // e.g., "Dec 01"
    expect(orderData.fullDate).toMatch(/^\d{4}-\d{2}-\d{2}T/) // ISO string
  })

  it('handles null amount and commission values', async () => {
    const mockOrders = [
      {
        amount: null,
        commission: null,
        eventDate: new Date('2023-12-01T00:00:00.000Z')
      },
      {
        amount: 100,
        commission: 10,
        eventDate: new Date('2023-12-01T00:00:00.000Z')
      }
    ]

    mockPrisma.affiliateOrder.findMany.mockResolvedValue(mockOrders)

    const request = new NextRequest('http://localhost:3000/api/analytics/revenue?workspaceId=test')
    const response = await GET(request)
    
    const data = await response.json()
    
    const dec01Data = data.find((item: any) => item.date === 'Dec 01')
    expect(dec01Data.revenue).toBe(100) // Only non-null value counted
    expect(dec01Data.commission).toBe(10)
    expect(dec01Data.orders).toBe(2) // Both orders counted
  })

  it('rounds monetary values to 2 decimal places', async () => {
    const mockOrders = [
      {
        amount: 123.456,
        commission: 12.345,
        eventDate: new Date('2023-12-01T00:00:00.000Z')
      }
    ]

    mockPrisma.affiliateOrder.findMany.mockResolvedValue(mockOrders)

    const request = new NextRequest('http://localhost:3000/api/analytics/revenue?workspaceId=test')
    const response = await GET(request)
    
    const data = await response.json()
    
    const orderData = data.find((item: any) => item.revenue > 0)
    expect(orderData.revenue).toBe(123.46)
    expect(orderData.commission).toBe(12.35)
  })

  it('orders results by date ascending', async () => {
    const mockOrders = [
      {
        amount: 100,
        commission: 10,
        eventDate: new Date('2023-12-03T00:00:00.000Z')
      },
      {
        amount: 200,
        commission: 20,
        eventDate: new Date('2023-12-01T00:00:00.000Z')
      }
    ]

    mockPrisma.affiliateOrder.findMany.mockResolvedValue(mockOrders)

    const request = new NextRequest('http://localhost:3000/api/analytics/revenue?workspaceId=test&timeRange=7d')
    const response = await GET(request)
    
    const data = await response.json()
    
    // Verify Prisma was called with orderBy
    expect(mockPrisma.affiliateOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          eventDate: 'asc'
        }
      })
    )
  })

  it('handles database errors gracefully', async () => {
    mockPrisma.affiliateOrder.findMany.mockRejectedValue(new Error('Database connection failed'))

    const request = new NextRequest('http://localhost:3000/api/analytics/revenue?workspaceId=test')
    const response = await GET(request)
    
    expect(response.status).toBe(500)
    
    const data = await response.json()
    expect(data.error).toBe('Internal server error')
  })

  it('filters orders by workspace ID correctly', async () => {
    mockPrisma.affiliateOrder.findMany.mockResolvedValue([])

    const request = new NextRequest('http://localhost:3000/api/analytics/revenue?workspaceId=specific-workspace')
    await GET(request)
    
    expect(mockPrisma.affiliateOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'specific-workspace'
        })
      })
    )
  })

  it('selects only required fields from database', async () => {
    mockPrisma.affiliateOrder.findMany.mockResolvedValue([])

    const request = new NextRequest('http://localhost:3000/api/analytics/revenue?workspaceId=test')
    await GET(request)
    
    expect(mockPrisma.affiliateOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          amount: true,
          commission: true,
          eventDate: true
        }
      })
    )
  })

  it('calculates correct date ranges for different time periods', async () => {
    mockPrisma.affiliateOrder.findMany.mockResolvedValue([])

    // Test 1 year range
    const request = new NextRequest('http://localhost:3000/api/analytics/revenue?workspaceId=test&timeRange=1y')
    await GET(request)
    
    const call = mockPrisma.affiliateOrder.findMany.mock.calls[0][0]
    const startDate = call.where.eventDate.gte
    const endDate = call.where.eventDate.lte
    
    // Should be approximately 365 days apart
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    expect(daysDiff).toBe(365)
  })
})