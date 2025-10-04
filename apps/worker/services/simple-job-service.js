import { IMPORT_JOB_STATUS } from '@aff/db'

/**
 * Simple Job Service for worker
 * จัดการ job operations ที่จำเป็นสำหรับ worker
 */
export class SimpleJobService {
  constructor(dbPool) {
    this.dbPool = dbPool
  }

  /**
   * Get next queued job
   * @returns {Object|null} Next job or null
   */
  async getNextQueuedJob() {
    const query = `
      UPDATE import_jobs
      SET status = $1, started_at = now()
      WHERE id = (
        SELECT id FROM import_jobs
        WHERE status = $2
        ORDER BY created_at ASC
        LIMIT 1
      )
      RETURNING *
    `
    
    const result = await this.dbPool.query(query, [
      IMPORT_JOB_STATUS.PROCESSING,
      IMPORT_JOB_STATUS.QUEUED
    ])
    
    return result.rows[0] || null
  }

  /**
   * Update job status
   * @param {string} jobId - Job ID
   * @param {string} status - New status
   * @param {Object} updates - Additional updates
   */
  async updateJobStatus(jobId, status, updates = {}) {
    const fields = ['status = $2']
    const values = [jobId, status]
    let paramCount = 2

    // Add dynamic updates
    Object.entries(updates).forEach(([key, value]) => {
      paramCount++
      fields.push(`${key} = $${paramCount}`)
      values.push(value)
    })

    const query = `
      UPDATE import_jobs 
      SET ${fields.join(', ')}
      WHERE id = $1
    `

    await this.dbPool.query(query, values)
  }
}

/**
 * Simple Metrics Service for worker
 */
export class SimpleMetricsService {
  constructor(dbPool) {
    this.dbPool = dbPool
  }

  /**
   * Record job metrics
   * @param {string} jobId - Job ID
   * @param {Object} metrics - Metrics data
   */
  async recordJobMetrics(jobId, metrics) {
    // Simple implementation - could extend later
    console.log(`Recording metrics for job ${jobId}:`, metrics)
    
    // You could insert into a metrics table here if needed
    // For now, just log the metrics
  }
}

/**
 * Simple Security Service for worker
 */
export class SimpleSecurityService {
  constructor(dbPool) {
    this.dbPool = dbPool
  }

  /**
   * Validate file access
   * @param {string} filePath - File path
   * @param {string} workspaceId - Workspace ID
   */
  async validateFileAccess(filePath, workspaceId) {
    // Simple validation - check if workspace exists
    const query = 'SELECT id FROM workspaces WHERE id = $1'
    const result = await this.dbPool.query(query, [workspaceId])
    
    if (result.rows.length === 0) {
      throw new Error(`Invalid workspace: ${workspaceId}`)
    }
    
    // Additional security checks could go here
    return true
  }
}