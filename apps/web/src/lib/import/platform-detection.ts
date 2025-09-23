/**
 * Platform Auto-Detection for CSV Files
 * Intelligently detects e-commerce platform based on CSV structure and content
 */

import Papa from 'papaparse'
// import { CSV_VALIDATION_CONFIG, getEffectiveConfig } from '@aff/db'
// Mock for build purposes
const getEffectiveConfig = () => ({
  csvValidation: {
    PLATFORM_DETECTION_SAMPLE_SIZE: 50,
    PLATFORM_DETECTION_CONFIDENCE_THRESHOLD: 0.8
  }
})
import { getPlatformConfig, getSupportedPlatforms } from './platform-configs'
import type { PlatformCSVConfig } from './csv-validator'

export interface PlatformDetectionResult {
  detectedPlatform: string | null
  confidence: number
  matches: Array<{
    platform: string
    score: number
    confidence: number
    matchedHeaders: string[]
    missingHeaders: string[]
    reasons: DetectionReason[]
  }>
  analysis: DetectionAnalysis
  suggestions: string[]
}

export interface DetectionReason {
  type: 'header_match' | 'content_pattern' | 'format_pattern' | 'business_rule' | 'language_pattern'
  weight: number
  description: string
  evidence: any
}

export interface DetectionAnalysis {
  totalHeaders: number
  uniqueHeaders: number
  sampleRows: number
  detectedLanguage: string | null
  detectedCurrency: string | null
  contentPatterns: string[]
  structureScore: number
  dataQualityScore: number
}

export interface PlatformSignature {
  platform: string
  headerPatterns: Array<{
    pattern: string | RegExp
    weight: number
    required?: boolean
  }>
  contentPatterns: Array<{
    field: string
    pattern: RegExp
    weight: number
    description: string
  }>
  businessRules: Array<{
    validator: (data: any[], headers: string[]) => boolean
    weight: number
    description: string
  }>
  languageIndicators: Array<{
    pattern: RegExp
    weight: number
    language: string
  }>
  currencyIndicators: Array<{
    pattern: RegExp
    weight: number
    currency: string
  }>
}

/**
 * Platform signatures for detection
 */
