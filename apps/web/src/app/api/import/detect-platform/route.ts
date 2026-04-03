import { NextRequest } from 'next/server'
import { withWorkspaceValidation } from '@/lib/auth/workspace-middleware'
import { createServiceClient } from '@/lib/supabase/server'
import { detectPlatform, PlatformDetectionUtils } from '@/lib/import/platform-detection'
import { getValidationCache } from '@/lib/import/validation-cache'
import { getSupportedPlatforms } from '@/lib/import/platform-configs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withWorkspaceValidation(
  async (req: NextRequest, context) => {
    const { workspaceId } = context
    const body = await req.json()
    const { fileUrl, content, sampleSize = 50 } = body

    try {
      let csvContent: string

      if (content) {
        // Content provided directly
        csvContent = content
      } else if (fileUrl) {
        // Download from storage
        const supa = createServiceClient()
        const bucket = process.env.SUPABASE_STORAGE_BUCKET!
        
        const { data: fileData, error: downloadError } = await supa
          .storage.from(bucket)
          .download(fileUrl)

        if (downloadError || !fileData) {
          return new Response(JSON.stringify({
            error: 'File not accessible',
            details: 'Could not retrieve the file for platform detection'
          }), { status: 400 })
        }

        csvContent = await fileData.text()
      } else {
        return new Response(JSON.stringify({
          error: 'Missing required parameters',
          details: 'Either content or fileUrl must be provided'
        }), { status: 400 })
      }

      if (!csvContent || csvContent.trim().length === 0) {
        return new Response(JSON.stringify({
          error: 'Empty file content',
          details: 'The file appears to be empty'
        }), { status: 400 })
      }

      // Check cache first
      const cache = getValidationCache()
      const cacheKey = cache.generateCacheKey(
        csvContent,
        'platform_detection',
        { sampleSize } as any,
        { workspaceId }
      )

      let detectionResult = await cache.get(cacheKey)
      
      if (!detectionResult) {
        // Perform platform detection
        const detection = await detectPlatform(csvContent, {
          sampleSize,
          strictMode: false
        } as any)

        // Cache the result with a shorter TTL since this is just detection
        await cache.set(cacheKey, detection as any, {
          ttl: 10 * 60 * 1000, // 10 minutes
          tags: ['platform_detection'],
          metadata: { workspaceId }
        })

        detectionResult = detection as any
      }

      const detection = detectionResult as any

      // Format the response
      const summary = PlatformDetectionUtils.formatDetectionSummary(detection)
      
      const response = {
        success: true,
        detection: {
          platform: detection.detectedPlatform,
          confidence: detection.confidence,
          isReliable: PlatformDetectionUtils.isDetectionReliable(detection),
          summary: summary.summary,
          recommendations: summary.recommendations
        },
        matches: detection.matches.map((match: any) => ({
          platform: match.platform,
          score: match.score,
          confidence: match.confidence,
          matchedHeaders: match.matchedHeaders,
          missingHeaders: match.missingHeaders,
          reasons: match.reasons.map((reason: any) => ({
            type: reason.type,
            description: reason.description,
            weight: reason.weight,
            evidence: reason.evidence
          }))
        })),
        analysis: {
          totalHeaders: detection.analysis.totalHeaders,
          sampleRows: detection.analysis.sampleRows,
          detectedLanguage: detection.analysis.detectedLanguage,
          detectedCurrency: detection.analysis.detectedCurrency,
          structureScore: detection.analysis.structureScore,
          dataQualityScore: detection.analysis.dataQualityScore,
          contentPatterns: detection.analysis.contentPatterns
        },
        supportedPlatforms: getSupportedPlatforms(),
        threshold: PlatformDetectionUtils.getConfidenceThreshold(),
        cached: !!await cache.get(cacheKey),
        suggestions: detection.suggestions || []
      }

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })

    } catch (error) {
      console.error('Platform detection error:', error)
      
      if (error instanceof Response) {
        return error
      }

      return new Response(JSON.stringify({
        error: 'Platform detection failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      }), { status: 500 })
    }
  },
  {
    logAction: 'platform_detection_request',
    requirePermissions: ['import_files']
  }
)

export const GET = withWorkspaceValidation(
  async (_req: NextRequest, _context) => {
    try {
      // Return supported platforms and detection configuration
      const supportedPlatforms = getSupportedPlatforms()
      const threshold = PlatformDetectionUtils.getConfidenceThreshold()
      
      const response = {
        success: true,
        supportedPlatforms,
        threshold,
        info: {
          description: 'CSV platform auto-detection service',
          methods: ['POST'],
          sampleSizeDefault: 50,
          sampleSizeMax: 200,
          cacheTTL: '10 minutes',
          confidenceThreshold: threshold
        },
        examples: {
          shopee: {
            requiredHeaders: ['รหัสการสั่งซื้อ', 'ชื่อรายการสินค้า', 'คอมมิชชั่นคำสั่งซื้อโดยรวม(฿)', 'สถานะการสั่งซื้อ', 'เวลาที่สั่งซื้อ'],
            language: 'thai',
            currency: 'THB (฿)'
          },
          lazada: {
            requiredHeaders: ['Transaction ID', 'Product Title', 'Commission Rate (%)', 'Commission (Local Currency)', 'Transaction Status', 'Transaction Time'],
            language: 'english',
            currency: 'USD ($)'
          },
          tiktok: {
            requiredHeaders: ['Order No.', 'Product Name', 'Commission Rate', 'Estimated Commission', 'Order Status', 'Order Create Time'],
            language: 'english',
            currency: 'USD ($)'
          }
        }
      }

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })

    } catch (error) {
      console.error('Platform detection info error:', error)

      return new Response(JSON.stringify({
        error: 'Failed to get platform detection info',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      }), { status: 500 })
    }
  },
  {
    logAction: 'platform_detection_info',
    requirePermissions: ['read_data']
  }
)