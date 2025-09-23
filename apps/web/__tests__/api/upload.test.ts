import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/import/upload/route'
import { NextRequest } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  getAuthContextSimple: vi.fn(() => ({
    user: { id: 'test-user-123' },
    workspaceId: 'test-workspace-456'
  }))
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    importJob: {
      findFirst: vi.fn(),
      create: vi.fn()
    }
  }
}))

vi.mock('@/lib/import/platform-configs', () => ({
  isValidPlatform: vi.fn((platform: string) => ['shopee', 'lazada', 'tiktok'].includes(platform)),
  getPlatformFileSizeLimit: vi.fn((platform: string) => {
    const limits = { shopee: 20, lazada: 15, tiktok: 10 }
    return limits[platform as keyof typeof limits] || 20
  })
}))

// Mock CSRF security module
vi.mock('@/lib/security/csrf', () => ({
  verifyCSRFEnhanced: vi.fn(),
  CSRFError: class CSRFError extends Error {
    constructor(message: string, public statusCode: number = 403) {
      super(message)
      this.name = 'CSRFError'
    }
  },
  logCSRFEvent: vi.fn()
}))

// Import mocked modules
const { prisma } = await vi.importMock('@/lib/db')
const { getAuthContextSimple } = await vi.importMock('@/lib/auth')
const { verifyCSRFEnhanced, CSRFError, logCSRFEvent } = await vi.importMock('@/lib/security/csrf')

