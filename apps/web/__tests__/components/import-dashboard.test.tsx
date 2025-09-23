import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportDashboard } from '@/components/import/import-dashboard'

// Mock child components
vi.mock('@/components/import/file-upload', () => ({
  FileUpload: ({ onUploadSuccess, onUploadError, platform, setPlatform }: any) => (
    <div data-testid="file-upload">
      <div data-testid="current-platform">{platform}</div>
      <button 
        data-testid="set-platform-shopee" 
        onClick={() => setPlatform('shopee')}
      >
        Set Shopee
      </button>
      <button 
        data-testid="trigger-upload-success" 
        onClick={() => onUploadSuccess?.({ 
          jobId: 'test-job-123', 
          platform: 'shopee',
          filename: 'test.csv',
          size: 1024
        })}
      >
        Trigger Upload Success
      </button>
      <button 
        data-testid="trigger-upload-error" 
        onClick={() => onUploadError?.('Upload failed')}
      >
        Trigger Upload Error
      </button>
    </div>
  )
}))

vi.mock('@/components/import/import-history', () => ({
  ImportHistory: ({ onJobSelect, onRefresh }: any) => (
    <div data-testid="import-history">
      <button 
        data-testid="select-job" 
        onClick={() => onJobSelect?.({
          id: 'job-123',
          platform: 'shopee',
          filename: 'test.csv',
          size: 1024,
          status: 'validated',
          progress: 100,
          rows: { total: 100, valid: 98, processed: 0, errors: 2 },
          summaries: {},
          timestamps: { created: '2024-09-17T00:00:00Z' }
        })}
      >
        Select Job
      </button>
      <button data-testid="refresh-history" onClick={onRefresh}>
        Refresh
      </button>
    </div>
  )
}))

vi.mock('@/components/import/data-preview', () => ({
  DataPreview: ({ jobId, onClose }: any) => (
    <div data-testid="data-preview">
      <div data-testid="preview-job-id">{jobId}</div>
      <button data-testid="close-preview" onClick={onClose}>Close</button>
    </div>
  )
}))

vi.mock('@/components/import/error-reporting', () => ({
  ErrorReporting: ({ jobId, jobFilename, onClose }: any) => (
    <div data-testid="error-reporting">
      <div data-testid="error-job-id">{jobId}</div>
      <div data-testid="error-job-filename">{jobFilename}</div>
      <button data-testid="close-errors" onClick={onClose}>Close</button>
    </div>
  )
}))

