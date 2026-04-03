/**
 * Platform-specific CSV format configurations for Shopee, Lazada, and TikTok
 * Defines validation rules, field mappings, and business logic for each platform
 * Now supports environment variable configuration and dynamic rule customization
 */

// import { getEffectiveConfig } from '@aff/db'
// Mock for build purposes
const getEffectiveConfig = () => ({
  csvValidation: {
    MAX_FILE_SIZE_MB: 50,
    MAX_ROWS: 100000,
    ORDER_DATE_MAX_DAYS_AGO: 365,
    ORDER_DATE_MAX_DAYS_FUTURE: 30,
    COMMISSION_RATE_MIN_PERCENT: 0,
    CURRENCY_MAX_VALUE: 1000000
  },
  platformValidation: {
    SHOPEE: { 
      MAX_COMMISSION_RATE_PERCENT: 100,
      VALID_ORDER_STATUSES: ['completed', 'pending', 'shipped', 'cancelled']
    },
    LAZADA: { 
      MAX_COMMISSION_RATE_PERCENT: 95,
      VALID_ORDER_STATUSES: ['completed', 'pending', 'shipped', 'cancelled']
    },
    TIKTOK: { 
      MAX_COMMISSION_RATE_PERCENT: 90,
      VALID_ORDER_STATUSES: ['completed', 'pending', 'shipped', 'cancelled']
    }
  }
})
import type { PlatformCSVConfig, CSVValidationRule } from './csv-validator'

/**
 * Shopee affiliate CSV format configuration
 * Updated to support real Thai Shopee CSV format
 */
