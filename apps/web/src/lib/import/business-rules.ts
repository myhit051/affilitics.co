/**
 * Enhanced Business Rules Validation for CSV Import
 * Platform-specific business logic, cross-field validation, and contextual suggestions
 */

// import { CSV_VALIDATION_CONFIG, PLATFORM_VALIDATION_CONFIG, getEffectiveConfig } from '@aff/db'
import type { BusinessRule, ValidationResult, ValidationContext } from './csv-validator'

// Mock config for build purposes
const getEffectiveConfig = () => ({
  platformValidation: {
    SHOPEE: { MAX_COMMISSION_RATE_PERCENT: 100 },
    LAZADA: { MAX_COMMISSION_RATE_PERCENT: 95 },
    TIKTOK: { MAX_COMMISSION_RATE_PERCENT: 90 }
  },
  csvValidation: {
    COMMISSION_RATE_MIN_PERCENT: 0,
    ORDER_DATE_MAX_DAYS_AGO: 365,
    ORDER_DATE_MAX_DAYS_FUTURE: 30,
    PRODUCT_NAME_MIN_LENGTH: 5,
    ORDER_ID_MIN_LENGTH: 5,
    ORDER_ID_MAX_LENGTH: 50,
    CURRENCY_MAX_VALUE: 1000000,
    CURRENCY_DECIMAL_PLACES: 2
  }
})

// Enhanced business rule interface with context and dependencies
export interface EnhancedBusinessRule extends BusinessRule {
  dependencies?: string[] // Fields this rule depends on
  category: 'data_integrity' | 'business_logic' | 'platform_compliance' | 'data_quality'
  priority: 'low' | 'medium' | 'high' | 'critical'
  autoFix?: (value: any, row: Record<string, any>) => any // Auto-fix suggestion
  context?: {
    helpUrl?: string
    examples?: string[]
    relatedFields?: string[]
  }
}

// Rule execution result with enhanced feedback
export interface EnhancedValidationResult extends ValidationResult {
  category?: string
  priority?: string
  autoFix?: any
  context?: {
    relatedErrors?: string[]
    suggestedActions?: string[]
    helpUrl?: string
  }
}

/**
 * Commission Rate Business Rules
 */