const PLATFORM_SIGNATURES: Record<string, PlatformSignature> = {
  shopee: {
    platform: 'shopee',
    headerPatterns: [
      { pattern: /รหัสการสั่งซื้อ/i, weight: 10, required: true },
      { pattern: /ชื่อรายการสินค้า/i, weight: 8, required: true },
      { pattern: /คอมมิชชั่นคำสั่งซื้อโดยรวม/i, weight: 9, required: true },
      { pattern: /สถานะการสั่งซื้อ/i, weight: 7, required: true },
      { pattern: /เวลาที่สั่งซื้อ/i, weight: 7, required: true },
      { pattern: /Sub_id/i, weight: 5 },
      { pattern: /ช่องทาง/i, weight: 4 },
      { pattern: /ราคา\(฿\)/i, weight: 6 },
      { pattern: /มูลค่าซื้อ\(฿\)/i, weight: 6 },
      { pattern: /อัตราคอมมิชชั่น.*ช้อปปี้/i, weight: 8 },
      { pattern: /ค่าคอมมิชชั่น.*ช้อปปี้/i, weight: 8 }
    ],
    contentPatterns: [
      {
        field: 'รหัสการสั่งซื้อ',
        pattern: /^[A-Za-z0-9]{8,}$/,
        weight: 5,
        description: 'Shopee order ID format'
      },
      {
        field: 'สถานะการสั่งซื้อ',
        pattern: /^(รอดำเนินการ|สำเร็จ|ยกเลิก|คืนเงิน|รอตรวจสอบ)$/,
        weight: 7,
        description: 'Thai order status values'
      }
    ],
    businessRules: [
      {
        validator: (data, headers) => {
          const commissionField = headers.find(h => h.includes('คอมมิชชั่นคำสั่งซื้อโดยรวม'))
          return !!commissionField && data.some(row => {
            const value = parseFloat(String(row[commissionField!]).replace(/[฿,\s]/g, ''))
            return value > 0 && value < 10000
          })
        },
        weight: 6,
        description: 'Commission amounts in reasonable range with Thai Baht'
      }
    ],
    languageIndicators: [
      { pattern: /[ก-๙]/g, weight: 10, language: 'thai' },
      { pattern: /(รหัส|ชื่อ|สถานะ|เวลา|ราคา|มูลค่า|อัตรา|คอมมิชชั่น)/g, weight: 8, language: 'thai' }
    ],
    currencyIndicators: [
      { pattern: /฿/g, weight: 10, currency: 'THB' },
      { pattern: /\(฿\)/g, weight: 8, currency: 'THB' }
    ]
  },

  lazada: {
    platform: 'lazada',
    headerPatterns: [
      { pattern: /Transaction ID/i, weight: 10, required: true },
      { pattern: /Product Title/i, weight: 8, required: true },
      { pattern: /Commission Rate \(%\)/i, weight: 9, required: true },
      { pattern: /Commission \(Local Currency\)/i, weight: 9, required: true },
      { pattern: /Transaction Status/i, weight: 7, required: true },
      { pattern: /Transaction Time/i, weight: 7, required: true },
      { pattern: /Product ID/i, weight: 6 },
      { pattern: /Product URL/i, weight: 5 },
      { pattern: /Seller Name/i, weight: 5 },
      { pattern: /Buyer ID/i, weight: 4 },
      { pattern: /Product Quantity/i, weight: 5 },
      { pattern: /Order Value/i, weight: 6 },
      { pattern: /Click Timestamp/i, weight: 4 }
    ],
    contentPatterns: [
      {
        field: 'Transaction ID',
        pattern: /^[A-Z]{2}[0-9]{8,}$/,
        weight: 6,
        description: 'Lazada transaction ID format'
      },
      {
        field: 'Transaction Status',
        pattern: /^(Confirmed|Pending|Cancelled|Invalid|Paid)$/i,
        weight: 7,
        description: 'English transaction status values'
      },
      {
        field: 'Product URL',
        pattern: /lazada\.com|lazada\./i,
        weight: 8,
        description: 'Lazada domain in URLs'
      }
    ],
    businessRules: [
      {
        validator: (data, headers) => {
          const rateField = headers.find(h => h.includes('Commission Rate'))
          return !!rateField && data.some(row => {
            const value = parseFloat(String(row[rateField!]))
            return value > 0 && value <= 50 // Reasonable commission rate percentage
          })
        },
        weight: 6,
        description: 'Commission rates as percentages'
      }
    ],
    languageIndicators: [
      { pattern: /(Transaction|Product|Commission|Status|Time|Currency|Seller|Buyer)/g, weight: 7, language: 'english' }
    ],
    currencyIndicators: [
      { pattern: /\$|USD/g, weight: 6, currency: 'USD' },
      { pattern: /€|EUR/g, weight: 6, currency: 'EUR' },
      { pattern: /£|GBP/g, weight: 6, currency: 'GBP' }
    ]
  },

  tiktok: {
    platform: 'tiktok',
    headerPatterns: [
      { pattern: /Order No\./i, weight: 10, required: true },
      { pattern: /Product Name/i, weight: 8, required: true },
      { pattern: /Commission Rate/i, weight: 9, required: true },
      { pattern: /Estimated Commission/i, weight: 9, required: true },
      { pattern: /Order Status/i, weight: 7, required: true },
      { pattern: /Order Create Time/i, weight: 7, required: true },
      { pattern: /Video ID/i, weight: 8 },
      { pattern: /Creator/i, weight: 7 },
      { pattern: /Shop Name/i, weight: 5 },
      { pattern: /Final Commission/i, weight: 6 },
      { pattern: /Settlement Date/i, weight: 5 },
      { pattern: /Video Publish Time/i, weight: 6 },
      { pattern: /Region/i, weight: 4 }
    ],
    contentPatterns: [
      {
        field: 'Order No.',
        pattern: /^[A-Z]*[0-9]{10,}$/,
        weight: 6,
        description: 'TikTok order number format'
      },
      {
        field: 'Order Status',
        pattern: /^(Completed|Pending Settlement|Cancelled|Invalid|Under Review)$/i,
        weight: 7,
        description: 'TikTok order status values'
      },
      {
        field: 'Video ID',
        pattern: /^[A-Za-z0-9_-]{8,}$/,
        weight: 7,
        description: 'TikTok video ID format'
      },
      {
        field: 'Creator',
        pattern: /^@/,
        weight: 8,
        description: 'TikTok creator handle format'
      }
    ],
    businessRules: [
      {
        validator: (data, headers) => {
          const videoField = headers.find(h => h.includes('Video ID'))
          return !!videoField && data.some(row => {
            const value = String(row[videoField!] || '').trim()
            return value.length > 0 && /^[A-Za-z0-9_-]+$/.test(value)
          })
        },
        weight: 7,
        description: 'Valid video IDs present'
      },
      {
        validator: (data, headers) => {
          const creatorField = headers.find(h => h.includes('Creator'))
          return !!creatorField && data.some(row => {
            const value = String(row[creatorField!] || '').trim()
            return value.startsWith('@')
          })
        },
        weight: 6,
        description: 'Creator handles with @ symbol'
      }
    ],
    languageIndicators: [
      { pattern: /(Order|Product|Commission|Status|Video|Creator|Shop|Settlement)/g, weight: 7, language: 'english' }
    ],
    currencyIndicators: [
      { pattern: /\$|USD/g, weight: 6, currency: 'USD' },
      { pattern: /%/g, weight: 5, currency: 'percentage' }
    ]
  }
}