export const SHOPEE_CONFIG: PlatformCSVConfig = {
  platform: 'shopee',
  requiredHeaders: [
    'รหัสการสั่งซื้อ',
    'ชื่อรายการสินค้า',
    'คอมมิชชั่นคำสั่งซื้อโดยรวม(฿)',
    'สถานะการสั่งซื้อ',
    'เวลาที่สั่งซื้อ'
  ],
  optionalHeaders: [
    'รหัสรายการสินค้า',
    'เลขที่ โมเดล',
    'L1 หมวดหมู่สากล',
    'L2 หมวดหมู่สากล', 
    'L3 หมวดหมู่สากล',
    'ชื่อร้านค้า',
    'จำนวน',
    'ราคา(฿)',
    'มูลค่าซื้อ(฿)',
    'เวลาคลิก',
    'เวลาที่สั่งซื้อสำเร็จ',
    'อัตราคอมมิชชั่นช้อปปี้ของสินค้า',
    'ค่าคอมมิชชั่นของช้อปปี้ต่อชิ้น(฿)',
    'อัตราคอมมิชชั่นร้านค้าของสินค้า',
    'ค่าคอมมิชชั่นของแบรนด์์ต่อชิ้น(฿)',
    'Sub_id1',
    'Sub_id2', 
    'Sub_id3',
    'Sub_id4',
    'Sub_id5',
    'ช่องทาง'
  ],
  fieldMappings: {
    'รหัสการสั่งซื้อ': 'order_id',
    'รหัสรายการสินค้า': 'product_id',
    'ชื่อรายการสินค้า': 'product_name',
    'เลขที่ โมเดล': 'sku',
    'L1 หมวดหมู่สากล': 'category_l1',
    'L2 หมวดหมู่สากล': 'category_l2',
    'L3 หมวดหมู่สากล': 'category_l3',
    'ชื่อร้านค้า': 'shop_name',
    'จำนวน': 'quantity',
    'ราคา(฿)': 'unit_price',
    'มูลค่าซื้อ(฿)': 'total_amount',
    'อัตราคอมมิชชั่นช้อปปี้ของสินค้า': 'commission_rate_shopee',
    'ค่าคอมมิชชั่นของช้อปปี้ต่อชิ้น(฿)': 'commission_amount_shopee',
    'อัตราคอมมิชชั่นร้านค้าของสินค้า': 'commission_rate_seller',
    'ค่าคอมมิชชั่นของแบรนด์์ต่อชิ้น(฿)': 'commission_amount_seller',
    'คอมมิชชั่นคำสั่งซื้อโดยรวม(฿)': 'commission_amount',
    'สถานะการสั่งซื้อ': 'order_status',
    'เวลาที่สั่งซื้อ': 'order_date',
    'เวลาคลิก': 'click_time',
    'เวลาที่สั่งซื้อสำเร็จ': 'conversion_time',
    'Sub_id1': 'sub_id1',
    'Sub_id2': 'sub_id2',
    'Sub_id3': 'sub_id3',
    'Sub_id4': 'sub_id4',
    'Sub_id5': 'sub_id5',
    'ช่องทาง': 'channel'
  },
  validationRules: [
    {
      field: 'รหัสการสั่งซื้อ',
      required: true,
      type: 'string',
      minLength: 5,
      maxLength: 50,
      pattern: /^[A-Za-z0-9]+$/
    },
    {
      field: 'ชื่อรายการสินค้า',
      required: true,
      type: 'string',
      minLength: 1,
      maxLength: 500
    },
    {
      field: 'คอมมิชชั่นคำสั่งซื้อโดยรวม(฿)',
      required: true,
      type: 'currency',
      customValidator: (value, row, context) => {
        const num = parseFloat(String(value).replace(/[฿$,\s]/g, ''))
        const config = getEffectiveConfig()
        const maxCommission = config.platformValidation.SHOPEE.MAX_COMMISSION_RATE_PERCENT
        
        if (num < 0) {
          return {
            isValid: false,
            error: 'คอมมิชชั่นต้องมากกว่าหรือเท่ากับ 0',
            suggestion: 'ระบุจำนวนคอมมิชชั่นที่เป็นบวก',
            severity: 'error'
          }
        }
        
        if (num > maxCommission * 100) { // Assuming value is in currency, not percentage
          return {
            isValid: false,
            error: `คอมมิชชั่นสูงเกินไป (สูงสุด ${maxCommission}% ของราคาสินค้า)`,
            suggestion: `ตรวจสอบว่าคอมมิชชั่นไม่เกิน ${maxCommission}% ของราคาสินค้า`,
            severity: 'warning'
          }
        }
        
        return { isValid: true }
      },
      businessRules: []
    },
    {
      field: 'สถานะการสั่งซื้อ',
      required: true,
      type: 'string',
      customValidator: (value, row, context) => {
        const config = getEffectiveConfig()
        const validStatuses = config.platformValidation.SHOPEE.VALID_ORDER_STATUSES
        const statusValue = String(value).trim()
        
        if (!validStatuses.includes(statusValue)) {
          return {
            isValid: false,
            error: `สถานะต้องเป็นหนึ่งใน: ${validStatuses.join(', ')}`,
            suggestion: `ใช้สถานะที่ถูกต้อง: ${validStatuses.slice(0, 3).join(', ')}`,
            severity: 'error'
          }
        }
        
        return { isValid: true }
      },
      businessRules: []
    },
    {
      field: 'เวลาที่สั่งซื้อ',
      required: true,
      type: 'date',
      customValidator: (value, row, context) => {
        const config = getEffectiveConfig()
        const date = new Date(value)
        const now = new Date()
        const maxDaysAgo = config.csvValidation.ORDER_DATE_MAX_DAYS_AGO
        const maxDaysFuture = config.csvValidation.ORDER_DATE_MAX_DAYS_FUTURE
        
        const minDate = new Date(now.getTime() - (maxDaysAgo * 24 * 60 * 60 * 1000))
        const maxDate = new Date(now.getTime() + (maxDaysFuture * 24 * 60 * 60 * 1000))
        
        if (isNaN(date.getTime())) {
          return {
            isValid: false,
            error: 'รูปแบบวันที่ไม่ถูกต้อง',
            suggestion: 'ใช้รูปแบบ: YYYY-MM-DD หรือ DD/MM/YYYY',
            severity: 'error'
          }
        }
        
        if (date > maxDate) {
          return {
            isValid: false,
            error: `วันที่สั่งซื้อไม่สามารถเป็นอนาคตได้ (เกิน ${maxDaysFuture} วัน)`,
            suggestion: 'ตรวจสอบวันที่สั่งซื้อให้ถูกต้อง',
            severity: 'error'
          }
        }
        
        if (date < minDate) {
          return {
            isValid: false,
            error: `วันที่สั่งซื้อเก่าเกิน ${maxDaysAgo} วัน`,
            suggestion: `วันที่สั่งซื้อควรอยู่ในช่วง ${maxDaysAgo} วันที่ผ่านมา`,
            severity: 'warning'
          }
        }
        
        return { isValid: true }
      },
      businessRules: []
    },
    {
      field: 'จำนวน',
      required: false,
      type: 'number',
      customValidator: (value, row, context) => {
        if (value && parseInt(value) <= 0) {
          return {
            isValid: false,
            error: 'จำนวนต้องมากกว่า 0',
            suggestion: 'ระบุจำนวนสินค้าที่เป็นจำนวนเต็มบวก',
            severity: 'error'
          }
        }
        
        if (value && parseInt(value) > 1000) {
          return {
            isValid: false,
            error: 'จำนวนสินค้าสูงผิดปกติ',
            suggestion: 'ตรวจสอบจำนวนสินค้าให้ถูกต้อง',
            severity: 'warning'
          }
        }
        
        return { isValid: true }
      },
      businessRules: []
    },
    {
      field: 'ราคา(฿)',
      required: false,
      type: 'currency'
    },
    {
      field: 'มูลค่าซื้อ(฿)',
      required: false,
      type: 'currency'
    }
  ],
  duplicateDetection: {
    fields: ['รหัสการสั่งซื้อ'],
    scope: 'workspace'
  }
}