export const CommissionRateRules: Record<string, any[]> = {
  shopee: [
    {
      name: 'commission_rate_range',
      description: 'Commission rate must be within acceptable range for Shopee',
      category: 'platform_compliance',
      priority: 'high',
      dependencies: ['อัตราคอมมิชชั่นช้อปปี้ของสินค้า'],
      validator: (value: any, row: any, context: any) => {
        const config = getEffectiveConfig()
        const rate = parseFloat(String(value).replace('%', ''))
        const maxRate = config.platformValidation.SHOPEE.MAX_COMMISSION_RATE_PERCENT
        const minRate = config.csvValidation.COMMISSION_RATE_MIN_PERCENT

        if (isNaN(rate)) {
          return {
            isValid: false,
            error: 'Commission rate must be a valid number',
            suggestion: 'Enter commission rate as a number (e.g., 5.5 for 5.5%)',
            severity: 'error',
            category: 'platform_compliance',
            priority: 'high',
            context: {
              helpUrl: '/docs/shopee-commission-rates',
              suggestedActions: [
                'Check if the value contains only numbers and decimal points',
                'Remove any currency symbols or percentage signs',
                'Verify the commission rate with Shopee documentation'
              ]
            }
          }
        }

        if (rate < minRate || rate > maxRate) {
          return {
            isValid: false,
            error: `Commission rate ${rate}% is outside acceptable range (${minRate}% - ${maxRate}%)`,
            suggestion: `Commission rates for Shopee should be between ${minRate}% and ${maxRate}%`,
            severity: 'error',
            category: 'platform_compliance',
            priority: 'high',
            autoFix: Math.max(minRate, Math.min(maxRate, rate)),
            context: {
              helpUrl: '/docs/shopee-commission-rates',
              examples: ['5.5', '12.0', '25.5'],
              suggestedActions: [
                'Verify commission rate with your Shopee affiliate agreement',
                'Check if this is a special promotion rate',
                'Contact Shopee support if you believe this rate is correct'
              ]
            }
          }
        }
        return { isValid: true }
      },
      severity: 'error',
      context: {
        helpUrl: '/docs/shopee-commission-validation',
        examples: ['5.5', '12.0', '25.5'],
        relatedFields: ['คอมมิชชั่นคำสั่งซื้อโดยรวม(฿)', 'มูลค่าซื้อ(฿)']
      }
    },
    {
      name: 'commission_amount_consistency',
      description: 'Commission amount should be consistent with rate and total amount',
      category: 'data_integrity',
      priority: 'medium',
      dependencies: ['มูลค่าซื้อ(฿)', 'อัตราคอมมิชชั่นช้อปปี้ของสินค้า'],
      validator: (value: any, row: any, context: any) => {
        const commissionAmount = parseFloat(String(value).replace(/[฿$,\s]/g, ''))
        const totalAmount = parseFloat(String(row['มูลค่าซื้อ(฿)'] || '0').replace(/[฿$,\s]/g, ''))
        const commissionRate = parseFloat(String(row['อัตราคอมมิชชั่นช้อปปี้ของสินค้า'] || '0').replace('%', ''))

        if (isNaN(commissionAmount) || isNaN(totalAmount) || isNaN(commissionRate)) {
          return {
            isValid: false,
            error: 'Invalid numeric values in commission calculation fields',
            suggestion: 'Ensure commission amount, total amount, and commission rate are valid numbers',
            severity: 'error',
            category: 'data_integrity',
            priority: 'high',
            context: {
              relatedErrors: ['Check มูลค่าซื้อ(฿)', 'Check อัตราคอมมิชชั่นช้อปปี้ของสินค้า'],
              suggestedActions: [
                'Verify all numeric fields contain valid numbers',
                'Remove currency symbols and formatting',
                'Check for missing or corrupted data'
              ]
            }
          }
        }

        if (totalAmount > 0 && commissionRate > 0) {
          const expectedCommission = (totalAmount * commissionRate) / 100
          const tolerance = Math.max(0.01, expectedCommission * 0.001) // Dynamic tolerance
          const difference = Math.abs(commissionAmount - expectedCommission)

          if (difference > tolerance) {
            const discrepancyPercentage = (difference / expectedCommission) * 100
            
            return {
              isValid: false,
              error: `Commission amount ${commissionAmount} doesn't match calculated amount ${expectedCommission.toFixed(2)} (${discrepancyPercentage.toFixed(1)}% difference)`,
              suggestion: `Expected calculation: ${totalAmount} × ${commissionRate}% = ${expectedCommission.toFixed(2)}`,
              severity: discrepancyPercentage > 5 ? 'error' : 'warning',
              category: 'data_integrity',
              priority: discrepancyPercentage > 10 ? 'high' : 'medium',
              autoFix: expectedCommission,
              context: {
                relatedErrors: [`Total amount: ${totalAmount}`, `Commission rate: ${commissionRate}%`],
                suggestedActions: [
                  'Verify the commission calculation is correct',
                  'Check if there are additional fees or adjustments',
                  'Confirm commission rate matches Shopee agreement',
                  'Consider rounding differences in calculations'
                ]
              }
            }
          }
        }
        return { isValid: true }
      },
      severity: 'warning',
      context: {
        helpUrl: '/docs/commission-calculation',
        examples: ['Total: 100฿ × Rate: 5% = Commission: 5฿'],
        relatedFields: ['มูลค่าซื้อ(฿)', 'อัตราคอมมิชชั่นช้อปปี้ของสินค้า']
      }
    }
  ],

  lazada: [
    {
      name: 'commission_rate_range',
      description: 'Commission rate must be within acceptable range for Lazada',
      validator: (value: any, row: any, context: any) => {
        const config = getEffectiveConfig()
        const rate = parseFloat(String(value).replace('%', ''))
        const maxRate = config.platformValidation.LAZADA.MAX_COMMISSION_RATE_PERCENT
        const minRate = config.csvValidation.COMMISSION_RATE_MIN_PERCENT

        if (rate < minRate || rate > maxRate) {
          return {
            isValid: false,
            error: `Commission rate ${rate}% is outside acceptable range (${minRate}% - ${maxRate}%)`,
            suggestion: `Commission rates for Lazada should be between ${minRate}% and ${maxRate}%`,
            severity: 'error'
          }
        }
        return { isValid: true }
      },
      severity: 'error'
    },
    {
      name: 'transaction_status_commission_logic',
      description: 'Commission should only be present for confirmed transactions',
      validator: (value: any, row: any, context: any) => {
        const status = String(row['Transaction Status'] || '').toLowerCase()
        const commission = parseFloat(String(value).replace(/[^0-9.-]/g, ''))

        if (commission > 0 && !['confirmed', 'paid'].includes(status)) {
          return {
            isValid: false,
            error: `Commission present for non-confirmed transaction (status: ${status})`,
            suggestion: 'Commission should only be present for confirmed or paid transactions',
            severity: 'warning'
          }
        }
        return { isValid: true }
      },
      severity: 'warning'
    }
  ],

  tiktok: [
    {
      name: 'commission_rate_range',
      description: 'Commission rate must be within acceptable range for TikTok',
      validator: (value: any, row: any, context: any) => {
        const config = getEffectiveConfig()
        const rate = parseFloat(String(value).replace('%', ''))
        const maxRate = config.platformValidation.TIKTOK.MAX_COMMISSION_RATE_PERCENT
        const minRate = config.csvValidation.COMMISSION_RATE_MIN_PERCENT

        if (rate < minRate || rate > maxRate) {
          return {
            isValid: false,
            error: `Commission rate ${rate}% is outside acceptable range (${minRate}% - ${maxRate}%)`,
            suggestion: `Commission rates for TikTok should be between ${minRate}% and ${maxRate}%`,
            severity: 'error'
          }
        }
        return { isValid: true }
      },
      severity: 'error'
    },
    {
      name: 'final_vs_estimated_commission',
      description: 'Final commission should be close to estimated commission',
      validator: (value: any, row: any, context: any) => {
        const estimated = parseFloat(String(row['Estimated Commission'] || '0').replace(/[^0-9.-]/g, ''))
        const final = parseFloat(String(row['Final Commission'] || '0').replace(/[^0-9.-]/g, ''))

        if (estimated > 0 && final > 0) {
          const difference = Math.abs(estimated - final)
          const tolerance = estimated * 0.1 // 10% tolerance

          if (difference > tolerance) {
            return {
              isValid: false,
              error: `Final commission ${final} differs significantly from estimated ${estimated}`,
              suggestion: 'Large differences between estimated and final commission may indicate data issues',
              severity: 'info'
            }
          }
        }
        return { isValid: true }
      },
      severity: 'info'
    }
  ]
}