/**
 * Platform Detection Engine
 */
export class PlatformDetector {
  private config: ReturnType<typeof getEffectiveConfig>
  private signatures: Record<string, PlatformSignature>

  constructor() {
    this.config = getEffectiveConfig()
    this.signatures = PLATFORM_SIGNATURES
  }

  /**
   * Detect platform from CSV content
   */
  async detectPlatform(
    csvContent: string | Buffer,
    options: {
      sampleSize?: number
      strictMode?: boolean
      includeAnalysis?: boolean
    } = {}
  ): Promise<PlatformDetectionResult> {
    const {
      sampleSize = this.config.csvValidation.PLATFORM_DETECTION_SAMPLE_SIZE,
      strictMode = false,
      includeAnalysis = true
    } = options

    try {
      // Parse CSV content
      const content = Buffer.isBuffer(csvContent) ? csvContent.toString('utf-8') : csvContent
      const sampleContent = this.getSampleContent(content, sampleSize)
      
      const parseResult = Papa.parse(sampleContent as any, {
        header: true,
        preview: sampleSize,
        skipEmptyLines: true
      })

      if (parseResult.errors.length > 0 && strictMode) {
        throw new Error(`CSV parsing failed: ${parseResult.errors[0].message}`)
      }

      const headers = Object.keys(parseResult.data[0] || {})
      const data = parseResult.data as Record<string, any>[]

      // Analyze each platform
      const matches = await Promise.all(
        getSupportedPlatforms().map(platform => 
          this.analyzePlatform(platform, headers, data)
        )
      )

      // Sort by confidence score
      matches.sort((a, b) => b.confidence - a.confidence)

      const bestMatch = matches[0]
      const threshold = this.config.csvValidation.PLATFORM_DETECTION_CONFIDENCE_THRESHOLD

      const analysis = includeAnalysis ? this.analyzeContent(headers, data) : {} as DetectionAnalysis

      return {
        detectedPlatform: bestMatch.confidence >= threshold ? bestMatch.platform : null,
        confidence: bestMatch.confidence,
        matches,
        analysis,
        suggestions: this.generateSuggestions(matches, analysis)
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      return {
        detectedPlatform: null,
        confidence: 0,
        matches: [],
        analysis: {} as DetectionAnalysis,
        suggestions: [`Detection failed: ${errorMessage}`]
      }
    }
  }

  /**
   * Analyze a specific platform against the data
   */
  private async analyzePlatform(
    platform: string,
    headers: string[],
    data: Record<string, any>[]
  ): Promise<PlatformDetectionResult['matches'][0]> {
    const signature = this.signatures[platform]
    if (!signature) {
      return {
        platform,
        score: 0,
        confidence: 0,
        matchedHeaders: [],
        missingHeaders: [],
        reasons: []
      }
    }

    const reasons: DetectionReason[] = []
    let totalScore = 0
    let maxPossibleScore = 0
    const matchedHeaders: string[] = []
    const missingHeaders: string[] = []

    // Analyze headers
    for (const headerPattern of signature.headerPatterns) {
      maxPossibleScore += headerPattern.weight
      
      const matchingHeader = headers.find(h => {
        if (headerPattern.pattern instanceof RegExp) {
          return headerPattern.pattern.test(h)
        } else {
          return h.toLowerCase().includes(headerPattern.pattern.toLowerCase())
        }
      })

      if (matchingHeader) {
        totalScore += headerPattern.weight
        matchedHeaders.push(matchingHeader)
        reasons.push({
          type: 'header_match',
          weight: headerPattern.weight,
          description: `Matched header: ${matchingHeader}`,
          evidence: { header: matchingHeader, pattern: headerPattern.pattern }
        })
      } else if (headerPattern.required) {
        missingHeaders.push(headerPattern.pattern.toString())
      }
    }

    // Analyze content patterns
    for (const contentPattern of signature.contentPatterns) {
      const fieldData = data.map(row => row[contentPattern.field]).filter(Boolean)
      if (fieldData.length > 0) {
        const matchCount = fieldData.filter(value => 
          contentPattern.pattern.test(String(value))
        ).length
        
        const matchRatio = matchCount / fieldData.length
        if (matchRatio > 0.5) { // More than 50% match
          const score = contentPattern.weight * matchRatio
          totalScore += score
          maxPossibleScore += contentPattern.weight
          
          reasons.push({
            type: 'content_pattern',
            weight: score,
            description: contentPattern.description,
            evidence: { 
              field: contentPattern.field, 
              matchCount, 
              totalCount: fieldData.length,
              matchRatio 
            }
          })
        }
      }
    }

    // Analyze business rules
    for (const rule of signature.businessRules) {
      try {
        if (rule.validator(data, headers)) {
          totalScore += rule.weight
          reasons.push({
            type: 'business_rule',
            weight: rule.weight,
            description: rule.description,
            evidence: { validated: true }
          })
        }
        maxPossibleScore += rule.weight
      } catch (error) {
        // Ignore business rule errors
      }
    }

    // Analyze language indicators
    const contentText = JSON.stringify(data).toLowerCase()
    for (const indicator of signature.languageIndicators) {
      const matches = contentText.match(indicator.pattern) || []
      if (matches.length > 0) {
        const score = Math.min(indicator.weight, matches.length * 0.5)
        totalScore += score
        reasons.push({
          type: 'language_pattern',
          weight: score,
          description: `Detected ${indicator.language} language patterns`,
          evidence: { language: indicator.language, matchCount: matches.length }
        })
      }
      maxPossibleScore += indicator.weight
    }

    // Analyze currency indicators
    for (const indicator of signature.currencyIndicators) {
      const matches = contentText.match(indicator.pattern) || []
      if (matches.length > 0) {
        const score = Math.min(indicator.weight, matches.length * 0.1)
        totalScore += score
        reasons.push({
          type: 'format_pattern',
          weight: score,
          description: `Detected ${indicator.currency} currency format`,
          evidence: { currency: indicator.currency, matchCount: matches.length }
        })
      }
      maxPossibleScore += indicator.weight
    }

    const confidence = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) : 0

    return {
      platform,
      score: totalScore,
      confidence,
      matchedHeaders,
      missingHeaders,
      reasons
    }
  }

