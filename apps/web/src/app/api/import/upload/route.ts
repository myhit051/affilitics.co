import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth'
import { prisma, getInitialStatus, IMPORT_JOB_STATUS } from '@aff/db'
import crypto from 'crypto'
import { isValidPlatform, getPlatformFileSizeLimit } from '@/lib/import/platform-configs'
import { verifyCSRFEnhanced, CSRFError, logCSRFEvent } from '@/lib/security/csrf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB absolute max
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel'
]

export async function POST(req: NextRequest) {
  try {
    // Security: Verify origin
    const origin = req.headers.get('origin') || ''
    const appOrigin = process.env.APP_ORIGIN
    if (appOrigin && origin && !origin.startsWith(appOrigin)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403 })
    }

    // Security: Get authenticated user context
    const { user, workspaceId } = await getAuthContext()

    // Security: CSRF Protection - Now properly configured and enabled
    try {
      await verifyCSRFEnhanced(req, user.id, {
        enableOriginValidation: true,
        enableRateLimit: true,
        enableDoubleSubmit: false // Can be enabled for additional security
      })
    } catch (error) {
      if (error instanceof CSRFError) {
        logCSRFEvent('UPLOAD_CSRF_FAILED', {
          userId: user.id,
          workspaceId,
          error: error.message,
          statusCode: error.statusCode,
          origin: req.headers.get('origin'),
          userAgent: req.headers.get('user-agent')
        })
        return new Response(JSON.stringify({ 
          error: 'CSRF verification failed',
          details: error.message
        }), { status: error.statusCode })
      }
      throw error
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const platformInput = formData.get('platform')
    const validateOnlyInput = formData.get('validateOnly')

    // Security: Sanitize and validate inputs
    if (!file) {
      return new Response(JSON.stringify({ 
        error: 'No file provided',
        details: 'Please select a CSV file to upload'
      }), { status: 400 })
    }

    // Security: Validate platform input
    const platform = typeof platformInput === 'string' ? 
      platformInput.trim().toLowerCase().replace(/[^a-z]/g, '') : 'shopee'
    
    // Security: Validate boolean input
    const validateOnly = validateOnlyInput === 'true'

    if (!isValidPlatform(platform)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid platform',
        details: `Platform must be one of: shopee, lazada, tiktok`
      }), { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.csv')) {
      return new Response(JSON.stringify({ 
        error: 'Invalid file type',
        details: 'Only CSV files are allowed'
      }), { status: 400 })
    }

    // Validate file size
    const platformSizeLimit = getPlatformFileSizeLimit(platform) * 1024 * 1024
    const fileSizeLimit = Math.min(MAX_FILE_SIZE, platformSizeLimit)
    
    if (file.size > fileSizeLimit) {
      return new Response(JSON.stringify({ 
        error: 'File too large',
        details: `File size must not exceed ${Math.round(fileSizeLimit / 1024 / 1024)}MB for ${platform}`
      }), { status: 400 })
    }

    if (file.size === 0) {
      return new Response(JSON.stringify({ 
        error: 'Empty file',
        details: 'The uploaded file is empty'
      }), { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buff = Buffer.from(arrayBuffer)
    
    // Security: Additional file content validation
    const text = buff.toString('utf8', 0, Math.min(1000, buff.length)) // Check first 1KB
    
    // Security: Check for suspicious content patterns
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i,
      /__FILE__/,
      /__DIR__/,
      /\$\{/,
      /<%/
    ]
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(text)) {
        return new Response(JSON.stringify({ 
          error: 'Invalid file content',
          details: 'File contains potentially malicious content'
        }), { status: 400 })
      }
    }
    
    // Security: Basic CSV format validation
    const lines = text.split('\n').slice(0, 5) // Check first 5 lines
    if (lines.length < 2) {
      return new Response(JSON.stringify({ 
        error: 'Invalid CSV format',
        details: 'File must contain at least a header row and one data row'
      }), { status: 400 })
    }
    
    // Security: Check for reasonable CSV structure
    const headerCols = lines[0].split(',').length
    if (headerCols < 2 || headerCols > 50) {
      return new Response(JSON.stringify({ 
        error: 'Invalid CSV format',
        details: 'CSV must have between 2 and 50 columns'
      }), { status: 400 })
    }
    
    const hash = crypto.createHash('sha256').update(buff).digest('hex')

    // Check for duplicate files by hash
    const existingJob = await prisma.importJob.findFirst({
      where: {
        workspaceId,
        hash,
        status: { not: IMPORT_JOB_STATUS.FAILED }
      },
      select: { id: true, filename: true }
    })

    if (existingJob) {
      return new Response(JSON.stringify({ 
        error: 'Duplicate file',
        details: `This file has already been uploaded as "${existingJob.filename}"`,
        existingJobId: existingJob.id
      }), { status: 400 })
    }

    // If validation only, return early
    if (validateOnly) {
      return new Response(JSON.stringify({ 
        valid: true,
        fileSize: file.size,
        hash,
        message: 'File is valid and ready for upload'
      }), { status: 200 })
    }

    // Upload to Supabase Storage
    const timestamp = Date.now()
    
    // Security: Sanitize filename more thoroughly
    const originalName = file.name || 'unnamed.csv'
    const sanitizedFilename = originalName
      .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^[._]+|[._]+$/g, '') // Remove leading/trailing dots and underscores
      .slice(0, 100) // Limit length
    
    const finalFilename = sanitizedFilename || 'file.csv'
    const storagePath = `${workspaceId}/imports/${timestamp}_${finalFilename}`
    
    // Get storage bucket from environment
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'imports'
    
    // Upload file to Supabase storage
    const supabase = createServiceClient()
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, buff, {
        contentType: file.type || 'text/csv',
        upsert: false, // Don't overwrite existing files
        cacheControl: '3600' // Cache for 1 hour
      })

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError)
      
      // Provide more specific error messages based on the error type
      let errorDetails = 'Unable to store file in cloud storage'
      if (uploadError.message?.includes('Duplicate')) {
        errorDetails = 'A file with this name already exists'
      } else if (uploadError.message?.includes('size')) {
        errorDetails = 'File size exceeds storage limits'
      } else if (uploadError.message?.includes('permission')) {
        errorDetails = 'Insufficient permissions to upload file'
      }
      
      return new Response(JSON.stringify({ 
        error: 'File upload failed',
        details: errorDetails
      }), { status: 500 })
    }

    if (!uploadData?.path) {
      return new Response(JSON.stringify({ 
        error: 'File upload failed',
        details: 'Storage upload completed but no path returned'
      }), { status: 500 })
    }

    // Create import job record with proper status and cleanup on failure
    const createdBy = user.id // Use authenticated user ID
    let importJob
    
    try {
      importJob = await prisma.importJob.create({
        data: {
          workspaceId,
          platform,
          filename: finalFilename,
          size: buff.length,
          status: getInitialStatus(), // Use secure constant instead of hardcoded string
          createdBy,
          hash,
          // storagePath: uploadData.path // Store the actual Supabase storage path
        },
        select: { id: true, createdAt: true }
      })
    } catch (dbError) {
      console.error('Database error creating import job:', dbError)
      
      // Cleanup: Remove uploaded file if database operation fails
      try {
        await supabase.storage.from(bucketName).remove([uploadData.path])
        console.log('Cleaned up uploaded file after database error:', uploadData.path)
      } catch (cleanupError) {
        console.error('Failed to cleanup uploaded file:', cleanupError)
      }
      
      return new Response(JSON.stringify({ 
        error: 'Database error',
        details: 'Failed to create import job record'
      }), { status: 500 })
    }

    const jobId = importJob.id
    const createdAt = importJob.createdAt

    return new Response(JSON.stringify({ 
      success: true,
      jobId,
      platform,
      filename: file.name,
      size: file.size,
      hash,
      createdAt,
      storagePath: uploadData.path,
      message: 'File uploaded successfully. Ready for processing.'
    }), { 
      status: 201,
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    console.error('Upload error:', error)
    
    if (error instanceof Response) {
      return error // Re-throw auth errors
    }

    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: 'An unexpected error occurred during upload'
    }), { status: 500 })
  }
}
