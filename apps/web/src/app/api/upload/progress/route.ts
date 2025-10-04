import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@aff/db'

/**
 * File Upload Progress Tracking API (Backend Only)
 *
 * Track and report file upload progress for CSV files
 * เพื่อให้ user มองเห็นความคืบหน้าของการ upload ไฟล์
 *
 * Features:
 * - Real-time progress tracking
 * - Upload speed calculation
 * - Estimated time remaining
 * - Support for multiple concurrent uploads
 * - Workspace isolation
 */

// In-memory store for upload progress
// ใช้ Map เพื่อ track progress ของแต่ละ upload session
const uploadProgressStore = new Map<string, {
  uploadId: string
  workspaceId: string
  filename: string
  fileSize: number
  uploadedBytes: number
  startTime: number
  lastUpdateTime: number
  uploadSpeed: number // bytes per second
  estimatedTimeRemaining: number // milliseconds
  status: 'uploading' | 'processing' | 'completed' | 'error'
  error?: string
}>()

// Cleanup old entries (older than 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - 3600000
  for (const [uploadId, progress] of uploadProgressStore.entries()) {
    if (progress.lastUpdateTime < oneHourAgo) {
      uploadProgressStore.delete(uploadId)
    }
  }
}, 300000) // Run cleanup every 5 minutes

/**
 * GET /api/upload/progress?uploadId={uploadId}
 * Get upload progress for a specific upload
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const uploadId = searchParams.get('uploadId')
    const workspaceId = request.headers.get('x-workspace-id')

    // Validate required parameters
    if (!uploadId) {
      return NextResponse.json(
        { error: 'uploadId is required' },
        { status: 400 }
      )
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'x-workspace-id header is required' },
        { status: 400 }
      )
    }

    // Get progress from store
    const progress = uploadProgressStore.get(uploadId)

    if (!progress) {
      // Check if upload is completed in database
      const job = await prisma.importJob.findFirst({
        where: {
          id: uploadId,
          workspaceId: workspaceId
        },
        select: {
          id: true,
          status: true,
          filename: true,
          size: true,
          createdAt: true,
          finishedAt: true
        }
      })

      if (job) {
        // Job exists in database
        return NextResponse.json({
          uploadId,
          status: job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'error' : 'processing',
          filename: job.filename,
          fileSize: job.size,
          uploadedBytes: job.size,
          progress: 100,
          uploadSpeed: 0,
          estimatedTimeRemaining: 0,
          completedAt: job.finishedAt?.toISOString()
        })
      }

      // Upload not found
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      )
    }

    // Validate workspace access
    if (progress.workspaceId !== workspaceId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Calculate progress percentage
    const progressPercentage = progress.fileSize > 0
      ? Math.round((progress.uploadedBytes / progress.fileSize) * 100)
      : 0

    // Return progress data
    return NextResponse.json({
      uploadId: progress.uploadId,
      workspaceId: progress.workspaceId,
      filename: progress.filename,
      fileSize: progress.fileSize,
      uploadedBytes: progress.uploadedBytes,
      progress: progressPercentage,
      uploadSpeed: Math.round(progress.uploadSpeed),
      uploadSpeedMBps: (progress.uploadSpeed / 1024 / 1024).toFixed(2),
      estimatedTimeRemaining: Math.round(progress.estimatedTimeRemaining),
      estimatedTimeRemainingSeconds: Math.round(progress.estimatedTimeRemaining / 1000),
      status: progress.status,
      error: progress.error,
      elapsedTime: Date.now() - progress.startTime
    })

  } catch (error) {
    console.error('Error getting upload progress:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/upload/progress
 * Update upload progress
 */