/**
 * Lazada affiliate CSV format configuration
 */
export const LAZADA_CONFIG: PlatformCSVConfig = {
  platform: 'lazada',
  requiredHeaders: [
    'Transaction ID',
    'Product Title',
    'Commission Rate (%)',
    'Commission (Local Currency)',
    'Transaction Status',
    'Transaction Time'
  ],
  optionalHeaders: [
    'Product ID',
    'Product URL',
    'Category',
    'Seller Name',
    'Buyer ID',
    'Product Quantity',
    'Product Price',
    'Order Value',
    'Currency',
    'Click Timestamp',
    'Purchase Timestamp',
    'Country'
  ],
  fieldMappings: {
    'Transaction ID': 'order_id',
    'Product ID': 'product_id',
    'Product Title': 'product_name',
    'Product URL': 'product_url',
    'Category': 'category',
    'Seller Name': 'shop_name',
    'Buyer ID': 'customer_id',
    'Product Quantity': 'quantity',
    'Product Price': 'unit_price',
    'Order Value': 'total_amount',
    'Commission Rate (%)': 'commission_rate',
    'Commission (Local Currency)': 'commission_amount',
    'Currency': 'currency',
    'Transaction Status': 'order_status',
    'Transaction Time': 'order_date',
    'Click Timestamp': 'click_time',
    'Purchase Timestamp': 'conversion_time',
    'Country': 'country'
  },
  validationRules: [
    {
      field: 'Transaction ID',
      required: true,
      type: 'string',
      minLength: 8,
      maxLength: 50
    },
    {
      field: 'Product Title',
      required: true,
      type: 'string',
      minLength: 1,
      maxLength: 300
    },
    {
      field: 'Commission Rate (%)',
      required: true,
      type: 'number',
      customValidator: (value, row, context) => {
        const config = getEffectiveConfig()
        const num = parseFloat(value)
        const maxRate = config.platformValidation.LAZADA.MAX_COMMISSION_RATE_PERCENT
        const minRate = config.csvValidation.COMMISSION_RATE_MIN_PERCENT
        
        if (isNaN(num)) {
          return {
            isValid: false,
            error: 'Commission rate must be a valid number',
            suggestion: 'Enter a numeric percentage value (e.g., 5.5)',
            severity: 'error'
          }
        }
        
        if (num < minRate || num > maxRate) {
          return {
            isValid: false,
            error: `Commission rate must be between ${minRate}% and ${maxRate}%`,
            suggestion: `Enter a commission rate between ${minRate}% and ${maxRate}%`,
            severity: 'error'
          }
        }
        
        return { isValid: true }
      },
      businessRules: []
    },
    {
      field: 'Commission (Local Currency)',
      required: true,
      type: 'currency',
      customValidator: (value, row, context) => {
        const config = getEffectiveConfig()
        const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''))
        const maxAmount = config.csvValidation.CURRENCY_MAX_VALUE
        
        if (isNaN(num)) {
          return {
            isValid: false,
            error: 'Commission amount must be a valid number',
            suggestion: 'Enter a numeric amount (e.g., 12.50)',
            severity: 'error'
          }
        }
        
        if (num < 0) {
          return {
            isValid: false,
            error: 'Commission amount cannot be negative',
            suggestion: 'Enter a positive commission amount',
            severity: 'error'
          }
        }
        
        if (num > maxAmount) {
          return {
            isValid: false,
            error: `Commission amount exceeds maximum allowed (${maxAmount})`,
            suggestion: 'Verify the commission amount is correct',
            severity: 'warning'
          }
        }
        
        return { isValid: true }
      },
      businessRules: []
    },
    {
      field: 'Transaction Status',
      required: true,
      type: 'string',
      customValidator: (value, row, context) => {
        const config = getEffectiveConfig()
        const validStatuses = config.platformValidation.LAZADA.VALID_ORDER_STATUSES
        const statusValue = String(value).trim()
        
        if (!validStatuses.includes(statusValue)) {
          return {
            isValid: false,
            error: `Transaction status must be one of: ${validStatuses.join(', ')}`,
            suggestion: `Use one of the valid statuses: ${validStatuses.slice(0, 3).join(', ')}`,
            severity: 'error'
          }
        }
        
        return { isValid: true }
      },
      businessRules: []
    },
    {
      field: 'Transaction Time',
      required: true,
      type: 'date'
    },
    {
      field: 'Product URL',
      required: false,
      type: 'url'
    },
    {
      field: 'Product Quantity',
      required: false,
      type: 'number',
      customValidator: (value: any, row: any, context: any) => {
        if (value && parseInt(value) <= 0) {
          return {
            isValid: false,
            error: 'Product quantity must be greater than 0'
          }
        }
        return { isValid: true }
      }
    }
  ],
  duplicateDetection: {
    fields: ['Transaction ID'],
    scope: 'workspace'
  }
}