/**
 * Date Validation Business Rules
 */
export const DateRules: BusinessRule[] = [
  {
    name: 'order_date_range',
    description: 'Order date should be within acceptable time range',
    validator: (value, row, context) => {
      const config = getEffectiveConfig()
      const orderDate = new Date(value)
      const now = new Date()
      const maxDaysAgo = config.csvValidation.ORDER_DATE_MAX_DAYS_AGO
      const maxDaysFuture = config.csvValidation.ORDER_DATE_MAX_DAYS_FUTURE
      
      const minDate = new Date(now.getTime() - (maxDaysAgo * 24 * 60 * 60 * 1000))
      const maxDate = new Date(now.getTime() + (maxDaysFuture * 24 * 60 * 60 * 1000))

      if (orderDate < minDate) {
        return {
          isValid: false,
          error: `Order date ${orderDate.toISOString().split('T')[0]} is too old (more than ${maxDaysAgo} days ago)`,
          suggestion: `Order dates should be within the last ${maxDaysAgo} days`,
          severity: 'warning'
        }
      }

      if (orderDate > maxDate) {
        return {
          isValid: false,
          error: `Order date ${orderDate.toISOString().split('T')[0]} is in the future (more than ${maxDaysFuture} days ahead)`,
          suggestion: `Order dates should not be more than ${maxDaysFuture} days in the future`,
          severity: 'error'
        }
      }

      return { isValid: true }
    },
    severity: 'error'
  },
  {
    name: 'click_to_order_timing',
    description: 'Order should happen after click time',
    validator: (value, row, context) => {
      const orderDate = new Date(value)
      const clickTimeField = context.platform === 'shopee' ? 'เวลาคลิก' : 
                            context.platform === 'lazada' ? 'Click Timestamp' : 'Video Publish Time'
      const clickTime = new Date(row[clickTimeField] || '')

      if (!isNaN(clickTime.getTime()) && !isNaN(orderDate.getTime())) {
        if (orderDate < clickTime) {
          return {
            isValid: false,
            error: 'Order date cannot be before click time',
            suggestion: 'Check if dates are in correct order: click time should be before order time',
            severity: 'error'
          }
        }

        // Check for suspicious timing (order within seconds of click)
        const timeDiff = orderDate.getTime() - clickTime.getTime()
        if (timeDiff < 1000) { // Less than 1 second
          return {
            isValid: false,
            error: 'Order happened too quickly after click (less than 1 second)',
            suggestion: 'Verify if timing data is correct',
            severity: 'warning'
          }
        }
      }

      return { isValid: true }
    },
    severity: 'warning'
  }
]

/**
 * Product and Order Validation Rules
 */
