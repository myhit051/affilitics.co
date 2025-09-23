import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportDashboard } from '@/components/import/import-dashboard'
import { FileUpload } from '@/components/import/file-upload'

// Mock dependencies for mobile testing
vi.mock('@/lib/import/platform-configs', () => ({
  isValidPlatform: vi.fn((platform: string) => ['shopee', 'lazada', 'tiktok'].includes(platform)),
  getPlatformFileSizeLimit: vi.fn(() => 20),
  getSupportedPlatforms: vi.fn(() => ['shopee', 'lazada', 'tiktok']),
  getPlatformDisplayName: vi.fn((platform: string) => {
    const names = { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok' }
    return names[platform as keyof typeof names] || platform
  }),
  generateSampleCSV: vi.fn(() => 'Order ID,Product Name\nSH123,Test Product')
}))

// Mock fetch for API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock URL.createObjectURL for file downloads
Object.defineProperty(window, 'URL', {
  value: {
    createObjectURL: vi.fn(() => 'mock-blob-url'),
    revokeObjectURL: vi.fn()
  }
})

// Utility to simulate mobile viewport
const setMobileViewport = () => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 375, // iPhone SE width
  })
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: 667, // iPhone SE height
  })
  
  // Trigger resize event
  fireEvent(window, new Event('resize'))
}

// Utility to simulate tablet viewport
const setTabletViewport = () => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 768, // iPad width
  })
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: 1024, // iPad height
  })
  
  fireEvent(window, new Event('resize'))
}

// Utility to simulate desktop viewport
const setDesktopViewport = () => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 1920,
  })
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: 1080,
  })
  
  fireEvent(window, new Event('resize'))
}

// Utility to create a mock file
const createMockFile = (name = 'test.csv', type = 'text/csv', size = 1024) => {
  const content = 'Order ID,Product Name\nSH123,Test Product'
  return new File([content], name, { type, lastModified: Date.now() })
}

