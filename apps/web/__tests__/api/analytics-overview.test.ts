import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/analytics/overview/route'

// Mock Prisma
vi.mock('@aff/db', () => ({
  prisma: {
    affiliateOrder: {
      findMany: vi.fn()
    }
  }
}))

// Mock auth context
vi.mock('@/lib/auth', () => ({
  getAuthContext: vi.fn()
}))

import { prisma } from '@aff/db'
import { getAuthContext } from '@/lib/auth'

const mockPrisma = vi.mocked(prisma)
const mockGetAuthContext = vi.mocked(getAuthContext)

describe('/api/analytics/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns overview analytics with valid workspace ID', async () => {
    const mockOrders = [
      { amount: 100, commission: 10, eventDate: new Date('2023-12-01') },
      { amount: 200, commission: 20, eventDate: new Date('2023-12-02') },
      { amount: 150, commission: 15, eventDate: new Date('2023-12-03') }
    ]

    const mockPreviousOrders = [
      { amount: 80, commission: 8 },
      { amount: 120, commission: 12 }
    ]

    mockPrisma.affiliateOrder.findMany
      .mockResolvedValueOnce(mockOrders)
      .mockResolvedValueOnce(mockPreviousOrders)

    const request = new NextRequest('http://localhost:3000/api/analytics/overview?workspaceId=test-workspace&timeRange=30d')
    const response = await GET(request)
    
    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(data).toHaveProperty('totalRevenue')
    expect(data).toHaveProperty('totalOrders')
    expect(data).toHaveProperty('totalCommission')
    expect(data).toHaveProperty('conversionRate')

    // Verify calculations
    expect(data.totalRevenue.value).toBe(450) // 100 + 200 + 150
    expect(data.totalOrders.value).toBe(3)
    expect(data.totalCommission.value).toBe(45) // 10 + 20 + 15

    // Verify change calculations
    expect(data.totalRevenue.change.type).toBe('increase') // 450 vs 200
    expect(data.totalOrders.change.type).toBe('increase') // 3 vs 2
  })

  it('handles invalid time range parameter', async () => {
    const request = new NextRequest('http://localhost:3000/api/analytics/overview?workspaceId=test-workspace&timeRange=invalid')
    const response = await GET(request)
    
    expect(response.status).toBe(400)
    
    const data = await response.json()
    expect(data.error).toBe('Invalid time range. Must be one of: 7d, 30d, 90d, 1y')
  })

  it('uses authentication context when no workspace ID provided', async () => {
    mockGetAuthContext.mockResolvedValue({ workspaceId: 'auth-workspace' })
    mockPrisma.affiliateOrder.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const request = new NextRequest('http://localhost:3000/api/analytics/overview')
    const response = await GET(request)
    
    expect(response.status).toBe(200)
    expect(mockGetAuthContext).toHaveBeenCalled()
    
    // Verify Prisma was called with the workspace ID from auth context
    expect(mockPrisma.affiliateOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'auth-workspace'
        })
      })
    )
  })

  it('falls back to mock workspace when auth fails', async () => {
    mockGetAuthContext.mockRejectedValue(new Error('Auth failed'))
    mockPrisma.affiliateOrder.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const request = new NextRequest('http://localhost:3000/api/analytics/overview')
    const response = await GET(request)
    
    expect(response.status).toBe(200)
    
    // Should use mock workspace ID
    expect(mockPrisma.affiliateOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'mock-workspace-1'
        })
      })
    )
  })

  it('handles different time ranges correctly', async () => {
    mockPrisma.affiliateOrder.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const testCases = ['7d', '30d', '90d', '1y']

    for (const timeRange of testCases) {
      const request = new NextRequest(`http://localhost:3000/api/analytics/overview?workspaceId=test&timeRange=${timeRange}`)
      const response = await GET(request)
      
      expect(response.status).toBe(200)
    }
  })

  it('calculates percentage changes correctly', async () => {
    const mockCurrentOrders = [
      { amount: 1000, commission: 100, eventDate: new Date() }
    ]
    
    const mockPreviousOrders = [
      { amount: 500, commission: 50 }
    ]

    mockPrisma.affiliateOrder.findMany
      .mockResolvedValueOnce(mockCurrentOrders)
      .mockResolvedValueOnce(mockPreviousOrders)

    const request = new NextRequest('http://localhost:3000/api/analytics/overview?workspaceId=test')
    const response = await GET(request)
    
    const data = await response.json()
    
    // Revenue increased from 500 to 1000 = 100% increase
    expect(data.totalRevenue.change.value).toBe(100)
    expect(data.totalRevenue.change.type).toBe('increase')
    
    // Commission increased from 50 to 100 = 100% increase
    expect(data.totalCommission.change.value).toBe(100)
    expect(data.totalCommission.change.type).toBe('increase')
  })

  it('handles zero previous period values', async () => {
    const mockCurrentOrders = [
      { amount: 100, commission: 10, eventDate: new Date() }
    ]

    mockPrisma.affiliateOrder.findMany
      .mockResolvedValueOnce(mockCurrentOrders)
      .mockResolvedValueOnce([]) // No previous orders

    const request = new NextRequest('http://localhost:3000/api/analytics/overview?workspaceId=test')
    const response = await GET(request)
    
    const data = await response.json()
    
    // Should show 100% increase when there was no previous data
    expect(data.totalRevenue.change.value).toBe(100)
    expect(data.totalRevenue.change.type).toBe('increase')
  })

  it('handles database errors gracefully', async () => {
    mockPrisma.affiliateOrder.findMany.mockRejectedValue(new Error('Database connection failed'))

    const request = new NextRequest('http://localhost:3000/api/analytics/overview?workspaceId=test')
    const response = await GET(request)
    
    expect(response.status).toBe(500)
    
    const data = await response.json()
    expect(data.error).toBe('Internal server error')
  })

  it('properly formats decimal values', async () => {
    const mockOrders = [
      { amount: 123.456, commission: 12.345, eventDate: new Date() }
    ]

    mockPrisma.affiliateOrder.findMany
      .mockResolvedValueOnce(mockOrders)
      .mockResolvedValueOnce([])

    const request = new NextRequest('http://localhost:3000/api/analytics/overview?workspaceId=test')
    const response = await GET(request)
    
    const data = await response.json()
    
    // Values should be rounded to 2 decimal places
    expect(data.totalRevenue.value).toBe(123.46)
    expect(data.totalCommission.value).toBe(12.35)
  })

  it('calculates conversion rate correctly', async () => {
    const mockOrders = Array(10).fill(null).map(() => ({
      amount: 100,
      commission: 10,
      eventDate: new Date()
    }))

    mockPrisma.affiliateOrder.findMany
      .mockResolvedValueOnce(mockOrders)
      .mockResolvedValueOnce([])

    const request = new NextRequest('http://localhost:3000/api/analytics/overview?workspaceId=test')
    const response = await GET(request)
    
    const data = await response.json()
    
    // Conversion rate should be calculated based on orders/impressions formula
    expect(data.conversionRate.value).toBeGreaterThan(0)
    expect(data.conversionRate.change).toBeDefined()
  })

  it('handles null amount and commission values', async () => {
    const mockOrders = [
      { amount: null, commission: null, eventDate: new Date() },
      { amount: 100, commission: 10, eventDate: new Date() }
    ]

    mockPrisma.affiliateOrder.findMany
      .mockResolvedValueOnce(mockOrders)
      .mockResolvedValueOnce([])

    const request = new NextRequest('http://localhost:3000/api/analytics/overview?workspaceId=test')
    const response = await GET(request)
    
    const data = await response.json()
    
    // Should only count non-null values
    expect(data.totalRevenue.value).toBe(100)
    expect(data.totalCommission.value).toBe(10)
    expect(data.totalOrders.value).toBe(2) // Both orders counted
  })
})