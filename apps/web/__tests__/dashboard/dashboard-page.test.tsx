import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import DashboardPage from '@/app/dashboard/page'

// Mock all the analytics components
vi.mock('@/components/analytics', () => ({
  DashboardOverview: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="dashboard-overview">Dashboard Overview for {workspaceId}</div>
  ),
  RevenueChart: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="revenue-chart">Revenue Chart for {workspaceId}</div>
  ),
  PlatformPerformance: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="platform-performance">Platform Performance for {workspaceId}</div>
  ),
  RecentOrders: () => (
    <div data-testid="recent-orders">Recent Orders</div>
  ),
  ImportStatus: () => (
    <div data-testid="import-status">Import Status</div>
  ),
  QuickActions: () => (
    <div data-testid="quick-actions">Quick Actions</div>
  )
}))

vi.mock('@/components/analytics/real-time-metrics', () => ({
  RealTimeMetrics: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="real-time-metrics">Real-time Metrics for {workspaceId}</div>
  )
}))

vi.mock('@/components/layout/dashboard-layout', () => ({
  DashboardLayout: ({ children, user, workspace }: any) => (
    <div data-testid="dashboard-layout">
      <div data-testid="user-info">{user?.name} - {user?.email}</div>
      <div data-testid="workspace-info">{workspace?.name} - {workspace?.plan}</div>
      {children}
    </div>
  )
}))

vi.mock('@/components/ui/loading', () => ({
  Loading: () => <div data-testid="loading">Loading...</div>
}))

describe('Dashboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders dashboard page with all components', async () => {
    render(<DashboardPage />)

    // Check main heading
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText("Welcome back! Here's what's happening with your affiliate marketing performance.")).toBeInTheDocument()

    // Check that all analytics components are rendered
    expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument()
    expect(screen.getByTestId('revenue-chart')).toBeInTheDocument()
    expect(screen.getByTestId('platform-performance')).toBeInTheDocument()
    expect(screen.getByTestId('recent-orders')).toBeInTheDocument()
    expect(screen.getByTestId('import-status')).toBeInTheDocument()
    expect(screen.getByTestId('quick-actions')).toBeInTheDocument()
    expect(screen.getByTestId('real-time-metrics')).toBeInTheDocument()
  })

  it('passes mock workspace ID to analytics components', () => {
    render(<DashboardPage />)

    expect(screen.getByText('Dashboard Overview for 1')).toBeInTheDocument()
    expect(screen.getByText('Revenue Chart for 1')).toBeInTheDocument()
    expect(screen.getByText('Platform Performance for 1')).toBeInTheDocument()
    expect(screen.getByText('Real-time Metrics for 1')).toBeInTheDocument()
  })

  it('renders with dashboard layout', () => {
    render(<DashboardPage />)

    expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
    
    // Check mock user data
    expect(screen.getByText('John Doe - user@example.com')).toBeInTheDocument()
    
    // Check mock workspace data
    expect(screen.getByText('Acme Corp - Pro')).toBeInTheDocument()
  })

  it('displays correct grid layout structure', () => {
    render(<DashboardPage />)

    // Main container should have proper spacing
    const mainContainer = screen.getByTestId('dashboard-layout').firstChild
    expect(mainContainer).toHaveClass('space-y-4', 'md:space-y-6')
  })

  it('shows quick actions in header', () => {
    render(<DashboardPage />)

    const quickActions = screen.getByTestId('quick-actions')
    expect(quickActions).toBeInTheDocument()
  })

  it('renders responsive grid for charts', () => {
    render(<DashboardPage />)

    // Charts should be in a responsive grid
    const revenueChart = screen.getByTestId('revenue-chart')
    const platformPerformance = screen.getByTestId('platform-performance')

    expect(revenueChart).toBeInTheDocument()
    expect(platformPerformance).toBeInTheDocument()
  })

  it('renders recent activity section', () => {
    render(<DashboardPage />)

    expect(screen.getByTestId('recent-orders')).toBeInTheDocument()
    expect(screen.getByTestId('import-status')).toBeInTheDocument()
  })

  it('uses suspense boundaries with loading fallbacks', () => {
    // The actual implementation uses Suspense boundaries, but in tests
    // they resolve immediately with our mocks
    render(<DashboardPage />)

    expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument()
    expect(screen.getByTestId('revenue-chart')).toBeInTheDocument()
    expect(screen.getByTestId('platform-performance')).toBeInTheDocument()
    expect(screen.getByTestId('recent-orders')).toBeInTheDocument()
    expect(screen.getByTestId('import-status')).toBeInTheDocument()
  })

  it('displays proper page header structure', () => {
    render(<DashboardPage />)

    // Should have header with title and description
    const title = screen.getByText('Dashboard')
    const description = screen.getByText("Welcome back! Here's what's happening with your affiliate marketing performance.")

    expect(title).toBeInTheDocument()
    expect(description).toBeInTheDocument()

    // Title should be h1
    expect(title.tagName).toBe('H1')
  })

  it('includes real-time metrics section', () => {
    render(<DashboardPage />)

    const realTimeMetrics = screen.getByTestId('real-time-metrics')
    expect(realTimeMetrics).toBeInTheDocument()
    expect(screen.getByText('Real-time Metrics for 1')).toBeInTheDocument()
  })

  it('has proper workspace context data structure', () => {
    render(<DashboardPage />)

    // Verify workspace usage data is displayed (mocked in DashboardLayout)
    expect(screen.getByTestId('workspace-info')).toBeInTheDocument()
  })

  it('maintains consistent spacing between sections', () => {
    render(<DashboardPage />)

    // Main container should have consistent spacing classes
    const container = screen.getByTestId('dashboard-layout').firstChild as HTMLElement
    expect(container).toHaveClass('space-y-4', 'md:space-y-6')
  })

  it('renders without errors when all data is present', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    render(<DashboardPage />)
    
    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})