export async function POST(request: NextRequest) {
  try {
    const workspaceId = request.headers.get('x-workspace-id')

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'x-workspace-id header is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      uploadId,
      filename,
      fileSize,
      uploadedBytes,
      status,
      error
    } = body

    // Validate required fields
    if (!uploadId) {
      return NextResponse.json(
        { error: 'uploadId is required' },
        { status: 400 }
      )
    }

    const now = Date.now()

    // Get existing progress or create new
    let progress = uploadProgressStore.get(uploadId)

    if (!progress) {
      // Create new progress entry
      progress = {
        uploadId,
        workspaceId,
        filename: filename || 'unknown',
        fileSize: fileSize || 0,
        uploadedBytes: uploadedBytes || 0,
        startTime: now,
        lastUpdateTime: now,
        uploadSpeed: 0,
        estimatedTimeRemaining: 0,
        status: status || 'uploading'
      }
      uploadProgressStore.set(uploadId, progress)
    } else {
      // Validate workspace access
      if (progress.workspaceId !== workspaceId) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }

      // Calculate upload speed
      const timeDiff = now - progress.lastUpdateTime
      if (timeDiff > 0 && uploadedBytes !== undefined) {
        const bytesDiff = uploadedBytes - progress.uploadedBytes
        const currentSpeed = (bytesDiff / timeDiff) * 1000 // bytes per second

        // Use exponential moving average for smoother speed calculation
        progress.uploadSpeed = progress.uploadSpeed === 0
          ? currentSpeed
          : progress.uploadSpeed * 0.7 + currentSpeed * 0.3
      }

      // Calculate estimated time remaining
      if (progress.uploadSpeed > 0 && fileSize && uploadedBytes !== undefined) {
        const remainingBytes = fileSize - uploadedBytes
        progress.estimatedTimeRemaining = (remainingBytes / progress.uploadSpeed) * 1000
      }

      // Update progress
      if (filename !== undefined) progress.filename = filename
      if (fileSize !== undefined) progress.fileSize = fileSize
      if (uploadedBytes !== undefined) progress.uploadedBytes = uploadedBytes
      if (status !== undefined) progress.status = status
      if (error !== undefined) progress.error = error
      progress.lastUpdateTime = now
    }

    // If upload is completed or failed, remove from store after 5 minutes
    if (status === 'completed' || status === 'error') {
      setTimeout(() => {
        uploadProgressStore.delete(uploadId)
      }, 300000) // 5 minutes
    }

    // Calculate progress percentage
    const progressPercentage = progress.fileSize > 0
      ? Math.round((progress.uploadedBytes / progress.fileSize) * 100)
      : 0

    return NextResponse.json({
      success: true,
      uploadId: progress.uploadId,
      progress: progressPercentage,
      uploadSpeed: Math.round(progress.uploadSpeed),
      uploadSpeedMBps: (progress.uploadSpeed / 1024 / 1024).toFixed(2),
      estimatedTimeRemaining: Math.round(progress.estimatedTimeRemaining),
      estimatedTimeRemainingSeconds: Math.round(progress.estimatedTimeRemaining / 1000),
      status: progress.status
    })

  } catch (error) {
    console.error('Error updating upload progress:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/upload/progress?uploadId={uploadId}
 * Cancel an upload
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const uploadId = searchParams.get('uploadId')
    const workspaceId = request.headers.get('x-workspace-id')

    if (!uploadId) {
      return NextResponse.json(
        { error: 'uploadId is required' },
        { status: 400 }
      )
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'x-workspace-id header is required' },
        { status: 400 }
      )
    }

    const progress = uploadProgressStore.get(uploadId)

    if (!progress) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      )
    }

    // Validate workspace access
    if (progress.workspaceId !== workspaceId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Mark as cancelled
    progress.status = 'error'
    progress.error = 'Upload cancelled by user'
    progress.lastUpdateTime = Date.now()

    // Remove from store after 1 minute
    setTimeout(() => {
      uploadProgressStore.delete(uploadId)
    }, 60000)

    return NextResponse.json({
      success: true,
      message: 'Upload cancelled',
      uploadId
    })

  } catch (error) {
    console.error('Error cancelling upload:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