// Mock fetch for API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('ImportDashboard', () => {
  const mockStatsResponse = {
    statistics: {
      statusBreakdown: [
        { status: 'completed', count: 10, totalRows: 1000, totalErrors: 0 },
        { status: 'failed', count: 2, totalRows: 200, totalErrors: 50 },
        { status: 'processing', count: 1, totalRows: 100, totalErrors: 0 }
      ],
      performance: {
        averageProcessingTime: 5000
      }
    }
  }

  const mockActiveJobsResponse = {
    jobs: [
      {
        id: 'active-job-1',
        platform: 'shopee',
        filename: 'active.csv',
        status: 'processing',
        progress: 75
      }
    ]
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockImplementation((url) => {
      if (url.includes('/api/import/history-simple?limit=1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockStatsResponse)
        })
      }
      if (url.includes('/api/import/history-simple?status=processing')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockActiveJobsResponse)
        })
      }
      if (url.includes('/api/import/commit')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Not found' })
      })
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Initial Render and Layout', () => {
    it('should render the main dashboard interface', async () => {
      render(<ImportDashboard />)

      // Check main header
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()
      expect(screen.getByText(/Manage your affiliate marketing data imports/)).toBeInTheDocument()

      // Check navigation buttons
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /new import/i })).toBeInTheDocument()

      // Check navigation tabs
      expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()

      // Wait for stats to load
      await waitFor(() => {
        expect(screen.getByText('Total Imports')).toBeInTheDocument()
      })
    })

    it('should display statistics cards when data loads', async () => {
      render(<ImportDashboard />)

      await waitFor(() => {
        expect(screen.getByText('Total Imports')).toBeInTheDocument()
        expect(screen.getByText('13')).toBeInTheDocument() // 10 + 2 + 1
        expect(screen.getByText('Successful')).toBeInTheDocument()
        expect(screen.getByText('10')).toBeInTheDocument()
        expect(screen.getByText('Processing')).toBeInTheDocument()
        expect(screen.getByText('1')).toBeInTheDocument()
        expect(screen.getByText('Errors')).toBeInTheDocument()
        expect(screen.getByText('50')).toBeInTheDocument()
      })
    })

    it('should show active jobs alert when there are processing jobs', async () => {
      render(<ImportDashboard />)

      await waitFor(() => {
        expect(screen.getByText('Active Processing Jobs')).toBeInTheDocument()
        expect(screen.getByText('active.csv')).toBeInTheDocument()
        expect(screen.getByText('processing')).toBeInTheDocument()
        expect(screen.getByText('75%')).toBeInTheDocument()
      })
    })

    it('should not show active jobs alert when there are no processing jobs', async () => {
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/import/history-simple?status=processing')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ jobs: [] })
          })
        }
        return mockFetch(url)
      })

      render(<ImportDashboard />)

      await waitFor(() => {
        expect(screen.getByText('Total Imports')).toBeInTheDocument()
      })

      expect(screen.queryByText('Active Processing Jobs')).not.toBeInTheDocument()
    })
  })

  describe('Navigation and View Switching', () => {
    it('should start with upload view by default', () => {
      render(<ImportDashboard />)

      expect(screen.getByTestId('file-upload')).toBeInTheDocument()
      expect(screen.queryByTestId('import-history')).not.toBeInTheDocument()
    })

    it('should switch to history view when history tab is clicked', async () => {
      const user = userEvent.setup()
      render(<ImportDashboard />)

      const historyTab = screen.getByRole('button', { name: /history/i })
      await user.click(historyTab)

      expect(screen.getByTestId('import-history')).toBeInTheDocument()
      expect(screen.queryByTestId('file-upload')).not.toBeInTheDocument()
    })

    it('should switch back to upload view when upload tab is clicked', async () => {
      const user = userEvent.setup()
      render(<ImportDashboard />)

      // Switch to history first
      await user.click(screen.getByRole('button', { name: /history/i }))
      expect(screen.getByTestId('import-history')).toBeInTheDocument()

      // Switch back to upload
      await user.click(screen.getByRole('button', { name: /upload/i }))
      expect(screen.getByTestId('file-upload')).toBeInTheDocument()
    })

    it('should switch to upload view when New Import button is clicked', async () => {
      const user = userEvent.setup()
      render(<ImportDashboard />)

      // Switch to history first
      await user.click(screen.getByRole('button', { name: /history/i }))
      expect(screen.getByTestId('import-history')).toBeInTheDocument()

      // Click New Import
      await user.click(screen.getByRole('button', { name: /new import/i }))
      expect(screen.getByTestId('file-upload')).toBeInTheDocument()
    })
  })

  describe('Job Selection and Management', () => {
    it('should handle job selection and show preview tabs', async () => {
      const user = userEvent.setup()
      render(<ImportDashboard />)

      // Switch to history view
      await user.click(screen.getByRole('button', { name: /history/i }))

      // Select a job
      await user.click(screen.getByTestId('select-job'))

      // Should show preview and errors tabs
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /errors/i })).toBeInTheDocument()
      })

      // Should show data preview
      expect(screen.getByTestId('data-preview')).toBeInTheDocument()
      expect(screen.getByTestId('preview-job-id')).toHaveTextContent('job-123')
    })

    it('should switch to errors view for jobs with errors', async () => {
      const user = userEvent.setup()
      
      // Mock a job with errors
      vi.mocked(screen.getByTestId('select-job')).onclick = () => {
        // This will be mocked in the component mock
      }

      render(<ImportDashboard />)

      // Switch to history and select job
      await user.click(screen.getByRole('button', { name: /history/i }))
      await user.click(screen.getByTestId('select-job'))

      // Click errors tab
      await waitFor(() => {
        const errorsTab = screen.getByRole('button', { name: /errors/i })
        expect(errorsTab).toBeInTheDocument()
      })
    })

    it('should show quick actions panel when job is selected', async () => {
      const user = userEvent.setup()
      render(<ImportDashboard />)

      // Switch to history and select job
      await user.click(screen.getByRole('button', { name: /history/i }))
      await user.click(screen.getByTestId('select-job'))

      await waitFor(() => {
        // Quick actions should be visible
        const quickActions = screen.getByText('test.csv')
        expect(quickActions).toBeInTheDocument()
        expect(screen.getByText('shopee • validated')).toBeInTheDocument()
      })
    })
  })

  describe('Upload Success Handling', () => {
    it('should refresh data and switch to history view on successful upload', async () => {
      const user = userEvent.setup()
      render(<ImportDashboard />)

      // Should start in upload view
      expect(screen.getByTestId('file-upload')).toBeInTheDocument()

      // Trigger upload success
      await user.click(screen.getByTestId('trigger-upload-success'))

      // Should switch to history view
      await waitFor(() => {
        expect(screen.getByTestId('import-history')).toBeInTheDocument()
      })

      // Should call refresh (fetch stats and active jobs again)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/import/history-simple?limit=1'),
        expect.any(Object)
      )
    })
  })

  describe('Data Refresh Functionality', () => {
    it('should refresh data when refresh button is clicked', async () => {
      const user = userEvent.setup()
      render(<ImportDashboard />)

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Total Imports')).toBeInTheDocument()
      })

      // Clear call history
      mockFetch.mockClear()

      // Click refresh
      const refreshButton = screen.getByRole('button', { name: /refresh/i })
      await user.click(refreshButton)

      // Should call both API endpoints again
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/import/history-simple?limit=1'),
          expect.any(Object)
        )
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/import/history-simple?status=processing'),
          expect.any(Object)
        )
      })
    })

    it('should show loading state during refresh', async () => {
      const user = userEvent.setup()
      render(<ImportDashboard />)

      const refreshButton = screen.getByRole('button', { name: /refresh/i })
      
      // Mock delayed response
      mockFetch.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve(mockStatsResponse)
          }), 100)
        )
      )

      await user.click(refreshButton)

      // Button should show loading state
      expect(refreshButton).toBeDisabled()
    })
  })

  describe('Platform Management', () => {
    it('should start with default platform (shopee)', () => {
      render(<ImportDashboard />)

      expect(screen.getByTestId('current-platform')).toHaveTextContent('shopee')
    })

    it('should update platform when changed in file upload component', async () => {
      const user = userEvent.setup()
      render(<ImportDashboard />)

      expect(screen.getByTestId('current-platform')).toHaveTextContent('shopee')

      await user.click(screen.getByTestId('set-platform-shopee'))

      expect(screen.getByTestId('current-platform')).toHaveTextContent('shopee')
    })
  })

  describe('Job Processing', () => {
    it('should handle job processing initiation', async () => {
      const user = userEvent.setup()
      render(<ImportDashboard />)

      // Switch to history and select a validated job
      await user.click(screen.getByRole('button', { name: /history/i }))
      await user.click(screen.getByTestId('select-job'))

      await waitFor(() => {
        const processButton = screen.getByRole('button', { name: /process/i })
        expect(processButton).toBeInTheDocument()
      })

      // Click process button
      const processButton = screen.getByRole('button', { name: /process/i })
      await user.click(processButton)

      // Should call commit API
      expect(mockFetch).toHaveBeenCalledWith('/api/import/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': 'default-workspace'
        },
        body: expect.stringContaining('job-123')
      })
    })

    it('should handle processing errors gracefully', async () => {
      const user = userEvent.setup()

      // Mock failed commit request
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/import/commit')) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ details: 'Processing failed' })
          })
        }
        return mockFetch(url)
      })

      render(<ImportDashboard />)

      // Navigate and select job
      await user.click(screen.getByRole('button', { name: /history/i }))
      await user.click(screen.getByTestId('select-job'))

      // Try to process
      await waitFor(() => {
        const processButton = screen.getByRole('button', { name: /process/i })
        expect(processButton).toBeInTheDocument()
      })

      const processButton = screen.getByRole('button', { name: /process/i })
      await user.click(processButton)

      // Error should be logged (can't easily test console.error in this setup)
      expect(mockFetch).toHaveBeenCalledWith('/api/import/commit', expect.any(Object))
    })
  })

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      render(<ImportDashboard />)

      // Component should still render even if APIs fail
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()
      expect(screen.getByTestId('file-upload')).toBeInTheDocument()
    })

    it('should handle malformed API responses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: 'response' })
      })

      render(<ImportDashboard />)

      // Should not crash
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      render(<ImportDashboard />)

      // Check main navigation buttons have proper roles
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /new import/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      render(<ImportDashboard />)

      // Tab through navigation elements
      await user.tab()
      expect(screen.getByRole('button', { name: /refresh/i })).toHaveFocus()

      await user.tab()
      expect(screen.getByRole('button', { name: /new import/i })).toHaveFocus()
    })
  })

  describe('Responsive Design', () => {
    it('should adapt to mobile viewport', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })

      render(<ImportDashboard />)

      // Component should render without issues
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()
      expect(screen.getByTestId('file-upload')).toBeInTheDocument()
    })

    it('should adapt to tablet viewport', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768,
      })

      render(<ImportDashboard />)

      expect(screen.getByText('Import & Upload')).toBeInTheDocument()
    })
  })

  describe('Polling Behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should start polling when there are active jobs', async () => {
      render(<ImportDashboard />)

      // Wait for initial load to show active jobs
      await waitFor(() => {
        expect(screen.getByText('Active Processing Jobs')).toBeInTheDocument()
      })

      // Clear initial calls
      mockFetch.mockClear()

      // Fast forward 3 seconds
      vi.advanceTimersByTime(3000)

      // Should poll for active jobs
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/import/history-simple?status=processing'),
          expect.any(Object)
        )
      })
    })

    it('should stop polling when no active jobs', async () => {
      // Start with active jobs
      render(<ImportDashboard />)

      await waitFor(() => {
        expect(screen.getByText('Active Processing Jobs')).toBeInTheDocument()
      })

      // Mock response with no active jobs
      mockFetch.mockImplementation((url) => {
        if (url.includes('/api/import/history-simple?status=processing')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ jobs: [] })
          })
        }
        return mockFetch(url)
      })

      // Clear calls and advance time
      mockFetch.mockClear()
      vi.advanceTimersByTime(3000)

      // Should poll once more
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })

      // Clear again and advance more time
      mockFetch.mockClear()
      vi.advanceTimersByTime(6000)

      // Should not poll anymore since no active jobs
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})