  /**
   * Analyze content structure and quality
   */
  private analyzeContent(headers: string[], data: Record<string, any>[]): DetectionAnalysis {
    // Detect language
    const contentText = JSON.stringify(data)
    let detectedLanguage: string | null = null
    
    if (/[ก-๙]/.test(contentText)) {
      detectedLanguage = 'thai'
    } else if (/[a-zA-Z]/.test(contentText)) {
      detectedLanguage = 'english'
    }

    // Detect currency
    let detectedCurrency: string | null = null
    if (/฿/.test(contentText)) {
      detectedCurrency = 'THB'
    } else if (/\$/.test(contentText)) {
      detectedCurrency = 'USD'
    } else if (/€/.test(contentText)) {
      detectedCurrency = 'EUR'
    }

    // Analyze content patterns
    const contentPatterns: string[] = []
    if (/\d{4}-\d{2}-\d{2}/.test(contentText)) {
      contentPatterns.push('iso_dates')
    }
    if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(contentText)) {
      contentPatterns.push('us_dates')
    }
    if (/\d+\.\d{2}/.test(contentText)) {
      contentPatterns.push('decimal_currency')
    }
    if (/@\w+/.test(contentText)) {
      contentPatterns.push('social_handles')
    }

    // Calculate structure score
    const structureScore = this.calculateStructureScore(headers, data)
    
    // Calculate data quality score
    const dataQualityScore = this.calculateDataQualityScore(data)