export const ProductOrderRules: BusinessRule[] = [
  {
    name: 'quantity_amount_consistency',
    description: 'Total amount should match quantity × unit price',
    validator: (value, row, context) => {
      const quantity = parseInt(String(row['quantity'] || row['จำนวน'] || row['Product Quantity'] || '1'))
      const unitPriceField = context.platform === 'shopee' ? 'ราคา(฿)' :
                            context.platform === 'lazada' ? 'Product Price' : 'Product Price'
      const totalAmountField = context.platform === 'shopee' ? 'มูลค่าซื้อ(฿)' :
                              context.platform === 'lazada' ? 'Order Value' : 'Order Amount'
      
      const unitPrice = parseFloat(String(row[unitPriceField] || '0').replace(/[^0-9.-]/g, ''))
      const totalAmount = parseFloat(String(row[totalAmountField] || '0').replace(/[^0-9.-]/g, ''))

      if (quantity > 0 && unitPrice > 0 && totalAmount > 0) {
        const expectedTotal = quantity * unitPrice
        const tolerance = 0.01 // 1 cent tolerance
        const difference = Math.abs(totalAmount - expectedTotal)

        if (difference > tolerance) {
          return {
            isValid: false,
            error: `Total amount ${totalAmount} doesn't match quantity × unit price (${quantity} × ${unitPrice} = ${expectedTotal})`,
            suggestion: 'Check if quantity, unit price, and total amount are consistent',
            severity: 'warning'
          }
        }
      }

      return { isValid: true }
    },
    severity: 'warning'
  },
  {
    name: 'product_name_quality',
    description: 'Product name should be descriptive and not contain suspicious patterns',
    validator: (value, row, context) => {
      const productName = String(value).trim()
      const config = getEffectiveConfig()

      // Check minimum length
      if (productName.length < config.csvValidation.PRODUCT_NAME_MIN_LENGTH) {
        return {
          isValid: false,
          error: `Product name too short (${productName.length} characters)`,
          suggestion: `Product names should be at least ${config.csvValidation.PRODUCT_NAME_MIN_LENGTH} characters`,
          severity: 'warning'
        }
      }

      // Check for suspicious patterns
      const suspiciousPatterns = [
        /^[a-zA-Z0-9]+$/, // Only alphanumeric (too generic)
        /^test/i, // Test products
        /^sample/i, // Sample products
        /(.)\1{10,}/ // Repeated characters
      ]

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(productName)) {
          return {
            isValid: false,
            error: 'Product name appears to contain test or placeholder data',
            suggestion: 'Use actual product names instead of test data',
            severity: 'info'
          }
        }
      }

      return { isValid: true }
    },
    severity: 'info'
  },
  {
    name: 'order_id_format',
    description: 'Order ID should follow platform-specific format patterns',
    validator: (value, row, context) => {
      const orderId = String(value).trim()
      const config = getEffectiveConfig()
      
      // Length checks
      if (orderId.length < config.csvValidation.ORDER_ID_MIN_LENGTH) {
        return {
          isValid: false,
          error: `Order ID too short (${orderId.length} characters)`,
          suggestion: `Order IDs should be at least ${config.csvValidation.ORDER_ID_MIN_LENGTH} characters`,
          severity: 'error'
        }
      }

      if (orderId.length > config.csvValidation.ORDER_ID_MAX_LENGTH) {
        return {
          isValid: false,
          error: `Order ID too long (${orderId.length} characters)`,
          suggestion: `Order IDs should not exceed ${config.csvValidation.ORDER_ID_MAX_LENGTH} characters`,
          severity: 'error'
        }
      }

      // Platform-specific format validation
      switch (context.platform) {
        case 'shopee':
          // Shopee order IDs are typically alphanumeric
          if (!/^[A-Za-z0-9]+$/.test(orderId)) {
            return {
              isValid: false,
              error: 'Shopee order ID should only contain letters and numbers',
              suggestion: 'Check if order ID format is correct for Shopee',
              severity: 'warning'
            }
          }
          break
          
        case 'lazada':
          // Lazada transaction IDs often start with letters followed by numbers
          if (!/^[A-Za-z]{2}[0-9]+$/.test(orderId)) {
            return {
              isValid: false,
              error: 'Lazada transaction ID format appears unusual',
              suggestion: 'Verify if transaction ID format is correct for Lazada',
              severity: 'info'
            }
          }
          break
          
        case 'tiktok':
          // TikTok order numbers are typically numeric with possible prefixes
          if (!/^[A-Za-z]*[0-9]+$/.test(orderId)) {
            return {
              isValid: false,
              error: 'TikTok order number format appears unusual',
              suggestion: 'Verify if order number format is correct for TikTok',
              severity: 'info'
            }
          }
          break
      }

      return { isValid: true }
    },
    severity: 'warning'
  }
]

/**
 * Currency and Amount Validation Rules
 */
