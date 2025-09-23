"use client"

import { useState, useEffect, useCallback } from 'react'

interface UseAnalyticsOptions {
  workspaceId: string
  timeRange?: '7d' | '30d' | '90d' | '1y'
  refreshInterval?: number
  enabled?: boolean
}

interface AnalyticsState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useAnalytics<T>(
  endpoint: string,
  options: UseAnalyticsOptions
): AnalyticsState<T> & {
  refetch: () => void
  mutate: (data: T) => void
} {
  const [state, setState] = useState<AnalyticsState<T>>({
    data: null,
    loading: true,
    error: null
  })

  const { workspaceId, timeRange = '30d', refreshInterval, enabled = true } = options

  const fetchData = useCallback(async () => {
    if (!enabled) return

    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      
      // Security: Validate workspaceId is provided - no fallbacks allowed
      if (!workspaceId) {
        throw new Error('Workspace ID is required for analytics requests')
      }

      const params = new URLSearchParams({
        workspaceId,
        timeRange
      })

      const response = await fetch(`/api/analytics/${endpoint}?${params}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      setState({ data, loading: false, error: null })
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'An error occurred'
      }))
    }
  }, [endpoint, workspaceId, timeRange, enabled])

  const mutate = useCallback((newData: T) => {
    setState(prev => ({ ...prev, data: newData }))
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh interval
  useEffect(() => {
    if (!refreshInterval || !enabled) return

    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchData, refreshInterval, enabled])

  return {
    ...state,
    refetch: fetchData,
    mutate
  }
}

// Specific hooks for different analytics endpoints
export function useOverviewAnalytics(options: UseAnalyticsOptions) {
  return useAnalytics<{
    totalRevenue: { value: number; change: { value: number; type: string; period: string } }
    totalOrders: { value: number; change: { value: number; type: string; period: string } }
    totalCommission: { value: number; change: { value: number; type: string; period: string } }
    conversionRate: { value: number; change: { value: number; type: string; period: string } }
  }>('overview', options)
}

export function useRevenueAnalytics(options: UseAnalyticsOptions) {
  return useAnalytics<Array<{
    date: string
    fullDate: string
    revenue: number
    orders: number
    commission: number
  }>>('revenue', options)
}

export function usePlatformAnalytics(options: UseAnalyticsOptions) {
  return useAnalytics<Array<{
    name: string
    value: number
    revenue: number
    commission: number
    orders: number
    change: number
    color: string
  }>>('platforms', options)
}

export function useRecentOrdersAnalytics(options: UseAnalyticsOptions & { limit?: number }) {
  const params = new URLSearchParams({
    workspaceId: options.workspaceId,
    limit: (options.limit || 10).toString()
  })

  return useAnalytics<Array<{
    id: string
    orderId: string
    platform: string
    amount: number
    commission: number
    status: string
    date: string
    customer: string
  }>>(`recent?${params}`, options)
}

// Cache management
class AnalyticsCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>()

  set(key: string, data: any, ttl: number = 5 * 60 * 1000) { // 5 minutes default
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  get(key: string) {
    const item = this.cache.get(key)
    if (!item) return null

    const isExpired = Date.now() - item.timestamp > item.ttl
    if (isExpired) {
      this.cache.delete(key)
      return null
    }

    return item.data
  }

  clear() {
    this.cache.clear()
  }

  invalidate(pattern: string) {
    for (const key of Array.from(this.cache.keys())) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }
}

export const analyticsCache = new AnalyticsCache()