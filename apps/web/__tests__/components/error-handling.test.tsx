import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportDashboard } from '@/components/import/import-dashboard'
import { FileUpload } from '@/components/import/file-upload'

// Mock dependencies
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

// Mock console methods to test error logging
const consoleSpy = {
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  log: vi.spyOn(console, 'log').mockImplementation(() => {})
}

// Mock fetch for API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

// Utility functions
const createMockFile = (name = 'test.csv', type = 'text/csv', size = 1024) => {
  const content = 'Order ID,Product Name\nSH123,Test Product'
  return new File([content], name, { type, lastModified: Date.now() })
}

const createOversizedFile = () => {
  // Create a file larger than 50MB
  const largeContent = 'x'.repeat(51 * 1024 * 1024)
  return new File([largeContent], 'large-file.csv', { type: 'text/csv' })
}

const createInvalidFile = () => {
  return new File(['invalid content'], 'test.exe', { type: 'application/exe' })
}

const createEmptyFile = () => {
  return new File([], 'empty.csv', { type: 'text/csv' })
}

describe('Error Handling Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy.error.mockClear()
    consoleSpy.warn.mockClear()
    consoleSpy.log.mockClear()
    
    // Default successful mock responses
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
    vi.resetAllMocks()
  })

  describe('Network Error Handling', () => {
    it('should handle network failures gracefully in dashboard', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      render(<ImportDashboard />)

      // Component should still render despite network failure
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()
      expect(screen.getByTestId('file-upload')).toBeInTheDocument()

      // Error should be logged
      await waitFor(() => {
        expect(consoleSpy.error).toHaveBeenCalledWith(
          'Failed to fetch stats:',
          expect.any(Error)
        )
      })
    })

    it('should handle upload network errors', async () => {
      const user = userEvent.setup()
      const mockOnUploadError = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={mockOnUploadError}
          />
        )
      }

      mockFetch.mockRejectedValue(new Error('Network timeout'))

      render(<TestComponent />)

      // Add a file
      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      // Try to upload
      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      // Should handle the error
      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalledWith('Network timeout')
      })
    })

    it('should handle timeout errors during upload', async () => {
      const user = userEvent.setup()
      const mockOnUploadError = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={mockOnUploadError}
          />
        )
      }

      // Mock timeout error
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      )

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalledWith('Request timeout')
      }, { timeout: 1000 })
    })
  })

  describe('API Error Response Handling', () => {
    it('should handle 400 Bad Request errors', async () => {
      const user = userEvent.setup()
      const mockOnUploadError = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={mockOnUploadError}
          />
        )
      }

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'Invalid file type',
          details: 'Only CSV files are allowed'
        })
      })

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalledWith('Only CSV files are allowed')
      })
    })

    it('should handle 401 Unauthorized errors', async () => {
      const user = userEvent.setup()
      const mockOnUploadError = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={mockOnUploadError}
          />
        )
      }

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'Unauthorized',
          details: 'Authentication required'
        })
      })

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalledWith('Authentication required')
      })
    })

    it('should handle 500 Internal Server Error', async () => {
      const user = userEvent.setup()
      const mockOnUploadError = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={mockOnUploadError}
          />
        )
      }

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          error: 'Internal server error',
          details: 'An unexpected error occurred'
        })
      })

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalledWith('An unexpected error occurred')
      })
    })

    it('should handle malformed JSON responses', async () => {
      const user = userEvent.setup()
      const mockOnUploadError = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={mockOnUploadError}
          />
        )
      }

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.reject(new Error('Invalid JSON'))
      })

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalledWith('Upload failed')
      })
    })
  })

  describe('File Validation Error Handling', () => {
    it('should handle oversized files', async () => {
      const mockOnUploadError = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={mockOnUploadError}
          />
        )
      }

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const oversizedFile = createOversizedFile()

      Object.defineProperty(fileInput, 'files', {
        value: [oversizedFile],
        configurable: true,
      })

      fireEvent.change(fileInput)

      // File should be marked as error
      await waitFor(() => {
        expect(screen.getByText('large-file.csv')).toBeInTheDocument()
        expect(screen.getByText('File size must not exceed 50MB')).toBeInTheDocument()
      })
    })

    it('should handle invalid file types', async () => {
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

      const fileInput = screen.getByDisplayValue('')
      const invalidFile = createInvalidFile()

      Object.defineProperty(fileInput, 'files', {
        value: [invalidFile],
        configurable: true,
      })

      fireEvent.change(fileInput)

      // File should be marked as error
      await waitFor(() => {
        expect(screen.getByText('test.exe')).toBeInTheDocument()
        expect(screen.getByText('Only CSV files are allowed')).toBeInTheDocument()
      })
    })

    it('should handle empty files', async () => {
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

      const fileInput = screen.getByDisplayValue('')
      const emptyFile = createEmptyFile()

      Object.defineProperty(fileInput, 'files', {
        value: [emptyFile],
        configurable: true,
      })

      fireEvent.change(fileInput)

      // File should be marked as error
      await waitFor(() => {
        expect(screen.getByText('empty.csv')).toBeInTheDocument()
        expect(screen.getByText('File is empty')).toBeInTheDocument()
      })
    })

    it('should handle too many files', async () => {
      const mockOnUploadError = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={mockOnUploadError}
            maxFiles={2}
          />
        )
      }

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const files = [
        createMockFile('file1.csv'),
        createMockFile('file2.csv'),
        createMockFile('file3.csv') // Exceeds maxFiles=2
      ]

      Object.defineProperty(fileInput, 'files', {
        value: files,
        configurable: true,
      })

      fireEvent.change(fileInput)

      expect(mockOnUploadError).toHaveBeenCalledWith('Cannot upload more than 2 files at once')
    })
  })

  describe('Validation Error Handling', () => {
    it('should handle validation API errors', async () => {
      const user = userEvent.setup()
      const mockOnValidationComplete = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={() => {}}
            onValidationComplete={mockOnValidationComplete}
          />
        )
      }

      // Mock successful upload followed by failed validation
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            jobId: 'test-job-123',
            platform: 'shopee',
            filename: 'test.csv',
            size: 1024
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({
            error: 'Validation failed',
            details: 'Invalid CSV format'
          })
        })

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText('Invalid CSV format')).toBeInTheDocument()
      })
    })

    it('should handle validation with warnings', async () => {
      const user = userEvent.setup()
      const mockOnValidationComplete = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={() => {}}
            onValidationComplete={mockOnValidationComplete}
          />
        )
      }

      // Mock successful upload followed by validation with warnings
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            jobId: 'test-job-123',
            platform: 'shopee',
            filename: 'test.csv',
            size: 1024
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            isValid: false,
            criticalErrors: [
              { row: 2, message: 'Invalid date format', type: 'validation' },
              { row: 3, message: 'Missing required field', type: 'validation' }
            ],
            summary: {
              totalRows: 100,
              validRows: 98,
              invalidRows: 2
            }
          })
        })

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      // Should show validation warnings
      await waitFor(() => {
        expect(screen.getByText('2 validation error(s)')).toBeInTheDocument()
        expect(mockOnValidationComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            isValid: false,
            criticalErrors: expect.arrayContaining([
              expect.objectContaining({ message: 'Invalid date format' })
            ])
          })
        )
      })
    })
  })

  describe('Authentication Error Handling', () => {
    it('should handle authentication failures in dashboard', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'Unauthorized',
          details: 'Session expired'
        })
      })

      render(<ImportDashboard />)

      // Component should still render
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()

      // Error should be logged
      await waitFor(() => {
        expect(consoleSpy.error).toHaveBeenCalled()
      })
    })

    it('should handle CSRF token errors', async () => {
      const user = userEvent.setup()
      const mockOnUploadError = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={mockOnUploadError}
          />
        )
      }

      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({
          error: 'CSRF verification failed',
          details: 'Invalid CSRF token'
        })
      })

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalledWith('Invalid CSRF token')
      })
    })
  })

  describe('Component State Error Handling', () => {
    it('should handle missing platform gracefully', async () => {
      const user = userEvent.setup()
      const mockOnUploadError = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={mockOnUploadError}
          />
        )
      }

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      expect(mockOnUploadError).toHaveBeenCalledWith('Please select a platform')
    })

    it('should handle malformed upload response', async () => {
      const user = userEvent.setup()
      const mockOnUploadError = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={mockOnUploadError}
          />
        )
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          // Missing required fields like jobId
          success: true,
          platform: 'shopee'
        })
      })

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      // Should handle the incomplete response gracefully
      await waitFor(() => {
        // File should be marked as uploaded even without validation
        expect(screen.getByText('test.csv')).toBeInTheDocument()
      })
    })
  })

  describe('Recovery and Retry Mechanisms', () => {
    it('should allow retry after upload failure', async () => {
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

      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
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

      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      // First upload fails
      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      // Should show error state
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })

      // Should show retry button
      const retryButton = screen.getByTitle('Retry upload')
      expect(retryButton).toBeInTheDocument()

      // Retry should succeed
      await user.click(retryButton)

      await waitFor(() => {
        expect(screen.queryByText('Network error')).not.toBeInTheDocument()
      })
    })

    it('should handle processing errors with retry option', async () => {
      const user = userEvent.setup()

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            statistics: {
              statusBreakdown: [],
              performance: { averageProcessingTime: 0 }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ jobs: [] })
        })
        .mockRejectedValueOnce(new Error('Processing failed'))

      render(<ImportDashboard />)

      // Switch to history and trigger a processing action
      const historyTab = screen.getByRole('button', { name: /history/i })
      await user.click(historyTab)

      // Should handle the error gracefully
      expect(screen.getByText('Import & Upload')).toBeInTheDocument()
    })
  })

  describe('Error State UI', () => {
    it('should display error badges correctly', async () => {
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

      const fileInput = screen.getByDisplayValue('')
      const invalidFile = createInvalidFile()

      Object.defineProperty(fileInput, 'files', {
        value: [invalidFile],
        configurable: true,
      })

      fireEvent.change(fileInput)

      // Should show error badge
      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument()
        expect(screen.getByText('Only CSV files are allowed')).toBeInTheDocument()
      })
    })

    it('should show appropriate error icons', async () => {
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

      const fileInput = screen.getByDisplayValue('')
      const emptyFile = createEmptyFile()

      Object.defineProperty(fileInput, 'files', {
        value: [emptyFile],
        configurable: true,
      })

      fireEvent.change(fileInput)

      // Should show error state with appropriate visual indicators
      await waitFor(() => {
        expect(screen.getByText('empty.csv')).toBeInTheDocument()
        const errorText = screen.getByText('File is empty')
        expect(errorText).toHaveClass('text-red-600')
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle concurrent upload failures', async () => {
      const user = userEvent.setup()
      const mockOnUploadError = vi.fn()

      const TestComponent = () => {
        const [platform, setPlatform] = React.useState('shopee')
        return (
          <FileUpload
            platform={platform}
            setPlatform={setPlatform}
            onUploadSuccess={() => {}}
            onUploadError={mockOnUploadError}
          />
        )
      }

      mockFetch.mockRejectedValue(new Error('Concurrent error'))

      render(<TestComponent />)

      const fileInput = screen.getByDisplayValue('')
      const files = [
        createMockFile('file1.csv'),
        createMockFile('file2.csv')
      ]

      Object.defineProperty(fileInput, 'files', {
        value: files,
        configurable: true,
      })

      fireEvent.change(fileInput)

      const uploadButton = screen.getByRole('button', { name: /upload all/i })
      await user.click(uploadButton)

      // Should handle multiple concurrent errors
      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalledTimes(2)
      })
    })

    it('should handle errors during component unmounting', () => {
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

      const { unmount } = render(<TestComponent />)

      // Add a file to trigger internal state
      const fileInput = screen.getByDisplayValue('')
      const file = createMockFile()

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      })

      fireEvent.change(fileInput)

      // Should unmount without errors
      expect(() => unmount()).not.toThrow()
    })
  })
})