export const CurrencyRules: BusinessRule[] = [
  {
    name: 'currency_consistency',
    description: 'All currency fields should use consistent currency format',
    validator: (value, row, context) => {
      const config = getEffectiveConfig()
      const amount = parseFloat(String(value).replace(/[^0-9.-]/g, ''))
      
      // Check maximum amount
      if (amount > config.csvValidation.CURRENCY_MAX_VALUE) {
        return {
          isValid: false,
          error: `Amount ${amount} exceeds maximum allowed value (${config.csvValidation.CURRENCY_MAX_VALUE})`,
          suggestion: 'Check if amount is realistic for this transaction',
          severity: 'warning'
        }
      }

      // Check decimal places
      const decimalMatch = String(value).match(/\.(\d+)$/)
      if (decimalMatch && decimalMatch[1].length > config.csvValidation.CURRENCY_DECIMAL_PLACES) {
        return {
          isValid: false,
          error: `Amount has too many decimal places (${decimalMatch[1].length})`,
          suggestion: `Currency amounts should have at most ${config.csvValidation.CURRENCY_DECIMAL_PLACES} decimal places`,
          severity: 'info'
        }
      }

      return { isValid: true }
    },
    severity: 'info'
  },
  {
    name: 'reasonable_amounts',
    description: 'Commission and order amounts should be reasonable',
    validator: (value, row, context) => {
      const amount = parseFloat(String(value).replace(/[^0-9.-]/g, ''))
      
      // Very large amounts might be suspicious
      if (amount > 10000) {
        return {
          isValid: false,
          error: `Amount ${amount} is unusually large`,
          suggestion: 'Verify if this amount is correct',
          severity: 'info'
        }
      }

      // Very small commission amounts might indicate issues
      if (amount > 0 && amount < 0.01) {
        return {
          isValid: false,
          error: `Amount ${amount} is unusually small`,
          suggestion: 'Check if decimal point is in correct position',
          severity: 'info'
        }
      }

      return { isValid: true }
    },
    severity: 'info'
  }
]

/**
 * Cross-field Validation Rules
 */
export const CrossFieldRules: BusinessRule[] = [
  {
    name: 'status_commission_logic',
    description: 'Commission should align with order status',
    validator: (value, row, context) => {
      const commission = parseFloat(String(value).replace(/[^0-9.-]/g, ''))
      const statusField = context.platform === 'shopee' ? 'สถานะการสั่งซื้อ' :
                         context.platform === 'lazada' ? 'Transaction Status' : 'Order Status'
      const status = String(row[statusField] || '').toLowerCase()

      // Commission should be zero for cancelled/invalid orders
      const cancelledStatuses = ['cancelled', 'invalid', 'ยกเลิก', 'คืนเงิน']
      const isCancelled = cancelledStatuses.some(s => status.includes(s.toLowerCase()))
      
      if (isCancelled && commission > 0) {
        return {
          isValid: false,
          error: `Commission ${commission} present for cancelled/invalid order (status: ${status})`,
          suggestion: 'Commission should be zero for cancelled or invalid orders',
          severity: 'warning'
        }
      }

      // Commission should be present for successful orders
      const successStatuses = ['success', 'completed', 'confirmed', 'paid', 'สำเร็จ']
      const isSuccess = successStatuses.some(s => status.includes(s.toLowerCase()))
      
      if (isSuccess && commission <= 0) {
        return {
          isValid: false,
          error: `No commission for successful order (status: ${status})`,
          suggestion: 'Successful orders should have commission amounts',
          severity: 'info'
        }
      }

      return { isValid: true }
    },
    severity: 'warning'
  }
]

/**
 * Get business rules for a specific field and platform
 */
export function getBusinessRulesForField(
  fieldName: string,
  platform: string,
  context: ValidationContext
): BusinessRule[] {
  const rules: BusinessRule[] = []
  
  // Add commission-specific rules
  if (fieldName.toLowerCase().includes('commission') || fieldName.includes('คอมมิชชั่น')) {
    rules.push(...(CommissionRateRules[platform] || []))
    rules.push(...CurrencyRules)
    rules.push(...CrossFieldRules)
  }
  
  // Add date-specific rules
  if (fieldName.toLowerCase().includes('date') || fieldName.toLowerCase().includes('time') || fieldName.includes('เวลา')) {
    rules.push(...DateRules)
  }
  
  // Add product-specific rules
  if (fieldName.toLowerCase().includes('product') || fieldName.toLowerCase().includes('name') || fieldName.includes('ชื่อ')) {
    rules.push(...ProductOrderRules.filter(r => r.name.includes('product')))
  }
  
  // Add order ID rules
  if (fieldName.toLowerCase().includes('order') || fieldName.toLowerCase().includes('transaction') || fieldName.includes('รหัส')) {
    rules.push(...ProductOrderRules.filter(r => r.name.includes('order_id')))
  }
  
  // Add amount/currency rules
  if (fieldName.toLowerCase().includes('amount') || fieldName.toLowerCase().includes('price') || 
      fieldName.includes('ราคา') || fieldName.includes('มูลค่า')) {
    rules.push(...CurrencyRules)
    rules.push(...ProductOrderRules.filter(r => r.name.includes('quantity_amount')))
  }
  
  return rules
}

/**
 * Validate business rules for a complete row
 */