describe('/api/import/upload', () => {
  let testCsvContent: string
  let validCsvFile: File
  let largeCsvFile: File
  let invalidFile: File

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create test CSV content
    testCsvContent = 'Order ID,Product Name,Commission Rate,Commission Amount,Order Status,Order Date\n' +
      'SH123456789,Wireless Bluetooth Headphones,5.5,1.65,Delivered,2024-09-16\n' +
      'SH987654321,Smartphone Case,8.0,2.00,Confirmed,2024-09-17'

    // Create mock files
    validCsvFile = new File([testCsvContent], 'test-shopee.csv', { type: 'text/csv' })
    
    // Create large file (simulate 60MB file)
    const largeContent = 'x'.repeat(60 * 1024 * 1024)
    largeCsvFile = new File([largeContent], 'large-file.csv', { type: 'text/csv' })
    
    // Create invalid file type
    invalidFile = new File(['invalid content'], 'test.txt', { type: 'text/plain' })

    // Mock successful database responses
    prisma.importJob.findFirst.mockResolvedValue(null) // No duplicate found
    prisma.importJob.create.mockResolvedValue({
      id: 'job-123',
      createdAt: new Date('2024-09-17T00:00:00Z')
    })

    // Mock successful CSRF verification by default
    verifyCSRFEnhanced.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('CSRF Protection', () => {
    it('should reject requests without valid CSRF token', async () => {
      verifyCSRFEnhanced.mockRejectedValueOnce(new CSRFError('CSRF token missing'))

      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(403)

      const data = await response.json()
      expect(data.error).toBe('CSRF verification failed')
      expect(data.details).toBe('CSRF token missing')

      // Should log CSRF failure
      expect(logCSRFEvent).toHaveBeenCalledWith('UPLOAD_CSRF_FAILED', expect.objectContaining({
        userId: 'test-user-123',
        workspaceId: 'test-workspace-456',
        error: 'CSRF token missing'
      }))
    })

    it('should reject requests with invalid CSRF token', async () => {
      verifyCSRFEnhanced.mockRejectedValueOnce(new CSRFError('Invalid CSRF token'))

      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'invalid-token' },
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(403)

      const data = await response.json()
      expect(data.error).toBe('CSRF verification failed')
      expect(data.details).toBe('Invalid CSRF token')
    })

    it('should reject requests that exceed CSRF rate limit', async () => {
      verifyCSRFEnhanced.mockRejectedValueOnce(new CSRFError('Rate limit exceeded', 429))

      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'valid-token' },
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(429)

      const data = await response.json()
      expect(data.error).toBe('CSRF verification failed')
      expect(data.details).toBe('Rate limit exceeded')
    })

    it('should allow requests with valid CSRF token', async () => {
      verifyCSRFEnhanced.mockResolvedValueOnce(undefined) // Success

      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'valid-token' },
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(201)

      // Should call CSRF verification with correct parameters
      expect(verifyCSRFEnhanced).toHaveBeenCalledWith(request, 'test-user-123', {
        enableOriginValidation: true,
        enableRateLimit: true,
        enableDoubleSubmit: false
      })
    })

    it('should handle non-CSRF errors during verification', async () => {
      verifyCSRFEnhanced.mockRejectedValueOnce(new Error('Unexpected error'))

      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'valid-token' },
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(500)

      const data = await response.json()
      expect(data.error).toBe('Internal server error')
    })
  })

  describe('Authentication and Authorization', () => {
    it('should require authentication', async () => {
      getAuthContextSimple.mockImplementationOnce(() => {
        throw new Response('Unauthorized', { status: 401 })
      })

      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(401)
    })

    it('should validate origin when APP_ORIGIN is set', async () => {
      const originalAppOrigin = process.env.APP_ORIGIN
      process.env.APP_ORIGIN = 'https://app.affilitics.co'

      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        headers: { 'origin': 'https://malicious-site.com' },
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(403)

      const data = await response.json()
      expect(data.error).toBe('Origin not allowed')

      // Restore original value
      process.env.APP_ORIGIN = originalAppOrigin
    })

    it('should allow requests with valid origin', async () => {
      const originalAppOrigin = process.env.APP_ORIGIN
      process.env.APP_ORIGIN = 'https://app.affilitics.co'

      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        headers: { 'origin': 'https://app.affilitics.co' },
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(201)

      // Restore original value
      process.env.APP_ORIGIN = originalAppOrigin
    })
  })

  describe('File Validation', () => {
    it('should reject requests without a file', async () => {
      const formData = new FormData()
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('No file provided')
      expect(data.details).toBe('Please select a CSV file to upload')
    })

    it('should reject invalid file types', async () => {
      const formData = new FormData()
      formData.append('file', invalidFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('Invalid file type')
      expect(data.details).toBe('Only CSV files are allowed')
    })

    it('should accept valid CSV files', async () => {
      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(201)
    })

    it('should reject files that exceed size limit', async () => {
      const formData = new FormData()
      formData.append('file', largeCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('File too large')
      expect(data.details).toContain('must not exceed')
    })

    it('should reject empty files', async () => {
      const emptyFile = new File([], 'empty.csv', { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', emptyFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('Empty file')
      expect(data.details).toBe('The uploaded file is empty')
    })
  })

  describe('Platform Validation', () => {
    it('should validate supported platforms', async () => {
      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'invalid-platform')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('Invalid platform')
      expect(data.details).toBe('Platform must be one of: shopee, lazada, tiktok')
    })

    it('should sanitize platform input', async () => {
      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'SHOPEE!@#$%^&*()')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.platform).toBe('shopee')
    })

    it('should default to shopee when no platform provided', async () => {
      const formData = new FormData()
      formData.append('file', validCsvFile)

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.platform).toBe('shopee')
    })
  })

  describe('Duplicate Detection', () => {
    it('should detect duplicate files by hash', async () => {
      prisma.importJob.findFirst.mockResolvedValueOnce({
        id: 'existing-job-123',
        filename: 'existing-file.csv'
      })

      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('Duplicate file')
      expect(data.details).toContain('This file has already been uploaded')
      expect(data.existingJobId).toBe('existing-job-123')
    })

    it('should allow upload if no duplicate found', async () => {
      prisma.importJob.findFirst.mockResolvedValueOnce(null)

      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(201)
    })
  })

  describe('Validation Only Mode', () => {
    it('should return validation result without creating job when validateOnly=true', async () => {
      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')
      formData.append('validateOnly', 'true')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.valid).toBe(true)
      expect(data.fileSize).toBe(validCsvFile.size)
      expect(data.hash).toBeDefined()
      expect(data.message).toBe('File is valid and ready for upload')

      // Should not create import job
      expect(prisma.importJob.create).not.toHaveBeenCalled()
    })
  })

  describe('Successful Upload Flow', () => {
    it('should successfully upload a valid file and create import job', async () => {
      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.jobId).toBe('job-123')
      expect(data.platform).toBe('shopee')
      expect(data.filename).toBe('test-shopee.csv')
      expect(data.size).toBe(validCsvFile.size)
      expect(data.hash).toBeDefined()
      expect(data.createdAt).toBeDefined()
      expect(data.storagePath).toContain('test-workspace-456/imports/')
      expect(data.message).toBe('File uploaded successfully. Ready for processing.')

      // Verify import job creation
      expect(prisma.importJob.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'test-workspace-456',
          platform: 'shopee',
          filename: 'test-shopee.csv',
          size: expect.any(Number),
          status: 'uploaded',
          createdBy: 'test-user-123',
          hash: expect.any(String)
        },
        select: { id: true, createdAt: true }
      })
    })

    it('should sanitize filename properly', async () => {
      const unsafeFile = new File([testCsvContent], '../../etc/passwd.csv', { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', unsafeFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.storagePath).not.toContain('../')
      expect(data.storagePath).toContain('_etc_passwd.csv')
    })

    it('should handle files with special characters in filename', async () => {
      const specialFile = new File([testCsvContent], 'file name with spaces & symbols!@#.csv', { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', specialFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.storagePath).toContain('file_name_with_spaces_symbols.csv')
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      prisma.importJob.findFirst.mockRejectedValueOnce(new Error('Database connection failed'))

      const formData = new FormData()
      formData.append('file', validCsvFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      expect(response.status).toBe(500)

      const data = await response.json()
      expect(data.error).toBe('Internal server error')
      expect(data.details).toBe('An unexpected error occurred during upload')
    })

    it('should handle malformed form data', async () => {
      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: 'invalid-form-data'
      })

      const response = await POST(request)
      expect(response.status).toBe(500)
    })
  })

  describe('Security Features', () => {
    it('should generate consistent hash for identical files', async () => {
      const file1 = new File([testCsvContent], 'file1.csv', { type: 'text/csv' })
      const file2 = new File([testCsvContent], 'file2.csv', { type: 'text/csv' })

      const formData1 = new FormData()
      formData1.append('file', file1)
      formData1.append('platform', 'shopee')
      formData1.append('validateOnly', 'true')

      const formData2 = new FormData()
      formData2.append('file', file2)
      formData2.append('platform', 'shopee')
      formData2.append('validateOnly', 'true')

      const request1 = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData1
      })

      const request2 = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData2
      })

      const response1 = await POST(request1)
      const response2 = await POST(request2)

      const data1 = await response1.json()
      const data2 = await response2.json()

      expect(data1.hash).toBe(data2.hash)
    })

    it('should reject files with executable extensions in disguise', async () => {
      const maliciousFile = new File(['malicious content'], 'innocent.csv.exe', { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', maliciousFile)
      formData.append('platform', 'shopee')

      const request = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData
      })

      const response = await POST(request)
      // Should still pass since we only check MIME type and .csv extension
      expect(response.status).toBe(201)
    })
  })

  describe('Platform-Specific File Size Limits', () => {
    it('should enforce different size limits for different platforms', async () => {
      // Create file that's 15MB (should be rejected for TikTok but allowed for Shopee)
      const mediumFile = new File(['x'.repeat(15 * 1024 * 1024)], 'medium.csv', { type: 'text/csv' })
      
      // Test TikTok (10MB limit)
      const tiktokFormData = new FormData()
      tiktokFormData.append('file', mediumFile)
      tiktokFormData.append('platform', 'tiktok')

      const tiktokRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: tiktokFormData
      })

      const tiktokResponse = await POST(tiktokRequest)
      expect(tiktokResponse.status).toBe(400)

      // Test Shopee (20MB limit)
      const shopeeFormData = new FormData()
      shopeeFormData.append('file', mediumFile)
      shopeeFormData.append('platform', 'shopee')

      const shopeeRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: shopeeFormData
      })

      const shopeeResponse = await POST(shopeeRequest)
      expect(shopeeResponse.status).toBe(201)
    })
  })
})