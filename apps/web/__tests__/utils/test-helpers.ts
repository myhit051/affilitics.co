import { vi } from 'vitest'

// Test utilities for the file upload system
export const TEST_CSV_CONTENT = `Order ID,Product Name,Commission Rate,Commission Amount,Order Status,Order Date,Product ID,SKU,Category,Shop Name,Customer ID,Quantity,Unit Price,Total Amount,Currency,Click Time,Conversion Time
SH123456789,Wireless Bluetooth Headphones,5.5,1.65,Delivered,2024-09-16,PROD001,WBH-001,Electronics,TechStore,CUST001,1,29.99,29.99,USD,2024-09-16T10:00:00Z,2024-09-16T10:05:00Z
SH987654321,Smartphone Case,8.0,2.00,Confirmed,2024-09-17,PROD002,SC-002,Accessories,MobileWorld,CUST002,2,12.50,25.00,USD,2024-09-17T11:00:00Z,2024-09-17T11:10:00Z`

export const createMockFile = (
  content: string = TEST_CSV_CONTENT,
  filename: string = 'test.csv',
  type: string = 'text/csv'
): File => {
  return new File([content], filename, { type, lastModified: Date.now() })
}

export const createLargeFile = (sizeMB: number): File => {
  const content = 'x'.repeat(sizeMB * 1024 * 1024)
  return new File([content], `large-${sizeMB}mb.csv`, { type: 'text/csv' })
}

export const createInvalidFile = (): File => {
  return new File(['invalid content'], 'test.exe', { type: 'application/exe' })
}

export const createEmptyFile = (): File => {
  return new File([], 'empty.csv', { type: 'text/csv' })
}

export const mockFetchResponse = (data: any, status: number = 200, ok: boolean = true) => {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data)
  } as Response)
}

export const mockFetchError = (error: string) => {
  return Promise.reject(new Error(error))
}

export const setupDefaultMocks = () => {
  return {
    getAuthContextSimple: vi.fn(() => ({
      user: { id: 'test-user-123' },
      workspaceId: 'test-workspace-456'
    })),
    prisma: {
      importJob: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'job-123',
          createdAt: new Date('2024-09-17T00:00:00Z')
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'job-123',
          workspaceId: 'test-workspace-456',
          platform: 'shopee',
          filename: 'test.csv',
          status: 'uploaded'
        }),
        update: vi.fn().mockResolvedValue({
          id: 'job-123',
          status: 'validated'
        })
      },
      importError: {
        createMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      sale: {
        createMany: vi.fn().mockResolvedValue({ count: 3 })
      }
    },
    platformConfigs: {
      isValidPlatform: vi.fn((platform: string) => 
        ['shopee', 'lazada', 'tiktok'].includes(platform)
      ),
      getPlatformFileSizeLimit: vi.fn((platform: string) => {
        const limits = { shopee: 20, lazada: 15, tiktok: 10 }
        return limits[platform as keyof typeof limits] || 20
      }),
      getSupportedPlatforms: vi.fn(() => ['shopee', 'lazada', 'tiktok']),
      getPlatformDisplayName: vi.fn((platform: string) => {
        const names = { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok' }
        return names[platform as keyof typeof names] || platform
      }),
      generateSampleCSV: vi.fn(() => TEST_CSV_CONTENT)
    }
  }
}

export const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  })
}

export const VIEWPORT_SIZES = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1920, height: 1080 }
}

export const waitForFileProcessing = (timeout: number = 1000) => {
  return new Promise(resolve => setTimeout(resolve, timeout))
}

export const createFormData = (file: File, platform: string = 'shopee', additional: Record<string, string> = {}) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('platform', platform)
  
  Object.entries(additional).forEach(([key, value]) => {
    formData.append(key, value)
  })
  
  return formData
}

export const mockConsole = () => {
  return {
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    log: vi.spyOn(console, 'log').mockImplementation(() => {})
  }
}

export const restoreConsole = (mocks: ReturnType<typeof mockConsole>) => {
  mocks.error.mockRestore()
  mocks.warn.mockRestore()
  mocks.log.mockRestore()
}