export function validateRowBusinessRules(
  row: Record<string, any>,
  rowNumber: number,
  config: any,
  context: ValidationContext
): ValidationResult[] {
  const results: ValidationResult[] = []
  
  // Run cross-field validations
  for (const rule of CrossFieldRules) {
    // For cross-field rules, we need to determine which field triggered the rule
    // For now, we'll run them against commission fields
    const commissionFields = Object.keys(row).filter(k => 
      k.toLowerCase().includes('commission') || k.includes('คอมมิชชั่น')
    )
    
    for (const field of commissionFields) {
      const result = rule.validator(row[field], row, context)
      if (!result.isValid) {
        results.push({
          ...result,
          severity: result.severity || rule.severity
        })
      }
    }
  }
  
  return results
}

/**
 * Get all available business rule categories
 */
export function getBusinessRuleCategories(): Record<string, BusinessRule[]> {
  return {
    commission: Object.values(CommissionRateRules).flat(),
    dates: DateRules,
    products: ProductOrderRules,
    currency: CurrencyRules,
    crossField: CrossFieldRules
  }
}

/**
 * Get business rule suggestions for field improvement
 */
export function getFieldImprovementSuggestions(
  fieldName: string,
  value: any,
  platform: string
): string[] {
  const suggestions: string[] = []
  const stringValue = String(value).trim()
  
  // Commission field suggestions
  if (fieldName.toLowerCase().includes('commission') || fieldName.includes('คอมมิชชั่น')) {
    if (!stringValue.includes('%') && !stringValue.includes('.')) {
      suggestions.push('Consider using percentage format (e.g., 5.5%) or decimal format (e.g., 0.055)')
    }
    if (parseFloat(stringValue.replace(/[^0-9.-]/g, '')) > 50) {
      suggestions.push('Commission rate seems high - verify if this is percentage or decimal')
    }
  }
  
  // Date field suggestions
  if (fieldName.toLowerCase().includes('date') || fieldName.toLowerCase().includes('time')) {
    if (!stringValue.includes('-') && !stringValue.includes('/')) {
      suggestions.push('Use standard date format: YYYY-MM-DD or MM/DD/YYYY')
    }
    if (stringValue.length < 8) {
      suggestions.push('Date appears incomplete - ensure full date is provided')
    }
  }
  
  // Product name suggestions
  if (fieldName.toLowerCase().includes('product') && fieldName.toLowerCase().includes('name')) {
    if (stringValue.length < 10) {
      suggestions.push('Product name is very short - consider adding more descriptive information')
    }
    if (!/[a-zA-Z]/.test(stringValue)) {
      suggestions.push('Product name should contain descriptive text, not just numbers')
    }
  }
  
  // Order ID suggestions
  if (fieldName.toLowerCase().includes('order') || fieldName.toLowerCase().includes('transaction')) {
    if (stringValue.length < 5) {
      suggestions.push('Order ID seems short - verify this is the complete order identifier')
    }
    if (/\s/.test(stringValue)) {
      suggestions.push('Order IDs typically do not contain spaces')
    }
  }
  
  return suggestions
}

/**
 * Export business rule validator factory
 */
export function createBusinessRuleValidator(platform: string, context: ValidationContext) {
  return {
    validateField: (fieldName: string, value: any, row: Record<string, any>): ValidationResult[] => {
      const rules = getBusinessRulesForField(fieldName, platform, context)
      return rules.map(rule => rule.validator(value, row, context)).filter(result => !result.isValid)
    },
    
    validateRow: (row: Record<string, any>, rowNumber: number): ValidationResult[] => {
      return validateRowBusinessRules(row, rowNumber, null, context)
    },
    
    getSuggestions: (fieldName: string, value: any): string[] => {
      return getFieldImprovementSuggestions(fieldName, value, platform)
    }
  }
}

/**
 * Enhanced cross-field validation engine
 */
export class CrossFieldValidator {
  private rules: EnhancedBusinessRule[]
  private context: ValidationContext

  constructor(rules: EnhancedBusinessRule[], context: ValidationContext) {
    this.rules = rules
    this.context = context
  }

  /**
   * Validate all cross-field rules for a row
   */
  validateRow(row: Record<string, any>, rowNumber: number): EnhancedValidationResult[] {
    const results: EnhancedValidationResult[] = []
    
    // Perform complex cross-field validations
    const complexResults = this.performComplexValidations(row, rowNumber)
    results.push(...complexResults)
    
    return results.filter(result => !result.isValid)
  }

