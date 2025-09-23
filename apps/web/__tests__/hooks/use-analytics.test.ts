import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { 
  useAnalytics, 
  useOverviewAnalytics, 
  useRevenueAnalytics,
  analyticsCache 
} from '@/lib/hooks/use-analytics'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('useAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    analyticsCache.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  it('fetches data successfully', async () => {
    const mockData = { revenue: 1000, orders: 50 }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData)
    })

    const { result } = renderHook(() => 
      useAnalytics('overview', { workspaceId: 'test-workspace' })
    )

    // Initially loading
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBe(null)
    expect(result.current.error).toBe(null)

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual(mockData)
    expect(result.current.error).toBe(null)
    expect(mockFetch).toHaveBeenCalledWith('/api/analytics/overview?workspaceId=test-workspace&timeRange=30d')
  })

  it('handles fetch errors correctly', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => 
      useAnalytics('overview', { workspaceId: 'test-workspace' })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toBe(null)
    expect(result.current.error).toBe('Network error')
  })

  it('handles HTTP error responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500
    })

    const { result } = renderHook(() => 
      useAnalytics('overview', { workspaceId: 'test-workspace' })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('HTTP error! status: 500')
  })

  it('uses default time range when not specified', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({})
    })

    renderHook(() => 
      useAnalytics('overview', { workspaceId: 'test-workspace' })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/analytics/overview?workspaceId=test-workspace&timeRange=30d')
    })
  })

  it('uses custom time range when specified', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({})
    })

    renderHook(() => 
      useAnalytics('overview', { workspaceId: 'test-workspace', timeRange: '7d' })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/analytics/overview?workspaceId=test-workspace&timeRange=7d')
    })
  })

  it('falls back to mock workspace when none provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({})
    })

    renderHook(() => 
      useAnalytics('overview', { workspaceId: '' })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/analytics/overview?workspaceId=mock-workspace-1&timeRange=30d')
    })
  })

  it('refetches data when refetch is called', async () => {
    const mockData1 = { revenue: 1000 }
    const mockData2 = { revenue: 2000 }

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData1)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData2)
      })

    const { result } = renderHook(() => 
      useAnalytics('overview', { workspaceId: 'test-workspace' })
    )

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData1)
    })

    act(() => {
      result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData2)
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('mutates data locally', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ revenue: 1000 })
    })

    const { result } = renderHook(() => 
      useAnalytics('overview', { workspaceId: 'test-workspace' })
    )

    await waitFor(() => {
      expect(result.current.data).toEqual({ revenue: 1000 })
    })

    const newData = { revenue: 2000 }
    act(() => {
      result.current.mutate(newData)
    })

    expect(result.current.data).toEqual(newData)
  })

  it('respects enabled flag', async () => {
    const { result } = renderHook(() => 
      useAnalytics('overview', { workspaceId: 'test-workspace', enabled: false })
    )

    // Should remain in initial state
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBe(null)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sets up refresh interval when specified', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ revenue: 1000 })
    })

    renderHook(() => 
      useAnalytics('overview', { 
        workspaceId: 'test-workspace', 
        refreshInterval: 1000 
      })
    )

    // Initial call
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    // Advance timer
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Should have made another call
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  it('cleans up interval on unmount', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ revenue: 1000 })
    })

    const { unmount } = renderHook(() => 
      useAnalytics('overview', { 
        workspaceId: 'test-workspace', 
        refreshInterval: 1000 
      })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    unmount()

    // Advance timer after unmount
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Should not make additional calls
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('refetches when dependencies change', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    })

    const { rerender } = renderHook(
      ({ workspaceId, timeRange }) => 
        useAnalytics('overview', { workspaceId, timeRange }),
      {
        initialProps: { workspaceId: 'workspace-1', timeRange: '30d' as const }
      }
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    // Change workspace ID
    rerender({ workspaceId: 'workspace-2', timeRange: '30d' as const })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    // Change time range
    rerender({ workspaceId: 'workspace-2', timeRange: '7d' as const })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })
})

describe('useOverviewAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls useAnalytics with correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        totalRevenue: { value: 1000, change: { value: 10, type: 'increase', period: 'last period' } },
        totalOrders: { value: 50, change: { value: 5, type: 'increase', period: 'last period' } },
        totalCommission: { value: 100, change: { value: 1, type: 'increase', period: 'last period' } },
        conversionRate: { value: 2.5, change: { value: 0.2, type: 'increase', period: 'last period' } }
      })
    })

    const { result } = renderHook(() => 
      useOverviewAnalytics({ workspaceId: 'test-workspace' })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/analytics/overview?workspaceId=test-workspace&timeRange=30d')
    })
  })
})

describe('useRevenueAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls useAnalytics with correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { date: 'Dec 01', revenue: 1000, orders: 10, commission: 100 },
        { date: 'Dec 02', revenue: 1200, orders: 12, commission: 120 }
      ])
    })

    const { result } = renderHook(() => 
      useRevenueAnalytics({ workspaceId: 'test-workspace' })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/analytics/revenue?workspaceId=test-workspace&timeRange=30d')
    })
  })
})

describe('AnalyticsCache', () => {
  beforeEach(() => {
    analyticsCache.clear()
  })

  it('stores and retrieves data', () => {
    const data = { revenue: 1000 }
    analyticsCache.set('test-key', data)
    
    expect(analyticsCache.get('test-key')).toEqual(data)
  })

  it('returns null for non-existent keys', () => {
    expect(analyticsCache.get('non-existent')).toBe(null)
  })

  it('expires data after TTL', () => {
    vi.useFakeTimers()
    
    const data = { revenue: 1000 }
    analyticsCache.set('test-key', data, 1000) // 1 second TTL
    
    expect(analyticsCache.get('test-key')).toEqual(data)
    
    // Advance time past TTL
    vi.advanceTimersByTime(1001)
    
    expect(analyticsCache.get('test-key')).toBe(null)
    
    vi.useRealTimers()
  })

  it('clears all data', () => {
    analyticsCache.set('key1', { data: 1 })
    analyticsCache.set('key2', { data: 2 })
    
    analyticsCache.clear()
    
    expect(analyticsCache.get('key1')).toBe(null)
    expect(analyticsCache.get('key2')).toBe(null)
  })

  it('invalidates keys by pattern', () => {
    analyticsCache.set('workspace-1-overview', { data: 1 })
    analyticsCache.set('workspace-1-revenue', { data: 2 })
    analyticsCache.set('workspace-2-overview', { data: 3 })
    
    analyticsCache.invalidate('workspace-1')
    
    expect(analyticsCache.get('workspace-1-overview')).toBe(null)
    expect(analyticsCache.get('workspace-1-revenue')).toBe(null)
    expect(analyticsCache.get('workspace-2-overview')).toEqual({ data: 3 })
  })
})