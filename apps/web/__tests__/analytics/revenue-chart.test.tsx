import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { RevenueChart } from '@/components/analytics/revenue-chart'

// Mock the analytics hook
vi.mock('@/lib/hooks/use-analytics', () => ({
  useRevenueAnalytics: vi.fn()
}))

import { useRevenueAnalytics } from '@/lib/hooks/use-analytics'

const mockUseRevenueAnalytics = vi.mocked(useRevenueAnalytics)

describe('RevenueChart', () => {
  const mockData = [
    {
      date: 'Dec 01',
      fullDate: '2023-12-01T00:00:00.000Z',
      revenue: 1200,
      orders: 15,
      commission: 120
    },
    {
      date: 'Dec 02',
      fullDate: '2023-12-02T00:00:00.000Z',
      revenue: 1500,
      orders: 18,
      commission: 150
    },
    {
      date: 'Dec 03',
      fullDate: '2023-12-03T00:00:00.000Z',
      revenue: 980,
      orders: 12,
      commission: 98
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock URL methods for chart export functionality
    global.URL.createObjectURL = vi.fn(() => 'mock-url')
    global.URL.revokeObjectURL = vi.fn()
    
    // Mock document.createElement for export functionality
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn()
    } as any
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders loading state correctly', () => {
    mockUseRevenueAnalytics.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<RevenueChart workspaceId="test-workspace" />)

    expect(screen.getByText('Revenue Trends')).toBeInTheDocument()
    expect(screen.getByText('Track your revenue performance over time')).toBeInTheDocument()
    
    // Should show loading skeleton
    const loadingElement = screen.getByTestId('loading-skeleton') || screen.getByRole('generic')
    expect(loadingElement).toHaveClass('animate-pulse')
  })

  it('renders error state with retry functionality', () => {
    const mockRefetch = vi.fn()
    mockUseRevenueAnalytics.mockReturnValue({
      data: null,
      loading: false,
      error: 'Network error',
      refetch: mockRefetch,
      mutate: vi.fn()
    })

    render(<RevenueChart workspaceId="test-workspace" />)

    expect(screen.getByText('Failed to load revenue data.')).toBeInTheDocument()
    
    const retryButton = screen.getByText('Try again')
    fireEvent.click(retryButton)
    expect(mockRefetch).toHaveBeenCalledOnce()
  })

  it('renders empty state when no data available', () => {
    mockUseRevenueAnalytics.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<RevenueChart workspaceId="test-workspace" />)

    expect(screen.getByText('No revenue data available')).toBeInTheDocument()
    expect(screen.getByText('Data will appear once you have affiliate orders')).toBeInTheDocument()
  })

  it('renders chart with data correctly', () => {
    mockUseRevenueAnalytics.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<RevenueChart workspaceId="test-workspace" />)

    // Should render chart components
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    expect(screen.getByTestId('x-axis')).toBeInTheDocument()
    expect(screen.getByTestId('y-axis')).toBeInTheDocument()
    expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument()
    expect(screen.getByTestId('tooltip')).toBeInTheDocument()
    expect(screen.getByTestId('area')).toBeInTheDocument()
  })

  it('switches between different metrics correctly', () => {
    mockUseRevenueAnalytics.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<RevenueChart workspaceId="test-workspace" />)

    // Default should be revenue
    expect(screen.getByRole('button', { name: 'Revenue' })).toHaveClass('bg-primary')

    // Switch to orders
    fireEvent.click(screen.getByRole('button', { name: 'Orders' }))
    expect(screen.getByRole('button', { name: 'Orders' })).toHaveClass('bg-primary')

    // Switch to commission
    fireEvent.click(screen.getByRole('button', { name: 'Commission' }))
    expect(screen.getByRole('button', { name: 'Commission' })).toHaveClass('bg-primary')
  })

  it('handles export functionality', () => {
    mockUseRevenueAnalytics.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<RevenueChart workspaceId="test-workspace" timeRange="7d" />)

    const exportButton = screen.getByRole('button', { name: /Export/i })
    fireEvent.click(exportButton)

    // Should create and trigger download
    expect(document.createElement).toHaveBeenCalledWith('a')
    expect(global.URL.createObjectURL).toHaveBeenCalled()
  })

  it('configures analytics hook with correct parameters', () => {
    mockUseRevenueAnalytics.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<RevenueChart workspaceId="test-workspace" timeRange="90d" />)

    expect(mockUseRevenueAnalytics).toHaveBeenCalledWith({
      workspaceId: 'test-workspace',
      timeRange: '90d',
      refreshInterval: 5 * 60 * 1000
    })
  })

  it('uses default values when not provided', () => {
    mockUseRevenueAnalytics.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<RevenueChart />)

    expect(mockUseRevenueAnalytics).toHaveBeenCalledWith({
      workspaceId: 'mock-workspace-1',
      timeRange: '30d',
      refreshInterval: 5 * 60 * 1000
    })
  })

  it('displays time range in chart description', () => {
    mockUseRevenueAnalytics.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<RevenueChart workspaceId="test-workspace" timeRange="7d" />)

    expect(screen.getByText('Revenue ($) over the last 7d')).toBeInTheDocument()
  })

  it('shows last updated timestamp', () => {
    mockUseRevenueAnalytics.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<RevenueChart workspaceId="test-workspace" />)

    expect(screen.getByText(/Last updated:/)).toBeInTheDocument()
  })

  it('displays growth percentage badge', () => {
    mockUseRevenueAnalytics.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<RevenueChart workspaceId="test-workspace" />)

    // Should show mock growth percentage
    expect(screen.getByText('+12.3% vs last period')).toBeInTheDocument()
  })

  it('handles null data gracefully', () => {
    mockUseRevenueAnalytics.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    render(<RevenueChart workspaceId="test-workspace" />)

    expect(screen.getByText('No revenue data available')).toBeInTheDocument()
  })

  it('applies correct colors for different metrics', () => {
    mockUseRevenueAnalytics.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
      refetch: vi.fn(),
      mutate: vi.fn()
    })

    const { rerender } = render(<RevenueChart workspaceId="test-workspace" />)

    // Default revenue should be blue
    expect(screen.getByText('Revenue ($)')).toBeInTheDocument()

    // Switch to orders (green)
    fireEvent.click(screen.getByRole('button', { name: 'Orders' }))
    expect(screen.getByText('Orders')).toBeInTheDocument()

    // Switch to commission (yellow)
    fireEvent.click(screen.getByRole('button', { name: 'Commission' }))
    expect(screen.getByText('Commission ($)')).toBeInTheDocument()
  })
})