  /**
   * Perform complex cross-field validations
   */
  private performComplexValidations(
    row: Record<string, any>, 
    rowNumber: number
  ): EnhancedValidationResult[] {
    const results: EnhancedValidationResult[] = []
    
    // Date consistency validation
    const dateValidation = this.validateDateConsistency(row)
    if (dateValidation) results.push(dateValidation)
    
    // Amount calculation validation
    const amountValidation = this.validateAmountCalculations(row)
    if (amountValidation) results.push(amountValidation)
    
    // Status consistency validation
    const statusValidation = this.validateStatusConsistency(row)
    if (statusValidation) results.push(statusValidation)
    
    // Platform-specific validations
    const platformValidation = this.validatePlatformSpecificRules(row)
    results.push(...platformValidation)
    
    return results
  }

  /**
   * Validate date field consistency
   */
  private validateDateConsistency(row: Record<string, any>): EnhancedValidationResult | null {
    const orderDate = this.parseDate(row['เวลาที่สั่งซื้อ'] || row['Order Create Time'] || row['Transaction Time'])
    const clickDate = this.parseDate(row['Click Timestamp'] || row['Video Publish Time'])
    const settlementDate = this.parseDate(row['Settlement Date'])
    
    if (orderDate && clickDate) {
      // Click should be before or same as order
      if (clickDate > orderDate) {
        const timeDiff = (clickDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60) // hours
        
        return {
          isValid: false,
          error: `Click time (${clickDate.toISOString()}) is after order time (${orderDate.toISOString()})`,
          suggestion: 'Verify the chronological order of click and order events',
          severity: timeDiff > 24 ? 'error' : 'warning',
          category: 'data_integrity',
          priority: 'medium',
          context: {
            suggestedActions: [
              'Check if timezone differences could explain the discrepancy',
              'Verify data source accuracy',
              'Consider if this is a data export issue'
            ]
          }
        }
      }
    }
    
    if (orderDate && settlementDate) {
      // Settlement should be after order
      if (settlementDate < orderDate) {
        return {
          isValid: false,
          error: `Settlement date (${settlementDate.toISOString()}) is before order date (${orderDate.toISOString()})`,
          suggestion: 'Settlement dates should be after order dates',
          severity: 'error',
          category: 'business_logic',
          priority: 'high'
        }
      }
    }
    
    return null
  }

  /**
   * Validate amount calculations across fields
   */
  private validateAmountCalculations(row: Record<string, any>): EnhancedValidationResult | null {
    const platform = this.context.platform.toLowerCase()
    
    // Get amounts based on platform
    let unitPrice = 0, quantity = 1, totalAmount = 0
    
    if (platform === 'shopee') {
      unitPrice = this.parseAmount(row['ราคา(฿)'])
      quantity = parseInt(row['จำนวน'] || '1')
      totalAmount = this.parseAmount(row['มูลค่าซื้อ(฿)'])
    } else if (platform === 'lazada') {
      unitPrice = this.parseAmount(row['Product Price'])
      quantity = parseInt(row['Product Quantity'] || '1')
      totalAmount = this.parseAmount(row['Order Value'])
    } else if (platform === 'tiktok') {
      unitPrice = this.parseAmount(row['Product Price'])
      quantity = parseInt(row['Product Quantity'] || '1')
      totalAmount = this.parseAmount(row['Order Amount'])
    }
    
    if (unitPrice > 0 && quantity > 0 && totalAmount > 0) {
      const expectedTotal = unitPrice * quantity
      const difference = Math.abs(totalAmount - expectedTotal)
      const tolerance = Math.max(0.01, expectedTotal * 0.001)
      
      if (difference > tolerance) {
        return {
          isValid: false,
          error: `Total amount ${totalAmount} doesn't match unit price × quantity (${unitPrice} × ${quantity} = ${expectedTotal})`,
          suggestion: 'Verify price calculations or check for additional fees/discounts',
          severity: 'warning',
          category: 'data_integrity',
          priority: 'medium',
          autoFix: expectedTotal,
          context: {
            suggestedActions: [
              'Check for shipping fees or taxes included in total',
              'Verify discount applications',
              'Confirm unit price accuracy'
            ]
          }
        }
      }
    }
    
    return null
  }

  /**
   * Validate status consistency
   */
  private validateStatusConsistency(row: Record<string, any>): EnhancedValidationResult | null {
    const platform = this.context.platform.toLowerCase()
    let status = '', commissionAmount = 0
    
    if (platform === 'shopee') {
      status = row['สถานะการสั่งซื้อ'] || ''
      commissionAmount = this.parseAmount(row['คอมมิชชั่นคำสั่งซื้อโดยรวม(฿)'])
    } else if (platform === 'lazada') {
      status = row['Transaction Status'] || ''
      commissionAmount = this.parseAmount(row['Commission (Local Currency)'])
    } else if (platform === 'tiktok') {
      status = row['Order Status'] || ''
      commissionAmount = this.parseAmount(row['Estimated Commission'])
    }
    
    // Check if commission is paid for cancelled orders
    if ((status.includes('ยกเลิก') || status.includes('Cancelled') || status.includes('Invalid')) && commissionAmount > 0) {
      return {
        isValid: false,
        error: `Commission amount ${commissionAmount} exists for cancelled/invalid order`,
        suggestion: 'Cancelled orders should typically have zero commission',
        severity: 'warning',
        category: 'business_logic',
        priority: 'medium',
        autoFix: 0,
        context: {
          suggestedActions: [
            'Verify if this is a special case with commission despite cancellation',
            'Check platform-specific commission policies',
            'Consider if this is a refund processing error'
          ]
        }
      }
    }
    
    return null
  }