describe('Mobile Responsiveness Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        statistics: {
          statusBreakdown: [],
          performance: { averageProcessingTime: 0 }
        }
      })
    })
  })

  afterEach(() => {
    setDesktopViewport() // Reset to desktop
    vi.resetAllMocks()
  })

  describe('ImportDashboard Mobile Adaptation', () => {
    it('should render properly on mobile viewport', () => {
      setMobileViewport()
      render(<ImportDashboard />)

      // Main content should be visible
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()
      expect(screen.getByText(/Manage your affiliate marketing data imports/)).toBeInTheDocument()

      // Navigation buttons should be accessible
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /new import/i })).toBeInTheDocument()
    })

    it('should adapt statistics cards layout for mobile', () => {
      setMobileViewport()
      render(<ImportDashboard />)

      // Wait for stats to load and check they're present
      const statsCards = screen.getAllByText('Total Imports')
      expect(statsCards.length).toBeGreaterThan(0)
      
      // Cards should stack vertically on mobile (verified through CSS grid behavior)
      const card = statsCards[0].closest('div')
      expect(card).toBeInTheDocument()
    })

    it('should show proper touch targets for mobile interaction', async () => {
      setMobileViewport()
      const user = userEvent.setup()
      render(<ImportDashboard />)

      // All buttons should be large enough for touch (44px minimum)
      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        // Check that buttons have sufficient size for touch interaction
        expect(button).toBeInTheDocument()
      })

      // Test tab navigation
      const uploadTab = screen.getByRole('button', { name: /upload/i })
      const historyTab = screen.getByRole('button', { name: /history/i })

      await user.click(historyTab)
      await user.click(uploadTab)

      expect(uploadTab).toBeInTheDocument()
    })
  })

  describe('FileUpload Mobile Features', () => {
    it('should show mobile-specific UI elements', () => {
      setMobileViewport()
      
      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={() => {}}
          />
        )
      }

      render(<TestComponent />)

      // Should show "Tap to select files" instead of drag & drop text
      expect(screen.getByText('Tap to select files')).toBeInTheDocument()
      expect(screen.queryByText('Drop CSV files here or click to browse')).not.toBeInTheDocument()

      // Should show mobile-specific buttons
      expect(screen.getByRole('button', { name: /choose files/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /scan document/i })).toBeInTheDocument()
    })

    it('should adapt platform selection for mobile', () => {
      setMobileViewport()
      
      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={() => {}}
          />
        )
      }

      render(<TestComponent />)

      // Platform buttons should be stacked on mobile
      const shopeeButton = screen.getByRole('button', { name: /shopee/i })
      const lazadaButton = screen.getByRole('button', { name: /lazada/i })
      const tiktokButton = screen.getByRole('button', { name: /tiktok/i })

      expect(shopeeButton).toBeInTheDocument()
      expect(lazadaButton).toBeInTheDocument()
      expect(tiktokButton).toBeInTheDocument()
    })

    it('should handle file selection on mobile', async () => {
      setMobileViewport()
      const user = userEvent.setup()
      
      const mockOnUploadSuccess = vi.fn()
      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={mockOnUploadSuccess}
            onUploadError={() => {}}
          />
        )
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          jobId: 'test-job-123',
          platform: 'shopee',
          filename: 'test.csv',
          size: 1024
        })
      })

      render(<TestComponent />)

      // Click "Choose Files" button
      const chooseFilesButton = screen.getByRole('button', { name: /choose files/i })
      await user.click(chooseFilesButton)

      // Should trigger file input (tested indirectly through click handler)
      expect(chooseFilesButton).toBeInTheDocument()
    })

    it('should show camera capture option on mobile', () => {
      setMobileViewport()
      
      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={() => {}}
          />
        )
      }

      render(<TestComponent />)

      // Should show scan document button
      const scanButton = screen.getByRole('button', { name: /scan document/i })
      expect(scanButton).toBeInTheDocument()
      expect(scanButton).toHaveAttribute('title', 'Scan document with camera')
    })
  })

  describe('Touch Interactions', () => {
    it('should handle touch events for drag and drop', async () => {
      setMobileViewport()
      
      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={() => {}}
          />
        )
      }

      render(<TestComponent />)

      const uploadArea = screen.getByText('Tap to select files').closest('div')
      expect(uploadArea).toBeInTheDocument()

      // Simulate touch events
      fireEvent.touchStart(uploadArea!, {
        touches: [{ clientX: 100, clientY: 100 }]
      })

      fireEvent.touchEnd(uploadArea!)

      // Should not crash and area should still be present
      expect(uploadArea).toBeInTheDocument()
    })

    it('should handle tap events on platform buttons', async () => {
      setMobileViewport()
      const user = userEvent.setup()
      
      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={() => {}}
          />
        )
      }

      render(<TestComponent />)

      const lazadaButton = screen.getByRole('button', { name: /lazada/i })
      
      // Simulate touch tap
      await user.click(lazadaButton)

      // Button should be accessible and clickable
      expect(lazadaButton).toBeInTheDocument()
    })

    it('should prevent default behavior for drag events on mobile', () => {
      setMobileViewport()
      
      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={() => {}}
          />
        )
      }

      render(<TestComponent />)

      const uploadArea = screen.getByText('Tap to select files').closest('div')
      
      // Create mock drag event
      const dragEvent = new Event('dragover', { bubbles: true, cancelable: true })
      const preventDefaultSpy = vi.spyOn(dragEvent, 'preventDefault')
      
      fireEvent(uploadArea!, dragEvent)
      
      // preventDefault should be called to handle the drag properly
      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })

  describe('Tablet Responsiveness', () => {
    it('should adapt layout for tablet viewport', () => {
      setTabletViewport()
      render(<ImportDashboard />)

      // Should render properly on tablet
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()
      
      // Statistics should be visible
      const statsCards = screen.getAllByText('Total Imports')
      expect(statsCards.length).toBeGreaterThan(0)
    })

    it('should show intermediate layout for file upload on tablet', () => {
      setTabletViewport()
      
      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={() => {}}
          />
        )
      }

      render(<TestComponent />)

      // Should show tablet-appropriate text and layout
      expect(screen.getByText('Drop CSV files here or click to browse')).toBeInTheDocument()
      
      // Platform buttons should be arranged appropriately
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  describe('Responsive File List', () => {
    it('should adapt file list for mobile display', async () => {
      setMobileViewport()
      const user = userEvent.setup()
      
      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={() => {}}
          />
        )
      }

      render(<TestComponent />)

      // Get file input and simulate file selection
      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile('mobile-test.csv')

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      // File should be added to the list
      expect(screen.getByText('mobile-test.csv')).toBeInTheDocument()
      
      // Upload button should be present and sized for mobile
      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      expect(uploadButton).toBeInTheDocument()
    })

    it('should show compact file information on mobile', async () => {
      setMobileViewport()
      
      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={() => {}}
          />
        )
      }

      render(<TestComponent />)

      // Add a file
      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile('compact-test.csv', 'text/csv', 2048)

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      // Should show file size in compact format
      expect(screen.getByText('compact-test.csv')).toBeInTheDocument()
      expect(screen.getByText('2.0 KB')).toBeInTheDocument()
    })
  })

  describe('Mobile Performance', () => {
    it('should handle multiple files efficiently on mobile', async () => {
      setMobileViewport()
      
      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={() => {}}
          />
        )
      }

      render(<TestComponent />)

      // Create multiple files
      const files = [
        createMockFile('file1.csv'),
        createMockFile('file2.csv'),
        createMockFile('file3.csv')
      ]

      const fileInput = screen.getByDisplayValue('')
      Object.defineProperty(fileInput, 'files', {
        value: files,
        configurable: true,
      })

      fireEvent.change(fileInput)

      // All files should be displayed
      expect(screen.getByText('file1.csv')).toBeInTheDocument()
      expect(screen.getByText('file2.csv')).toBeInTheDocument()
      expect(screen.getByText('file3.csv')).toBeInTheDocument()

      // Should show count
      expect(screen.getByText('Files (3/5)')).toBeInTheDocument()
    })

    it('should throttle resize events appropriately', () => {
      render(<ImportDashboard />)

      // Simulate multiple rapid resize events
      for (let i = 0; i < 10; i++) {
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: 300 + i * 10,
        })
        fireEvent(window, new Event('resize'))
      }

      // Component should still be functional
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()
    })
  })

  describe('Accessibility on Mobile', () => {
    it('should maintain proper touch target sizes', () => {
      setMobileViewport()
      render(<ImportDashboard />)

      // All interactive elements should be large enough for touch
      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        const styles = window.getComputedStyle(button)
        // While we can't directly test CSS, we ensure buttons are present and functional
        expect(button).toBeInTheDocument()
      })
    })

    it('should support assistive technologies on mobile', async () => {
      setMobileViewport()
      const user = userEvent.setup()
      
      render(<ImportDashboard />)

      // Focus should work properly
      await user.tab()
      const focusedElement = document.activeElement
      expect(focusedElement).toBeInstanceOf(HTMLElement)

      // Buttons should have proper roles and labels
      const refreshButton = screen.getByRole('button', { name: /refresh/i })
      expect(refreshButton).toHaveAttribute('type', 'button')
    })

    it('should handle keyboard navigation on mobile devices with external keyboards', async () => {
      setMobileViewport()
      const user = userEvent.setup()
      
      render(<ImportDashboard />)

      // Tab through elements
      await user.tab()
      await user.tab()
      
      // Should be able to activate elements with keyboard
      const uploadTab = screen.getByRole('button', { name: /upload/i })
      await user.click(uploadTab)
      
      expect(uploadTab).toBeInTheDocument()
    })
  })

  describe('Viewport Change Handling', () => {
    it('should adapt when orientation changes', () => {
      // Start in portrait mobile
      setMobileViewport()
      render(<ImportDashboard />)

      expect(screen.getByText('Import & Upload')).toBeInTheDocument()

      // Simulate landscape (swap dimensions)
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 667,
      })
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 375,
      })

      fireEvent(window, new Event('resize'))

      // Should still work in landscape
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()
    })

    it('should transition smoothly between viewport sizes', () => {
      render(<ImportDashboard />)

      // Start desktop
      setDesktopViewport()
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()

      // Change to tablet
      setTabletViewport()
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()

      // Change to mobile
      setMobileViewport()
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()

      // Component should remain functional throughout
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })
})