/**
 * TikTok Shop affiliate CSV format configuration
 */
export const TIKTOK_CONFIG: PlatformCSVConfig = {
  platform: 'tiktok',
  requiredHeaders: [
    'Order No.',
    'Product Name',
    'Commission Rate',
    'Estimated Commission',
    'Order Status',
    'Order Create Time'
  ],
  optionalHeaders: [
    'Product ID',
    'Video ID',
    'Creator',
    'Category Name',
    'Shop Name',
    'User ID',
    'Product Quantity',
    'Product Price',
    'Order Amount',
    'Currency',
    'Video Publish Time',
    'Settlement Date',
    'Final Commission',
    'Region'
  ],
  fieldMappings: {
    'Order No.': 'order_id',
    'Product ID': 'product_id',
    'Product Name': 'product_name',
    'Video ID': 'video_id',
    'Creator': 'creator_name',
    'Category Name': 'category',
    'Shop Name': 'shop_name',
    'User ID': 'customer_id',
    'Product Quantity': 'quantity',
    'Product Price': 'unit_price',
    'Order Amount': 'total_amount',
    'Commission Rate': 'commission_rate',
    'Estimated Commission': 'commission_amount',
    'Final Commission': 'final_commission',
    'Currency': 'currency',
    'Order Status': 'order_status',
    'Order Create Time': 'order_date',
    'Video Publish Time': 'click_time',
    'Settlement Date': 'settlement_date',
    'Region': 'region'
  },
  validationRules: [
    {
      field: 'Order No.',
      required: true,
      type: 'string',
      minLength: 10,
      maxLength: 100
    },
    {
      field: 'Product Name',
      required: true,
      type: 'string',
      minLength: 1,
      maxLength: 500
    },
    {
      field: 'Commission Rate',
      required: true,
      type: 'string',
      pattern: /^\d+(\.\d+)?%?$/,
      customValidator: (value, row, context) => {
        const config = getEffectiveConfig()
        const numStr = String(value).replace('%', '')
        const num = parseFloat(numStr)
        const maxRate = config.platformValidation.TIKTOK.MAX_COMMISSION_RATE_PERCENT
        const minRate = config.csvValidation.COMMISSION_RATE_MIN_PERCENT
        
        if (isNaN(num)) {
          return {
            isValid: false,
            error: 'Commission rate must be a valid number',
            suggestion: 'Enter a numeric percentage value (e.g., 8% or 8)',
            severity: 'error'
          }
        }
        
        if (num < minRate || num > maxRate) {
          return {
            isValid: false,
            error: `Commission rate must be between ${minRate}% and ${maxRate}%`,
            suggestion: `TikTok commission rates should be between ${minRate}% and ${maxRate}%`,
            severity: 'error'
          }
        }
        
        return { isValid: true }
      },
      businessRules: []
    },
    {
      field: 'Estimated Commission',
      required: true,
      type: 'currency'
    },
    {
      field: 'Order Status',
      required: true,
      type: 'string',
      customValidator: (value, row, context) => {
        const config = getEffectiveConfig()
        const validStatuses = config.platformValidation.TIKTOK.VALID_ORDER_STATUSES
        const statusValue = String(value).trim()
        
        if (!validStatuses.includes(statusValue)) {
          return {
            isValid: false,
            error: `Order status must be one of: ${validStatuses.join(', ')}`,
            suggestion: `Use one of the valid TikTok statuses: ${validStatuses.slice(0, 3).join(', ')}`,
            severity: 'error'
          }
        }
        
        return { isValid: true }
      },
      businessRules: []
    },
    {
      field: 'Order Create Time',
      required: true,
      type: 'date'
    },
    {
      field: 'Video ID',
      required: false,
      type: 'string',
      pattern: /^[A-Za-z0-9_-]+$/,
      businessRules: []
    },
    {
      field: 'Product Quantity',
      required: false,
      type: 'number',
      customValidator: (value, row, context) => {
        if (value && parseInt(value) <= 0) {
          return {
            isValid: false,
            error: 'Product quantity must be greater than 0',
            suggestion: 'Enter a positive quantity value',
            severity: 'error'
          }
        }
        
        if (value && parseInt(value) > 10000) {
          return {
            isValid: false,
            error: 'Product quantity seems unusually high',
            suggestion: 'Verify the quantity is correct for TikTok orders',
            severity: 'warning'
          }
        }
        
        return { isValid: true }
      },
      businessRules: []
    }
  ],
  duplicateDetection: {
    fields: ['Order No.'],
    scope: 'workspace'
  }
}