  /**
   * Validate platform-specific business rules
   */
  private validatePlatformSpecificRules(row: Record<string, any>): EnhancedValidationResult[] {
    const results: EnhancedValidationResult[] = []
    const platform = this.context.platform.toLowerCase()
    
    if (platform === 'shopee') {
      results.push(...this.validateShopeeSpecificRules(row))
    } else if (platform === 'lazada') {
      results.push(...this.validateLazadaSpecificRules(row))
    } else if (platform === 'tiktok') {
      results.push(...this.validateTikTokSpecificRules(row))
    }
    
    return results
  }

  /**
   * Shopee-specific validation rules
   */
  private validateShopeeSpecificRules(row: Record<string, any>): EnhancedValidationResult[] {
    const results: EnhancedValidationResult[] = []
    
    // Thai Baht currency validation
    const currencyFields = ['ราคา(฿)', 'มูลค่าซื้อ(฿)', 'คอมมิชชั่นคำสั่งซื้อโดยรวม(฿)']
    for (const field of currencyFields) {
      const value = row[field]
      if (value && typeof value === 'string' && !value.includes('฿') && !value.match(/^\d+(\.\d{1,2})?$/)) {
        results.push({
          isValid: false,
          error: `${field} should be in Thai Baht format`,
          suggestion: 'Use format like "123.45" or "฿123.45"',
          severity: 'warning',
          category: 'platform_compliance',
          priority: 'low'
        })
      }
    }
    
    return results
  }

  /**
   * Lazada-specific validation rules
   */
  private validateLazadaSpecificRules(row: Record<string, any>): EnhancedValidationResult[] {
    const results: EnhancedValidationResult[] = []
    
    // Product URL validation
    const productUrl = row['Product URL']
    if (productUrl && !productUrl.includes('lazada.')) {
      results.push({
        isValid: false,
        error: 'Product URL should be from Lazada domain',
        suggestion: 'Verify the product URL is from lazada.com or regional Lazada domain',
        severity: 'warning',
        category: 'platform_compliance',
        priority: 'low'
      })
    }
    
    return results
  }

  /**
   * TikTok-specific validation rules
   */
  private validateTikTokSpecificRules(row: Record<string, any>): EnhancedValidationResult[] {
    const results: EnhancedValidationResult[] = []
    
    // Creator handle validation
    const creator = row['Creator']
    if (creator && !creator.startsWith('@')) {
      results.push({
        isValid: false,
        error: 'Creator handle should start with @',
        suggestion: 'TikTok creator handles should begin with @ symbol',
        severity: 'warning',
        category: 'platform_compliance',
        priority: 'low',
        autoFix: `@${creator.replace(/^@+/, '')}`
      })
    }
    
    return results
  }

  /**
   * Helper methods
   */
  private parseDate(value: any): Date | null {
    if (!value) return null
    
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date
  }

  private parseAmount(value: any): number {
    if (!value) return 0
    
    const cleaned = String(value).replace(/[฿$€£,\s]/g, '')
    const amount = parseFloat(cleaned)
    return isNaN(amount) ? 0 : amount
  }
}

/**
 * Enhanced business rule validation with cross-field support
 */
export function validateBusinessRulesEnhanced(
  row: Record<string, any>,
  rowNumber: number,
  context: ValidationContext
): EnhancedValidationResult[] {
  const platform = context.platform.toLowerCase()
  const allRules = getAllBusinessRules(platform)
  
  const validator = new CrossFieldValidator(allRules, context)
  return validator.validateRow(row, rowNumber)
}

/**
 * Get all business rules for a platform
 */
function getAllBusinessRules(platform: string): EnhancedBusinessRule[] {
  const rules: EnhancedBusinessRule[] = []
  
  // Add commission rules
  if (CommissionRateRules[platform]) {
    rules.push(...CommissionRateRules[platform])
  }
  
  return rules
}

/**
 * Get business rule categories for reporting
 */
export function getBusinessRuleCategoryNames(): Record<string, string> {
  return {
    data_integrity: 'Data Integrity',
    business_logic: 'Business Logic',
    platform_compliance: 'Platform Compliance',
    data_quality: 'Data Quality'
  }
}