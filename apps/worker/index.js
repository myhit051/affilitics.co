import { createClient } from '@supabase/supabase-js'
import { Pool } from 'pg'
import { parse } from 'csv-parse'
import { 
  IMPORT_JOB_STATUS, 
  isWorkerProcessableStatus, 
  validateStatusTransition 
} from '@aff/db'

// Supabase client for storage operations
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE

if (!supabaseUrl || !supabaseServiceRole) {
  console.error('Missing required Supabase environment variables')
  process.exit(1)
}

const supa = createClient(supabaseUrl, supabaseServiceRole, { 
  auth: { persistSession: false }
})
// Database connection with error handling
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('Missing DATABASE_URL environment variable')
  process.exit(1)
}

const pool = new Pool({ 
  connectionString: databaseUrl,
  max: 10, // Maximum number of clients
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
})

// Test database connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client', err.stack)
    process.exit(1)
  }
  console.log('Database connection established')
  release()
})
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'imports'

async function nextJob() {
  // Use secure status constants and add validation
  const q = `UPDATE import_jobs
             SET status=$1, started_at=now()
             WHERE id = (
               SELECT id FROM import_jobs
               WHERE status=$2
               ORDER BY created_at ASC
               LIMIT 1
             )
             RETURNING *`
  
  const r = await pool.query(q, [
    IMPORT_JOB_STATUS.PROCESSING,
    IMPORT_JOB_STATUS.QUEUED
  ])
  
  const job = r.rows[0]
  if (job) {
    // Validate the status transition for security
    try {
      validateStatusTransition(IMPORT_JOB_STATUS.QUEUED, IMPORT_JOB_STATUS.PROCESSING, job.id)
      console.log(`Job ${job.id} status transition: ${IMPORT_JOB_STATUS.QUEUED} -> ${IMPORT_JOB_STATUS.PROCESSING}`)
    } catch (error) {
      console.error(`Invalid status transition for job ${job.id}:`, error.message)
      return null
    }
  }
  
  return job
}

async function processShopee(job) {
  // Download file from Supabase storage using the correct path
  const filePath = job.storage_path || job.filename // Fallback for legacy jobs
  
  console.log(`Downloading file from storage path: ${filePath}`)
  const { data, error } = await supa.storage.from(BUCKET).download(filePath)
  
  if (error) {
    console.error(`Storage download error for job ${job.id}:`, error)
    throw new Error(`Failed to download file from storage: ${error.message}`)
  }
  
  if (!data) {
    throw new Error(`No file data received for path: ${filePath}`)
  }
  
  const text = await data.text()
  
  if (!text || text.trim().length === 0) {
    throw new Error(`Downloaded file is empty: ${filePath}`)
  }

  let count = 0
  const parser = parse(text, { columns: true, relax_column_count: true, trim: true })
  for await (const rec of parser) {
    // Map columns (ปรับตามไฟล์จริงของคุณ)
    const order_id = rec['Order ID'] || rec['order_id'] || rec['OrderId'] || null
    const subid = rec['SubID'] || rec['subid'] || rec['Tracking ID'] || null
    const order_time = rec['Order Time'] || rec['Created Time'] || rec['order_time'] || null
    const amount = rec['Amount'] || rec['Gross'] || rec['amount'] || null
    const net = rec['Net'] || rec['Earnings'] || rec['net'] || null
    const commission = rec['Commission'] || rec['Commission Fee'] || rec['commission'] || null
    const raw = rec

    await pool.query(
      `INSERT INTO stg_shopee_aff (workspace_id, source_job_id, order_id, subid, order_time, amount, net, commission, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [job.workspace_id, job.id, order_id, subid, order_time, amount, net, commission, raw]
    )
    count++
  }
  return count
}

async function loop() {
  let currentJob = null
  
  while (true) {
    try {
      currentJob = await nextJob()
      if (!currentJob) {
        await new Promise(r => setTimeout(r, 1500))
        continue
      }
      
      console.log('Processing job', currentJob.id, 'filename:', currentJob.filename, 'storage_path:', currentJob.storage_path)
      let inserted = 0
      
      if (currentJob.platform === 'shopee') {
        inserted = await processShopee(currentJob)
      } else {
        throw new Error('Unsupported platform: ' + currentJob.platform)
      }
      
      // Validate and update to completed status
      validateStatusTransition(IMPORT_JOB_STATUS.PROCESSING, IMPORT_JOB_STATUS.COMPLETED, currentJob.id)
      await pool.query(`UPDATE import_jobs SET status=$1, finished_at=now() WHERE id=$2`, [
        IMPORT_JOB_STATUS.COMPLETED, 
        currentJob.id
      ])
      
      console.log(`Job ${currentJob.id} completed successfully. Rows inserted: ${inserted}`)
      currentJob = null // Clear current job on success
      
    } catch (e) {
      console.error('Job failed', e)
      
      // Mark failed job (best effort) with secure status constant
      try {
        const jobId = currentJob?.id
        if (jobId) {
          // Only update if we have a valid current job
          if (currentJob?.status) {
            validateStatusTransition(currentJob.status, IMPORT_JOB_STATUS.FAILED, jobId)
          }
          
          await pool.query(
            `UPDATE import_jobs SET status=$1, error=$2, finished_at=now() WHERE id=$3`,
            [IMPORT_JOB_STATUS.FAILED, String(e?.message || e), jobId]
          )
          
          console.log(`Job ${jobId} marked as failed: ${e?.message || e}`)
        } else {
          console.error('Cannot mark job as failed: no job ID available')
        }
      } catch (failureError) {
        console.error('Failed to mark job as failed:', failureError.message)
      }
      
      currentJob = null // Clear current job on failure
      await new Promise(r => setTimeout(r, 2000))
    }
  }
}

loop().catch(err => { console.error(err); process.exit(1) })