    return {
      totalHeaders: headers.length,
      uniqueHeaders: new Set(headers).size,
      sampleRows: data.length,
      detectedLanguage,
      detectedCurrency,
      contentPatterns,
      structureScore,
      dataQualityScore
    }
  }

  /**
   * Calculate structure quality score
   */
  private calculateStructureScore(headers: string[], data: Record<string, any>[]): number {
    let score = 0
    const maxScore = 100

    // Header count score (5-20 headers is optimal)
    if (headers.length >= 5 && headers.length <= 20) {
      score += 20
    } else if (headers.length >= 3 && headers.length <= 25) {
      score += 10
    }

    // Header uniqueness
    if (new Set(headers).size === headers.length) {
      score += 20
    }

    // Header naming consistency
    const hasConsistentNaming = headers.every(h => h.trim().length > 0) &&
                               (headers.every(h => /^[A-Z]/.test(h)) || headers.every(h => /^[a-z]/.test(h)))
    if (hasConsistentNaming) {
      score += 15
    }

    // Data completeness
    if (data.length > 0) {
      const completenessRatio = data.reduce((sum, row) => {
        const nonEmptyFields = Object.values(row).filter(v => v !== null && v !== undefined && String(v).trim() !== '').length
        return sum + (nonEmptyFields / headers.length)
      }, 0) / data.length

      score += completenessRatio * 25
    }

    // Data consistency
    if (data.length > 1) {
      const consistencyScore = headers.reduce((sum, header) => {
        const values = data.map(row => row[header]).filter(v => v !== null && v !== undefined)
        const uniqueTypes = new Set(values.map(v => typeof v)).size
        return sum + (uniqueTypes === 1 ? 1 : 0)
      }, 0) / headers.length

      score += consistencyScore * 20
    }

    return Math.min(score, maxScore)
  }

  /**
   * Calculate data quality score
   */
  private calculateDataQualityScore(data: Record<string, any>[]): number {
    if (data.length === 0) return 0

    let score = 0
    const maxScore = 100

    // Row count score
    if (data.length >= 10) {
      score += 20
    } else if (data.length >= 5) {
      score += 10
    }

    // Duplicate detection
    const uniqueRows = new Set(data.map(row => JSON.stringify(row))).size
    const duplicateRatio = (data.length - uniqueRows) / data.length
    score += (1 - duplicateRatio) * 25

    // Missing data ratio
    const totalFields = data.length * Object.keys(data[0] || {}).length
    const filledFields = data.reduce((sum, row) => {
      return sum + Object.values(row).filter(v => v !== null && v !== undefined && String(v).trim() !== '').length
    }, 0)
    
    const completenessRatio = totalFields > 0 ? filledFields / totalFields : 0
    score += completenessRatio * 30

    // Data type consistency
    const headers = Object.keys(data[0] || {})
    const typeConsistency = headers.reduce((sum, header) => {
      const values = data.map(row => row[header]).filter(v => v !== null && v !== undefined)
      if (values.length === 0) return sum

      const types = new Set(values.map(v => typeof v))
      return sum + (types.size === 1 ? 1 : 0)
    }, 0) / Math.max(headers.length, 1)

    score += typeConsistency * 25

    return Math.min(score, maxScore)
  }

  /**
   * Generate suggestions based on detection results
   */
  private generateSuggestions(
    matches: PlatformDetectionResult['matches'],
    analysis: DetectionAnalysis
  ): string[] {
    const suggestions: string[] = []
    
    const bestMatch = matches[0]
    const threshold = this.config.csvValidation.PLATFORM_DETECTION_CONFIDENCE_THRESHOLD

    if (bestMatch.confidence < threshold) {
      suggestions.push(`Platform detection confidence is low (${(bestMatch.confidence * 100).toFixed(1)}%). Manual verification recommended.`)
      
      if (bestMatch.missingHeaders.length > 0) {
        suggestions.push(`Missing key headers for ${bestMatch.platform}: ${bestMatch.missingHeaders.join(', ')}`)
      }
    }

    if (analysis.structureScore < 50) {
      suggestions.push('CSV structure quality is low. Check for missing headers or inconsistent data.')
    }

    if (analysis.dataQualityScore < 50) {
      suggestions.push('Data quality is low. Check for missing values or inconsistent data types.')
    }

    if (matches.length > 1 && matches[1].confidence > 0.5) {
      suggestions.push(`File could potentially be from ${matches[1].platform} as well. Consider checking both formats.`)
    }

    if (analysis.detectedLanguage === 'thai' && !matches.some(m => m.platform === 'shopee' && m.confidence > 0.5)) {
      suggestions.push('Thai language detected but Shopee confidence is low. Verify header names match Shopee format.')
    }

    return suggestions
  }

  /**
   * Get sample content for analysis
   */
  private getSampleContent(content: string, sampleSize: number): string {
    const lines = content.split('\n')
    if (lines.length <= sampleSize + 1) {
      return content
    }

    // Always include header + sample rows
    return [lines[0], ...lines.slice(1, sampleSize + 1)].join('\n')
  }

  /**
   * Add custom platform signature
   */
  addPlatformSignature(signature: PlatformSignature): void {
    this.signatures[signature.platform] = signature
  }

  /**
   * Update existing platform signature
   */
  updatePlatformSignature(platform: string, updates: Partial<PlatformSignature>): void {
    if (this.signatures[platform]) {
      this.signatures[platform] = { ...this.signatures[platform], ...updates }
    }
  }

  /**
   * Get all available platform signatures
   */
  getPlatformSignatures(): Record<string, PlatformSignature> {
    return { ...this.signatures }
  }

  /**
   * Validate platform signature
   */
  validateSignature(signature: PlatformSignature): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!signature.platform || typeof signature.platform !== 'string') {
      errors.push('Platform name is required and must be a string')
    }

    if (!Array.isArray(signature.headerPatterns) || signature.headerPatterns.length === 0) {
      errors.push('At least one header pattern is required')
    }

    signature.headerPatterns?.forEach((pattern, index) => {
      if (typeof pattern.weight !== 'number' || pattern.weight <= 0) {
        errors.push(`Header pattern ${index}: weight must be a positive number`)
      }
    })

    return {
      isValid: errors.length === 0,
      errors
    }
  }
}

