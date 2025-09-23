import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { DashboardOverview } from '@/components/analytics/dashboard-overview'

// Mock the analytics hook
vi.mock('@/lib/hooks/use-analytics', () => ({
  useOverviewAnalytics: vi.fn()
}))

import { useOverviewAnalytics } from '@/lib/hooks/use-analytics'

const mockUseOverviewAnalytics = vi.mocked(useOverviewAnalytics)

describe('DashboardOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders loading state correctly', () => {
    mockUseOverviewAnalytics.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<DashboardOverview workspaceId="test-workspace" />)

    // Should show loading placeholders for metric cards
    expect(screen.getAllByText('Total Revenue')).toHaveLength(1)
    expect(screen.getAllByText('Total Orders')).toHaveLength(1)
    expect(screen.getAllByText('Commission Earned')).toHaveLength(1)
    expect(screen.getAllByText('Conversion Rate')).toHaveLength(1)
  })

  it('renders error state with retry functionality', async () => {
    const mockRefetch = vi.fn()
    mockUseOverviewAnalytics.mockReturnValue({
      data: null,
      loading: false,
      error: 'Failed to fetch data',
      refetch: mockRefetch,
      mutate: vi.fn()
    })

    render(<DashboardOverview workspaceId="test-workspace" />)

    // Should show error message
    expect(screen.getByText('Failed to load overview data.')).toBeInTheDocument()
    
    // Should show retry button
    const retryButton = screen.getByText('Try again')
    expect(retryButton).toBeInTheDocument()
    
    // Clicking retry should call refetch
    retryButton.click()
    expect(mockRefetch).toHaveBeenCalledOnce()
  })

  it('renders data correctly when loaded', () => {
    const mockData = {
      totalRevenue: {
        value: 25000,
        change: { value: 12.5, type: 'increase', period: 'last period' }
      },
      totalOrders: {
        value: 150,
        change: { value: 8.3, type: 'increase', period: 'last period' }
      },
      totalCommission: {
        value: 2500,
        change: { value: -3.2, type: 'decrease', period: 'last period' }
      },
      conversionRate: {
        value: 3.8,
        change: { value: 0.5, type: 'increase', period: 'last period' }
      }
    }

    mockUseOverviewAnalytics.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<DashboardOverview workspaceId="test-workspace" />)

    // Should show formatted revenue
    expect(screen.getByText('$25,000')).toBeInTheDocument()
    
    // Should show order count
    expect(screen.getByText('150')).toBeInTheDocument()
    
    // Should show formatted commission
    expect(screen.getByText('$2,500')).toBeInTheDocument()
    
    // Should show conversion rate percentage
    expect(screen.getByText('3.8%')).toBeInTheDocument()
  })

  it('handles zero values correctly', () => {
    const mockData = {
      totalRevenue: {
        value: 0,
        change: { value: 0, type: 'neutral', period: 'last period' }
      },
      totalOrders: {
        value: 0,
        change: { value: 0, type: 'neutral', period: 'last period' }
      },
      totalCommission: {
        value: 0,
        change: { value: 0, type: 'neutral', period: 'last period' }
      },
      conversionRate: {
        value: 0,
        change: { value: 0, type: 'neutral', period: 'last period' }
      }
    }

    mockUseOverviewAnalytics.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<DashboardOverview workspaceId="test-workspace" />)

    // Should show zero values correctly
    expect(screen.getByText('$0')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('configures analytics hook with correct parameters', () => {
    mockUseOverviewAnalytics.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<DashboardOverview workspaceId="test-workspace" timeRange="7d" />)

    expect(mockUseOverviewAnalytics).toHaveBeenCalledWith({
      workspaceId: 'test-workspace',
      timeRange: '7d',
      refreshInterval: 5 * 60 * 1000 // 5 minutes
    })
  })

  it('uses default values when not provided', () => {
    mockUseOverviewAnalytics.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<DashboardOverview />)

    expect(mockUseOverviewAnalytics).toHaveBeenCalledWith({
      workspaceId: 'mock-workspace-1',
      timeRange: '30d',
      refreshInterval: 5 * 60 * 1000
    })
  })

  it('displays correct icons for each metric', () => {
    const mockData = {
      totalRevenue: {
        value: 1000,
        change: { value: 10, type: 'increase', period: 'last period' }
      },
      totalOrders: {
        value: 50,
        change: { value: 5, type: 'increase', period: 'last period' }
      },
      totalCommission: {
        value: 100,
        change: { value: 1, type: 'increase', period: 'last period' }
      },
      conversionRate: {
        value: 2.5,
        change: { value: 0.2, type: 'increase', period: 'last period' }
      }
    }

    mockUseOverviewAnalytics.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<DashboardOverview workspaceId="test-workspace" />)

    // Each metric card should have its respective title
    expect(screen.getByText('Total Revenue')).toBeInTheDocument()
    expect(screen.getByText('Total Orders')).toBeInTheDocument()
    expect(screen.getByText('Commission Earned')).toBeInTheDocument()
    expect(screen.getByText('Conversion Rate')).toBeInTheDocument()
  })
})