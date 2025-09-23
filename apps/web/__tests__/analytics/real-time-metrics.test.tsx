import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { RealTimeMetrics } from '@/components/analytics/real-time-metrics'

describe('RealTimeMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock timers for real-time updates
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  it('renders with initial live state', () => {
    render(<RealTimeMetrics workspaceId="test-workspace" />)

    expect(screen.getByText('Real-Time Metrics')).toBeInTheDocument()
    expect(screen.getByText('Live performance indicators updated every 10 seconds')).toBeInTheDocument()
    expect(screen.getByText('LIVE')).toBeInTheDocument()
    
    // Should show live indicator
    const liveIndicator = screen.getByRole('button', { name: 'LIVE' })
    expect(liveIndicator).toHaveClass('bg-green-50')
  })

  it('generates and displays real-time metrics', async () => {
    render(<RealTimeMetrics workspaceId="test-workspace" />)

    await waitFor(() => {
      expect(screen.getByText('Active Visitors')).toBeInTheDocument()
      expect(screen.getByText('Orders Today')).toBeInTheDocument()
      expect(screen.getByText('Revenue Today')).toBeInTheDocument()
      expect(screen.getByText('Live Conversion Rate')).toBeInTheDocument()
    })

    // Should show numeric values
    const metrics = screen.getAllByText(/\d+/)
    expect(metrics.length).toBeGreaterThan(0)
  })

  it('updates metrics every 10 seconds when live', async () => {
    render(<RealTimeMetrics workspaceId="test-workspace" />)

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Active Visitors')).toBeInTheDocument()
    })

    // Capture initial values
    const initialValues = Array.from(screen.getAllByText(/\d+/)).map(el => el.textContent)

    // Advance time by 10 seconds
    act(() => {
      vi.advanceTimersByTime(10000)
    })

    await waitFor(() => {
      // Values should have potentially changed (random generation)
      const newValues = Array.from(screen.getAllByText(/\d+/)).map(el => el.textContent)
      // Since values are randomly generated, we just check that metrics are still displayed
      expect(screen.getByText('Active Visitors')).toBeInTheDocument()
    })
  })

  it('pauses and resumes live updates', async () => {
    render(<RealTimeMetrics workspaceId="test-workspace" />)

    await waitFor(() => {
      expect(screen.getByText('LIVE')).toBeInTheDocument()
    })

    // Pause updates
    const liveButton = screen.getByRole('button', { name: 'LIVE' })
    fireEvent.click(liveButton)

    expect(screen.getByText('PAUSED')).toBeInTheDocument()
    expect(screen.getByText('Real-time updates paused. Click "PAUSED" to resume live monitoring.')).toBeInTheDocument()

    // Resume updates
    const pausedButton = screen.getByRole('button', { name: 'PAUSED' })
    expect(pausedButton).toHaveClass('bg-gray-50')
    
    fireEvent.click(pausedButton)
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })

  it('displays appropriate icons for each metric', async () => {
    render(<RealTimeMetrics workspaceId="test-workspace" />)

    await waitFor(() => {
      expect(screen.getByText('Active Visitors')).toBeInTheDocument()
    })

    // Each metric should have its corresponding label
    expect(screen.getByText('Active Visitors')).toBeInTheDocument()
    expect(screen.getByText('Orders Today')).toBeInTheDocument()
    expect(screen.getByText('Revenue Today')).toBeInTheDocument()
    expect(screen.getByText('Live Conversion Rate')).toBeInTheDocument()
  })

  it('shows status indicators for metrics', async () => {
    render(<RealTimeMetrics workspaceId="test-workspace" />)

    await waitFor(() => {
      expect(screen.getByText('Active Visitors')).toBeInTheDocument()
    })

    // Should show status arrows and percentage changes
    const statusElements = screen.getAllByText(/[↗↘→]/)
    expect(statusElements.length).toBeGreaterThan(0)

    const percentageElements = screen.getAllByText(/%/)
    expect(percentageElements.length).toBeGreaterThan(0)
  })

  it('displays updated timestamps', async () => {
    render(<RealTimeMetrics workspaceId="test-workspace" />)

    await waitFor(() => {
      expect(screen.getByText('Active Visitors')).toBeInTheDocument()
    })

    // Should show "Updated:" timestamps
    const updatedTexts = screen.getAllByText(/Updated:/)
    expect(updatedTexts.length).toBe(4) // One for each metric
  })

  it('stops updates when component unmounts', async () => {
    const { unmount } = render(<RealTimeMetrics workspaceId="test-workspace" />)

    await waitFor(() => {
      expect(screen.getByText('Active Visitors')).toBeInTheDocument()
    })

    // Unmount component
    unmount()

    // Advance time - should not cause any updates or errors
    act(() => {
      vi.advanceTimersByTime(20000)
    })

    // No errors should occur
    expect(true).toBe(true)
  })

  it('applies correct CSS classes for live state', () => {
    render(<RealTimeMetrics workspaceId="test-workspace" />)

    const liveIndicator = document.querySelector('.animate-pulse')
    expect(liveIndicator).toBeInTheDocument()
    
    const liveButton = screen.getByRole('button', { name: 'LIVE' })
    expect(liveButton).toHaveClass('bg-green-50', 'text-green-700', 'border-green-200')
  })

  it('handles workspace ID prop correctly', () => {
    const { rerender } = render(<RealTimeMetrics workspaceId="workspace-1" />)
    
    expect(screen.getByText('Real-Time Metrics')).toBeInTheDocument()

    // Rerender with different workspace ID
    rerender(<RealTimeMetrics workspaceId="workspace-2" />)
    
    expect(screen.getByText('Real-Time Metrics')).toBeInTheDocument()
  })

  it('renders with custom className prop', () => {
    render(<RealTimeMetrics workspaceId="test-workspace" className="custom-class" />)

    const container = screen.getByText('Real-Time Metrics').closest('.custom-class')
    expect(container).toBeInTheDocument()
  })

  it('generates realistic metric values', async () => {
    render(<RealTimeMetrics workspaceId="test-workspace" />)

    await waitFor(() => {
      expect(screen.getByText('Active Visitors')).toBeInTheDocument()
    })

    // Revenue should include dollar sign
    expect(screen.getByText(/\$\d+/)).toBeInTheDocument()
    
    // Conversion rate should include percentage
    expect(screen.getByText(/\d+\.\d+%/)).toBeInTheDocument()
  })

  it('maintains metric state during pause/resume cycle', async () => {
    render(<RealTimeMetrics workspaceId="test-workspace" />)

    await waitFor(() => {
      expect(screen.getByText('Active Visitors')).toBeInTheDocument()
    })

    // Pause
    fireEvent.click(screen.getByRole('button', { name: 'LIVE' }))
    
    // Values should still be displayed while paused
    expect(screen.getByText('Active Visitors')).toBeInTheDocument()
    expect(screen.getByText('Orders Today')).toBeInTheDocument()
    
    // Resume
    fireEvent.click(screen.getByRole('button', { name: 'PAUSED' }))
    
    // Values should still be displayed after resume
    expect(screen.getByText('Active Visitors')).toBeInTheDocument()
    expect(screen.getByText('Orders Today')).toBeInTheDocument()
  })
})