/**
 * Get platform configuration by platform name
 */
export function getPlatformConfig(platform: string): PlatformCSVConfig {
  switch (platform.toLowerCase()) {
    case 'shopee':
      return SHOPEE_CONFIG
    case 'lazada':
      return LAZADA_CONFIG
    case 'tiktok':
      return TIKTOK_CONFIG
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

/**
 * Get all supported platforms
 */
export function getSupportedPlatforms(): string[] {
  return ['shopee', 'lazada', 'tiktok']
}

/**
 * Validate platform name
 */
export function isValidPlatform(platform: string): boolean {
  return getSupportedPlatforms().includes(platform.toLowerCase())
}

/**
 * Get platform display name
 */
export function getPlatformDisplayName(platform: string): string {
  switch (platform.toLowerCase()) {
    case 'shopee':
      return 'Shopee'
    case 'lazada':
      return 'Lazada'
    case 'tiktok':
      return 'TikTok Shop'
    default:
      return platform
  }
}

/**
 * Get platform-specific file size limits (in MB)
 */
export function getPlatformFileSizeLimit(platform: string): number {
  switch (platform.toLowerCase()) {
    case 'shopee':
      return 10 // 10MB
    case 'lazada':
      return 15 // 15MB
    case 'tiktok':
      return 20 // 20MB
    default:
      return 10
  }
}

/**
 * Get platform-specific row limits
 */
export function getPlatformRowLimit(platform: string): number {
  switch (platform.toLowerCase()) {
    case 'shopee':
      return 10000
    case 'lazada':
      return 15000
    case 'tiktok':
      return 20000
    default:
      return 10000
  }
}

/**
 * Generate sample CSV template for platform
 */
export function generateSampleCSV(platform: string): string {
  const config = getPlatformConfig(platform)
  const headers = [...config.requiredHeaders, ...(config.optionalHeaders || [])]
  
  // Generate sample data based on platform
  const sampleData = generateSampleData(platform)
  
  // Build CSV content
  let csvContent = headers.join(',') + '\n'
  
  sampleData.forEach(row => {
    const values = headers.map(header => {
      const value = row[header] || ''
      // Escape values that contain commas or quotes
      if (String(value).includes(',') || String(value).includes('"')) {
        return `"${String(value).replace(/"/g, '""')}"`
      }
      return value
    })
    csvContent += values.join(',') + '\n'
  })
  
  return csvContent
}

/**
 * Generate sample data for platform templates
 */
function generateSampleData(platform: string): Record<string, any>[] {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  
  switch (platform.toLowerCase()) {
    case 'shopee':
      return [
        {
          'Order ID': 'SH123456789',
          'Product ID': 'PROD001',
          'Product Name': 'Wireless Bluetooth Headphones',
          'SKU': 'WBH-001',
          'Category': 'Electronics',
          'Shop Name': 'TechStore',
          'Customer ID': 'CUST001',
          'Quantity': '1',
          'Unit Price': '29.99',
          'Total Amount': '29.99',
          'Commission Rate': '5.5',
          'Commission Amount': '1.65',
          'Currency': 'USD',
          'Order Status': 'Delivered',
          'Order Date': yesterday.toISOString().split('T')[0],
          'Click Time': yesterday.toISOString(),
          'Conversion Time': yesterday.toISOString()
        },
        {
          'Order ID': 'SH987654321',
          'Product ID': 'PROD002',
          'Product Name': 'Smartphone Case',
          'SKU': 'SC-002',
          'Category': 'Accessories',
          'Shop Name': 'MobileWorld',
          'Customer ID': 'CUST002',
          'Quantity': '2',
          'Unit Price': '12.50',
          'Total Amount': '25.00',
          'Commission Rate': '8.0',
          'Commission Amount': '2.00',
          'Currency': 'USD',
          'Order Status': 'Confirmed',
          'Order Date': now.toISOString().split('T')[0],
          'Click Time': now.toISOString(),
          'Conversion Time': now.toISOString()
        }
      ]
      
    case 'lazada':
      return [
        {
          'Transaction ID': 'LZ20240915001',
          'Product ID': 'LAZ123456',
          'Product Title': 'Gaming Mechanical Keyboard',
          'Product URL': 'https://lazada.com/products/gaming-keyboard',
          'Category': 'Computer & Accessories',
          'Seller Name': 'GamerHub',
          'Buyer ID': 'BUYER001',
          'Product Quantity': '1',
          'Product Price': '89.99',
          'Order Value': '89.99',
          'Commission Rate (%)': '6.5',
          'Commission (Local Currency)': '5.85',
          'Currency': 'USD',
          'Transaction Status': 'Confirmed',
          'Transaction Time': yesterday.toISOString(),
          'Click Timestamp': yesterday.toISOString(),
          'Purchase Timestamp': yesterday.toISOString(),
          'Country': 'US'
        }
      ]
      
    case 'tiktok':
      return [
        {
          'Order No.': 'TT240915000001',
          'Product ID': 'TK789123',
          'Product Name': 'Fashion Summer Dress',
          'Video ID': 'VIDEO123456',
          'Creator': '@fashionista',
          'Category Name': 'Fashion & Beauty',
          'Shop Name': 'StyleBoutique',
          'User ID': 'USER001',
          'Product Quantity': '1',
          'Product Price': '45.00',
          'Order Amount': '45.00',
          'Commission Rate': '12%',
          'Estimated Commission': '5.40',
          'Final Commission': '5.40',
          'Currency': 'USD',
          'Order Status': 'Completed',
          'Order Create Time': yesterday.toISOString(),
          'Video Publish Time': yesterday.toISOString(),
          'Settlement Date': now.toISOString().split('T')[0],
          'Region': 'North America'
        }
      ]
      
    default:
      return []
  }
}

/**
 * Get platform configuration with environment overrides
 */
export function getPlatformConfigWithOverrides(platform: string, overrides?: Partial<PlatformCSVConfig>): PlatformCSVConfig {
  const baseConfig = getPlatformConfig(platform)
  
  if (!overrides) {
    return baseConfig
  }
  
  return {
    ...baseConfig,
    ...overrides,
    validationRules: [
      ...baseConfig.validationRules,
      ...(overrides.validationRules || [])
    ],
    optionalHeaders: [
      ...(baseConfig.optionalHeaders || []),
      ...(overrides.optionalHeaders || [])
    ],
    fieldMappings: {
      ...baseConfig.fieldMappings,
      ...(overrides.fieldMappings || {})
    }
  }
}

/**
 * Validate platform configuration
 */
export function validatePlatformConfig(config: PlatformCSVConfig): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  
  // Basic validation
  if (!config.platform) {
    errors.push('Platform name is required')
  }
  
  if (!config.requiredHeaders || config.requiredHeaders.length === 0) {
    errors.push('At least one required header must be specified')
  }
  
  if (!config.fieldMappings) {
    errors.push('Field mappings are required')
  }
  
  if (!config.validationRules || config.validationRules.length === 0) {
    warnings.push('No validation rules specified')
  }
  
  // Check for missing field mappings
  const allHeaders = [...config.requiredHeaders, ...(config.optionalHeaders || [])]
  const mappedFields = Object.keys(config.fieldMappings)
  const unmappedHeaders = allHeaders.filter(header => !mappedFields.includes(header))
  
  if (unmappedHeaders.length > 0) {
    warnings.push(`Headers without field mappings: ${unmappedHeaders.join(', ')}`)
  }
  
  // Validate duplicate detection configuration
  if (config.duplicateDetection.fields.length === 0) {
    warnings.push('No duplicate detection fields specified')
  }
  
  const invalidDuplicateFields = config.duplicateDetection.fields.filter(
    field => !allHeaders.includes(field)
  )
  
  if (invalidDuplicateFields.length > 0) {
    errors.push(`Duplicate detection fields not found in headers: ${invalidDuplicateFields.join(', ')}`)
  }
  
  // Validate validation rules
  config.validationRules.forEach((rule, index) => {
    if (!rule.field) {
      errors.push(`Validation rule ${index}: field is required`)
    }
    
    if (!rule.type) {
      errors.push(`Validation rule ${index}: type is required`)
    }
    
    if (!allHeaders.includes(rule.field)) {
      warnings.push(`Validation rule ${index}: field '${rule.field}' not found in headers`)
    }
    
    if (rule.minLength !== undefined && rule.maxLength !== undefined && rule.minLength > rule.maxLength) {
      errors.push(`Validation rule ${index}: minLength cannot be greater than maxLength`)
    }
    
    if (rule.minValue !== undefined && rule.maxValue !== undefined && rule.minValue > rule.maxValue) {
      errors.push(`Validation rule ${index}: minValue cannot be greater than maxValue`)
    }
  })
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Create custom platform configuration
 */
export function createCustomPlatformConfig(options: {
  platform: string
  requiredHeaders: string[]
  optionalHeaders?: string[]
  fieldMappings: Record<string, string>
  duplicateDetectionFields: string[]
  customValidationRules?: CSVValidationRule[]
}): PlatformCSVConfig {
  const config = getEffectiveConfig()
  
  const validationRules: CSVValidationRule[] = []
  
  // Add basic validation rules for required headers
  options.requiredHeaders.forEach(header => {
    validationRules.push({
      field: header,
      required: true,
      type: 'string',
      minLength: 1,
      businessRules: []
    })
  })
  
  // Add custom validation rules
  if (options.customValidationRules) {
    validationRules.push(...options.customValidationRules)
  }
  
  const platformConfig: PlatformCSVConfig = {
    platform: options.platform as any,
    requiredHeaders: options.requiredHeaders,
    optionalHeaders: options.optionalHeaders || [],
    fieldMappings: options.fieldMappings,
    validationRules,
    duplicateDetection: {
      fields: options.duplicateDetectionFields,
      scope: 'workspace'
    }
  }
  
  // Validate the configuration
  const validation = validatePlatformConfig(platformConfig)
  if (!validation.isValid) {
    throw new Error(`Invalid platform configuration: ${validation.errors.join(', ')}`)
  }
  
  return platformConfig
}

/**
 * Get platform validation summary
 */
export function getPlatformValidationSummary(platform: string): {
  platform: string
  requiredFields: number
  optionalFields: number
  validationRules: number
  businessRules: number
  duplicateDetectionFields: string[]
  maxCommissionRate: number
  supportedStatuses: string[]
} {
  const config = getPlatformConfig(platform)
  const effectiveConfig = getEffectiveConfig()
  
  const businessRulesCount = config.validationRules.reduce(
    (total, rule) => total + (rule.businessRules?.length || 0),
    0
  )
  
  const platformKey = platform.toUpperCase() as keyof typeof effectiveConfig.platformValidation
  const platformValidation = effectiveConfig.platformValidation[platformKey]
  
  return {
    platform,
    requiredFields: config.requiredHeaders.length,
    optionalFields: config.optionalHeaders?.length || 0,
    validationRules: config.validationRules.length,
    businessRules: businessRulesCount,
    duplicateDetectionFields: config.duplicateDetection.fields,
    maxCommissionRate: platformValidation?.MAX_COMMISSION_RATE_PERCENT || 0,
    supportedStatuses: platformValidation?.VALID_ORDER_STATUSES || []
  }
}

/**
 * Compare platform configurations for compatibility analysis
 */
export function comparePlatformConfigs(platform1: string, platform2: string): {
  commonHeaders: string[]
  platform1UniqueHeaders: string[]
  platform2UniqueHeaders: string[]
  compatibilityScore: number
  suggestions: string[]
} {
  const config1 = getPlatformConfig(platform1)
  const config2 = getPlatformConfig(platform2)
  
  const headers1 = [...config1.requiredHeaders, ...(config1.optionalHeaders || [])]
  const headers2 = [...config2.requiredHeaders, ...(config2.optionalHeaders || [])]
  
  const commonHeaders = headers1.filter(h => headers2.includes(h))
  const platform1UniqueHeaders = headers1.filter(h => !headers2.includes(h))
  const platform2UniqueHeaders = headers2.filter(h => !headers1.includes(h))
  
  const compatibilityScore = commonHeaders.length / Math.max(headers1.length, headers2.length)
  
  const suggestions: string[] = []
  if (compatibilityScore < 0.5) {
    suggestions.push('Low compatibility - consider separate processing workflows')
  }
  if (platform1UniqueHeaders.length > 5) {
    suggestions.push(`${platform1} has many unique headers - may need custom mapping`)
  }
  if (platform2UniqueHeaders.length > 5) {
    suggestions.push(`${platform2} has many unique headers - may need custom mapping`)
  }
  
  return {
    commonHeaders,
    platform1UniqueHeaders,
    platform2UniqueHeaders,
    compatibilityScore,
    suggestions
  }
}

/**
 * Export platform configuration utilities
 */
export const PlatformConfigUtils = {
  /**
   * Check if a field is required for a platform
   */
  isRequiredField(platform: string, fieldName: string): boolean {
    const config = getPlatformConfig(platform)
    return config.requiredHeaders.includes(fieldName)
  },
  
  /**
   * Get field mapping for a platform
   */
  getFieldMapping(platform: string, headerName: string): string | null {
    const config = getPlatformConfig(platform)
    return config.fieldMappings[headerName] || null
  },
  
  /**
   * Get validation rule for a specific field
   */
  getFieldValidationRule(platform: string, fieldName: string): CSVValidationRule | null {
    const config = getPlatformConfig(platform)
    return config.validationRules.find(rule => rule.field === fieldName) || null
  },
  
  /**
   * Check if field has business rules
   */
  hasBusinessRules(platform: string, fieldName: string): boolean {
    const rule = this.getFieldValidationRule(platform, fieldName)
    return !!(rule?.businessRules && rule.businessRules.length > 0)
  },
  
  /**
   * Get platform-specific error messages
   */
  getPlatformErrorMessages(platform: string): Record<string, string> {
    const config = getEffectiveConfig()
    
    switch (platform.toLowerCase()) {
      case 'shopee':
        return {
          invalidCommission: 'คอมมิชชั่นไม่ถูกต้อง',
          invalidStatus: 'สถานะการสั่งซื้อไม่ถูกต้อง',
          invalidDate: 'วันที่ไม่ถูกต้อง',
          invalidQuantity: 'จำนวนไม่ถูกต้อง'
        }
      case 'lazada':
      case 'tiktok':
      default:
        return {
          invalidCommission: 'Invalid commission amount',
          invalidStatus: 'Invalid order status',
          invalidDate: 'Invalid date format',
          invalidQuantity: 'Invalid quantity'
        }
    }
  },
  
  /**
   * Get platform-specific suggestions
   */
  getPlatformSuggestions(platform: string, errorType: string): string[] {
    const suggestions: string[] = []
    
    switch (platform.toLowerCase()) {
      case 'shopee':
        switch (errorType) {
          case 'commission':
            suggestions.push('ตรวจสอบรูปแบบคอมมิชชั่น (เช่น 10.50 หรือ ฿10.50)')
            suggestions.push('ตรวจสอบว่าคอมมิชชั่นอยู่ในช่วงที่กำหนด')
            break
          case 'status':
            suggestions.push('ใช้สถานะที่ถูกต้อง: สำเร็จ, รอดำเนินการ, ยกเลิก')
            break
          case 'date':
            suggestions.push('ใช้รูปแบบวันที่: YYYY-MM-DD หรือ DD/MM/YYYY')
            break
        }
        break
        
      case 'lazada':
      case 'tiktok':
        switch (errorType) {
          case 'commission':
            suggestions.push('Check commission format (e.g., 12.50 or $12.50)')
            suggestions.push('Verify commission is within platform limits')
            break
          case 'status':
            suggestions.push('Use valid status values as specified by the platform')
            break
          case 'date':
            suggestions.push('Use date format: YYYY-MM-DD or MM/DD/YYYY')
            break
        }
        break
    }
    
    return suggestions
  }
}