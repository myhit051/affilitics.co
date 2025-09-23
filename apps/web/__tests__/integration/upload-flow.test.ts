import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Mock the actual CSV file for testing
const createTestCsv = () => {
  return `Order ID,Product Name,Commission Rate,Commission Amount,Order Status,Order Date,Product ID,SKU,Category,Shop Name,Customer ID,Quantity,Unit Price,Total Amount,Currency,Click Time,Conversion Time
SH123456789,Wireless Bluetooth Headphones,5.5,1.65,Delivered,2024-09-16,PROD001,WBH-001,Electronics,TechStore,CUST001,1,29.99,29.99,USD,2024-09-16T10:00:00Z,2024-09-16T10:05:00Z
SH987654321,Smartphone Case,8.0,2.00,Confirmed,2024-09-17,PROD002,SC-002,Accessories,MobileWorld,CUST002,2,12.50,25.00,USD,2024-09-17T11:00:00Z,2024-09-17T11:10:00Z
SH555666777,Gaming Mouse,12.0,3.60,Processing,2024-09-18,PROD003,GM-003,Electronics,GamerHub,CUST003,1,30.00,30.00,USD,2024-09-18T09:30:00Z,2024-09-18T09:35:00Z`
}

// Mock all dependencies for integration testing
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
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    importError: {
      createMany: vi.fn()
    },
    sale: {
      createMany: vi.fn()
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

// Import the route handlers for integration testing
import { POST as uploadPOST } from '@/app/api/import/upload/route'
import { POST as validatePOST } from '@/app/api/import/validate/route'
import { POST as commitPOST } from '@/app/api/import/commit/route'
import { NextRequest } from 'next/server'

// Import mocked modules
const { prisma } = await vi.importMock('@/lib/db')

describe('Full Upload Flow Integration Tests', () => {
  let testCsvFile: File
  let invalidCsvFile: File
  let duplicateHashCsvFile: File

  beforeEach(() => {
    vi.clearAllMocks()

    // Create test files
    testCsvFile = new File([createTestCsv()], 'test-shopee.csv', { type: 'text/csv' })
    invalidCsvFile = new File(['invalid,data\nno,headers'], 'invalid.csv', { type: 'text/csv' })
    duplicateHashCsvFile = new File([createTestCsv()], 'duplicate.csv', { type: 'text/csv' })

    // Mock database responses
    prisma.importJob.findFirst.mockResolvedValue(null) // No duplicates by default
    prisma.importJob.create.mockResolvedValue({
      id: 'job-123',
      createdAt: new Date('2024-09-17T00:00:00Z')
    })
    prisma.importJob.findUnique.mockResolvedValue({
      id: 'job-123',
      workspaceId: 'test-workspace-456',
      platform: 'shopee',
      filename: 'test-shopee.csv',
      status: 'uploaded',
      createdBy: 'test-user-123'
    })
    prisma.importJob.update.mockResolvedValue({
      id: 'job-123',
      status: 'validated'
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Complete Upload to Processing Flow', () => {
    it('should handle the complete flow: upload → validate → commit', async () => {
      // Step 1: Upload file
      const uploadFormData = new FormData()
      uploadFormData.append('file', testCsvFile)
      uploadFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      expect(uploadResponse.status).toBe(201)

      const uploadData = await uploadResponse.json()
      expect(uploadData.success).toBe(true)
      expect(uploadData.jobId).toBe('job-123')
      expect(uploadData.platform).toBe('shopee')
      expect(uploadData.filename).toBe('test-shopee.csv')

      // Verify import job was created
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

      // Step 2: Validate the uploaded file
      const validateRequest = new NextRequest('http://localhost:4000/api/import/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': 'test-workspace-456'
        },
        body: JSON.stringify({
          jobId: 'job-123',
          preview: true
        })
      })

      // Mock validation response data
      prisma.importJob.update.mockResolvedValueOnce({
        id: 'job-123',
        status: 'validated'
      })

      const validateResponse = await validatePOST(validateRequest)
      expect(validateResponse.status).toBe(200)

      const validateData = await validateResponse.json()
      expect(validateData.isValid).toBe(true)
      expect(validateData.summary).toBeDefined()
      expect(validateData.summary.totalRows).toBe(3)
      expect(validateData.summary.validRows).toBe(3)

      // Step 3: Commit for processing
      const commitRequest = new NextRequest('http://localhost:4000/api/import/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': 'test-workspace-456'
        },
        body: JSON.stringify({
          jobId: 'job-123',
          dateFrom: '2024-09-01',
          dateTo: '2024-09-18'
        })
      })

      // Mock commit response
      prisma.importJob.update.mockResolvedValueOnce({
        id: 'job-123',
        status: 'processing'
      })
      prisma.sale.createMany.mockResolvedValueOnce({ count: 3 })

      const commitResponse = await commitPOST(commitRequest)
      expect(commitResponse.status).toBe(200)

      const commitData = await commitResponse.json()
      expect(commitData.success).toBe(true)
      expect(commitData.message).toContain('started processing')
    })

    it('should handle validation-only uploads', async () => {
      // Upload with validateOnly flag
      const uploadFormData = new FormData()
      uploadFormData.append('file', testCsvFile)
      uploadFormData.append('platform', 'shopee')
      uploadFormData.append('validateOnly', 'true')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      expect(uploadResponse.status).toBe(200)

      const uploadData = await uploadResponse.json()
      expect(uploadData.valid).toBe(true)
      expect(uploadData.fileSize).toBe(testCsvFile.size)
      expect(uploadData.hash).toBeDefined()
      expect(uploadData.message).toBe('File is valid and ready for upload')

      // Should NOT create import job for validation-only
      expect(prisma.importJob.create).not.toHaveBeenCalled()
    })

    it('should handle duplicate file detection across the flow', async () => {
      // Mock existing file with same hash
      prisma.importJob.findFirst.mockResolvedValueOnce({
        id: 'existing-job-456',
        filename: 'existing-file.csv'
      })

      const uploadFormData = new FormData()
      uploadFormData.append('file', duplicateHashCsvFile)
      uploadFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      expect(uploadResponse.status).toBe(400)

      const uploadData = await uploadResponse.json()
      expect(uploadData.error).toBe('Duplicate file')
      expect(uploadData.details).toContain('This file has already been uploaded')
      expect(uploadData.existingJobId).toBe('existing-job-456')

      // Should not create new import job
      expect(prisma.importJob.create).not.toHaveBeenCalled()
    })
  })

  describe('Real CSV File Testing', () => {
    it('should process the actual sample CSV file correctly', async () => {
      // Read the actual test CSV file
      const csvPath = '/Users/mujahid/affilitics.co/apps/web/test-shopee.csv'
      let actualCsvContent: string

      try {
        actualCsvContent = fs.readFileSync(csvPath, 'utf-8')
      } catch (error) {
        // Fallback to our test content if file doesn't exist
        actualCsvContent = createTestCsv()
      }

      const actualCsvFile = new File([actualCsvContent], 'test-shopee.csv', { type: 'text/csv' })

      // Upload the actual file
      const uploadFormData = new FormData()
      uploadFormData.append('file', actualCsvFile)
      uploadFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      expect(uploadResponse.status).toBe(201)

      const uploadData = await uploadResponse.json()
      expect(uploadData.success).toBe(true)
      expect(uploadData.platform).toBe('shopee')
      expect(uploadData.size).toBe(actualCsvFile.size)

      // Validate the actual file
      const validateRequest = new NextRequest('http://localhost:4000/api/import/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': 'test-workspace-456'
        },
        body: JSON.stringify({
          jobId: uploadData.jobId,
          preview: true
        })
      })

      const validateResponse = await validatePOST(validateRequest)
      expect(validateResponse.status).toBe(200)

      const validateData = await validateResponse.json()
      expect(validateData.isValid).toBe(true)
      expect(validateData.summary.totalRows).toBeGreaterThan(0)
    })

    it('should handle CSV files with different encodings', async () => {
      // Create CSV with special characters
      const specialCharCsv = `Order ID,Product Name,Commission Rate,Commission Amount,Order Status,Order Date
SH123,Café Mocha ☕,5.5,1.65,Delivered,2024-09-16
SH124,Résumé Holder,8.0,2.00,Confirmed,2024-09-17`

      const specialCsvFile = new File([specialCharCsv], 'special-chars.csv', { 
        type: 'text/csv;charset=utf-8' 
      })

      const uploadFormData = new FormData()
      uploadFormData.append('file', specialCsvFile)
      uploadFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      expect(uploadResponse.status).toBe(201)

      const uploadData = await uploadResponse.json()
      expect(uploadData.success).toBe(true)
    })

    it('should validate CSV structure correctly', async () => {
      // Create CSV with missing required columns
      const invalidStructureCsv = `Order ID,Product Name
SH123,Test Product
SH124,Another Product`

      const invalidCsvFile = new File([invalidStructureCsv], 'invalid-structure.csv', { 
        type: 'text/csv' 
      })

      const uploadFormData = new FormData()
      uploadFormData.append('file', invalidCsvFile)
      uploadFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      expect(uploadResponse.status).toBe(201) // Upload succeeds

      const uploadData = await uploadResponse.json()

      // Validation should catch the structural issues
      const validateRequest = new NextRequest('http://localhost:4000/api/import/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': 'test-workspace-456'
        },
        body: JSON.stringify({
          jobId: uploadData.jobId,
          preview: true
        })
      })

      const validateResponse = await validatePOST(validateRequest)
      const validateData = await validateResponse.json()

      // Should detect missing columns
      expect(validateData.isValid).toBe(false)
      expect(validateData.criticalErrors).toBeDefined()
      expect(validateData.criticalErrors.length).toBeGreaterThan(0)
    })
  })

  describe('Platform-Specific Processing', () => {
    it('should handle Shopee-specific validation rules', async () => {
      const shopeeFormData = new FormData()
      shopeeFormData.append('file', testCsvFile)
      shopeeFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: shopeeFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      expect(uploadResponse.status).toBe(201)

      const uploadData = await uploadResponse.json()
      expect(uploadData.platform).toBe('shopee')

      // Validate with Shopee-specific rules
      const validateRequest = new NextRequest('http://localhost:4000/api/import/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': 'test-workspace-456'
        },
        body: JSON.stringify({
          jobId: uploadData.jobId,
          preview: true
        })
      })

      const validateResponse = await validatePOST(validateRequest)
      const validateData = await validateResponse.json()

      expect(validateData.platform).toBe('shopee')
      expect(validateData.summary).toBeDefined()
    })

    it('should handle Lazada platform correctly', async () => {
      const lazadaFormData = new FormData()
      lazadaFormData.append('file', testCsvFile)
      lazadaFormData.append('platform', 'lazada')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: lazadaFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      expect(uploadResponse.status).toBe(201)

      const uploadData = await uploadResponse.json()
      expect(uploadData.platform).toBe('lazada')
    })

    it('should handle TikTok platform with smaller size limit', async () => {
      // Create file that's 12MB (should exceed TikTok's 10MB limit)
      const largeTikTokContent = 'x'.repeat(12 * 1024 * 1024)
      const largeTikTokFile = new File([largeTikTokContent], 'large-tiktok.csv', { type: 'text/csv' })

      const tiktokFormData = new FormData()
      tiktokFormData.append('file', largeTikTokFile)
      tiktokFormData.append('platform', 'tiktok')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: tiktokFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      expect(uploadResponse.status).toBe(400)

      const uploadData = await uploadResponse.json()
      expect(uploadData.error).toBe('File too large')
      expect(uploadData.details).toContain('10MB for tiktok')
    })
  })

  describe('Authentication and Security Integration', () => {
    it('should maintain authentication context throughout the flow', async () => {
      // All API calls should use the same authenticated context
      const uploadFormData = new FormData()
      uploadFormData.append('file', testCsvFile)
      uploadFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      const uploadData = await uploadResponse.json()

      // Verify workspace isolation
      expect(prisma.importJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'test-workspace-456',
            createdBy: 'test-user-123'
          })
        })
      )

      // Subsequent calls should maintain the same context
      const validateRequest = new NextRequest('http://localhost:4000/api/import/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': 'test-workspace-456'
        },
        body: JSON.stringify({
          jobId: uploadData.jobId,
          preview: true
        })
      })

      const validateResponse = await validatePOST(validateRequest)
      expect(validateResponse.status).toBe(200)
    })

    it('should validate file hash consistency', async () => {
      // Upload the same file twice and verify hashes match
      const file1 = new File([createTestCsv()], 'file1.csv', { type: 'text/csv' })
      const file2 = new File([createTestCsv()], 'file2.csv', { type: 'text/csv' })

      // First upload
      const formData1 = new FormData()
      formData1.append('file', file1)
      formData1.append('platform', 'shopee')
      formData1.append('validateOnly', 'true')

      const request1 = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData1
      })

      const response1 = await uploadPOST(request1)
      const data1 = await response1.json()

      // Second upload with same content
      const formData2 = new FormData()
      formData2.append('file', file2)
      formData2.append('platform', 'shopee')
      formData2.append('validateOnly', 'true')

      const request2 = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: formData2
      })

      const response2 = await uploadPOST(request2)
      const data2 = await response2.json()

      // Hashes should be identical for identical content
      expect(data1.hash).toBe(data2.hash)
    })
  })

  describe('Error Recovery and Rollback', () => {
    it('should handle validation failures gracefully', async () => {
      // Upload succeeds
      const uploadFormData = new FormData()
      uploadFormData.append('file', testCsvFile)
      uploadFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      const uploadData = await uploadResponse.json()

      // Mock validation failure
      prisma.importJob.update.mockRejectedValueOnce(new Error('Validation failed'))

      const validateRequest = new NextRequest('http://localhost:4000/api/import/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': 'test-workspace-456'
        },
        body: JSON.stringify({
          jobId: uploadData.jobId,
          preview: true
        })
      })

      const validateResponse = await validatePOST(validateRequest)
      expect(validateResponse.status).toBe(500)

      const validateData = await validateResponse.json()
      expect(validateData.error).toBeDefined()
    })

    it('should handle database transaction failures', async () => {
      // Mock database failure during job creation
      prisma.importJob.create.mockRejectedValueOnce(new Error('Database connection failed'))

      const uploadFormData = new FormData()
      uploadFormData.append('file', testCsvFile)
      uploadFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      expect(uploadResponse.status).toBe(500)

      const uploadData = await uploadResponse.json()
      expect(uploadData.error).toBe('Internal server error')
    })

    it('should handle commit failures after successful validation', async () => {
      // Upload and validate successfully
      const uploadFormData = new FormData()
      uploadFormData.append('file', testCsvFile)
      uploadFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      const uploadData = await uploadResponse.json()

      // Mock commit failure
      prisma.sale.createMany.mockRejectedValueOnce(new Error('Failed to insert sales data'))

      const commitRequest = new NextRequest('http://localhost:4000/api/import/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': 'test-workspace-456'
        },
        body: JSON.stringify({
          jobId: uploadData.jobId,
          dateFrom: '2024-09-01',
          dateTo: '2024-09-18'
        })
      })

      const commitResponse = await commitPOST(commitRequest)
      expect(commitResponse.status).toBe(500)

      const commitData = await commitResponse.json()
      expect(commitData.error).toBeDefined()
    })
  })

  describe('Performance and Concurrency', () => {
    it('should handle concurrent uploads', async () => {
      const promises = []
      
      // Create multiple concurrent uploads
      for (let i = 0; i < 5; i++) {
        const file = new File([createTestCsv()], `concurrent-${i}.csv`, { type: 'text/csv' })
        const formData = new FormData()
        formData.append('file', file)
        formData.append('platform', 'shopee')

        const request = new NextRequest('http://localhost:4000/api/import/upload', {
          method: 'POST',
          body: formData
        })

        promises.push(uploadPOST(request))
      }

      // All uploads should complete successfully
      const responses = await Promise.all(promises)
      responses.forEach(response => {
        expect(response.status).toBe(201)
      })

      // Should have created 5 import jobs
      expect(prisma.importJob.create).toHaveBeenCalledTimes(5)
    })

    it('should handle large file processing efficiently', async () => {
      // Create a moderately large CSV (1MB)
      const largeRows = []
      for (let i = 0; i < 10000; i++) {
        largeRows.push(`SH${i},Product ${i},5.5,1.65,Delivered,2024-09-16,PROD${i},SKU-${i},Electronics,Shop${i},CUST${i},1,29.99,29.99,USD,2024-09-16T10:00:00Z,2024-09-16T10:05:00Z`)
      }
      
      const largeCsvContent = `Order ID,Product Name,Commission Rate,Commission Amount,Order Status,Order Date,Product ID,SKU,Category,Shop Name,Customer ID,Quantity,Unit Price,Total Amount,Currency,Click Time,Conversion Time\n${largeRows.join('\n')}`
      const largeCsvFile = new File([largeCsvContent], 'large-file.csv', { type: 'text/csv' })

      const uploadFormData = new FormData()
      uploadFormData.append('file', largeCsvFile)
      uploadFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      expect(uploadResponse.status).toBe(201)

      const uploadData = await uploadResponse.json()
      expect(uploadData.size).toBe(largeCsvFile.size)
    })
  })

  describe('Data Integrity', () => {
    it('should maintain data consistency throughout processing', async () => {
      const uploadFormData = new FormData()
      uploadFormData.append('file', testCsvFile)
      uploadFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      const uploadData = await uploadResponse.json()

      // Verify all the data matches expectations
      expect(uploadData.filename).toBe('test-shopee.csv')
      expect(uploadData.platform).toBe('shopee')
      expect(uploadData.size).toBe(testCsvFile.size)
      expect(uploadData.hash).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hash format

      // Validate preserves the same data
      const validateRequest = new NextRequest('http://localhost:4000/api/import/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': 'test-workspace-456'
        },
        body: JSON.stringify({
          jobId: uploadData.jobId,
          preview: true
        })
      })

      const validateResponse = await validatePOST(validateRequest)
      const validateData = await validateResponse.json()

      expect(validateData.jobId).toBe(uploadData.jobId)
    })

    it('should validate CSV data integrity', async () => {
      // Create CSV with known data
      const knownDataCsv = `Order ID,Product Name,Commission Rate,Commission Amount,Order Status,Order Date
SH100,Known Product,10.0,5.00,Delivered,2024-09-16
SH101,Another Product,8.5,4.25,Confirmed,2024-09-17`

      const knownDataFile = new File([knownDataCsv], 'known-data.csv', { type: 'text/csv' })

      const uploadFormData = new FormData()
      uploadFormData.append('file', knownDataFile)
      uploadFormData.append('platform', 'shopee')

      const uploadRequest = new NextRequest('http://localhost:4000/api/import/upload', {
        method: 'POST',
        body: uploadFormData
      })

      const uploadResponse = await uploadPOST(uploadRequest)
      const uploadData = await uploadResponse.json()

      const validateRequest = new NextRequest('http://localhost:4000/api/import/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': 'test-workspace-456'
        },
        body: JSON.stringify({
          jobId: uploadData.jobId,
          preview: true
        })
      })

      const validateResponse = await validatePOST(validateRequest)
      const validateData = await validateResponse.json()

      // Should detect exactly 2 rows of data
      expect(validateData.summary.totalRows).toBe(2)
      expect(validateData.preview).toBeDefined()
    })
  })
})