/**
 * Factory function to create platform detector
 */
export function createPlatformDetector(): PlatformDetector {
  return new PlatformDetector()
}

/**
 * Quick platform detection function
 */
export async function detectPlatform(
  csvContent: string,
  options?: {
    sampleSize?: number
    strictMode?: boolean
  }
): Promise<PlatformDetectionResult> {
  const detector = createPlatformDetector()
  return detector.detectPlatform(csvContent, options)
}

/**
 * Utility functions for platform detection
 */
export const PlatformDetectionUtils = {
  /**
   * Get confidence threshold for platform detection
   */
  getConfidenceThreshold(): number {
    return getEffectiveConfig().csvValidation.PLATFORM_DETECTION_CONFIDENCE_THRESHOLD
  },

  /**
   * Check if detection result is reliable
   */
  isDetectionReliable(result: PlatformDetectionResult): boolean {
    return result.confidence >= this.getConfidenceThreshold() && 
           result.analysis.structureScore > 50 &&
           result.analysis.dataQualityScore > 40
  },

  /**
   * Get best platform suggestion
   */
  getBestSuggestion(result: PlatformDetectionResult): string | null {
    if (this.isDetectionReliable(result)) {
      return result.detectedPlatform
    }

    // Return best match even if below threshold
    return result.matches.length > 0 ? result.matches[0].platform : null
  },

  /**
   * Format detection summary for display
   */
  formatDetectionSummary(result: PlatformDetectionResult): {
    primaryPlatform: string | null
    confidence: string
    summary: string
    recommendations: string[]
  } {
    const primaryPlatform = result.detectedPlatform
    const confidence = `${(result.confidence * 100).toFixed(1)}%`
    
    let summary = ''
    if (primaryPlatform) {
      summary = `Detected as ${primaryPlatform} with ${confidence} confidence`
    } else {
      summary = `Could not reliably detect platform (highest confidence: ${confidence} for ${result.matches[0]?.platform || 'unknown'})`
    }

    const recommendations = []
    if (result.confidence < 0.8) {
      recommendations.push('Consider manual verification due to low confidence')
    }
    if (result.suggestions.length > 0) {
      recommendations.push(...result.suggestions.slice(0, 3)) // Top 3 suggestions
    }

    return {
      primaryPlatform,
      confidence,
      summary,
      recommendations
    }
  }
}

export default PlatformDetector