/**
 * Worker Service Management Models
 * 
 * Defines worker instance management, health monitoring, and job distribution
 * for reliable CSV processing and task execution.
 */

import { prisma } from '../index.js';

// Worker status enumeration
export enum WorkerStatus {
  IDLE = 'idle',
  PROCESSING = 'processing',
  ERROR = 'error',
  OFFLINE = 'offline',
  STARTING = 'starting',
  STOPPING = 'stopping'
}

// Job priority levels
export enum JobPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Worker instance model
export interface WorkerInstance {
  id: string;
  instanceId: string;
  hostname: string;
  pid: number;
  status: WorkerStatus;
  startedAt: Date;
  lastHeartbeat: Date;
  lastJob?: string;
  currentJobs: number;
  maxConcurrency: number;
  totalProcessed: number;
  totalErrors: number;
  metadata: Record<string, any>;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

// Performance metrics for worker
export interface WorkerPerformanceMetrics {
  instanceId: string;
  averageProcessingTime: number;
  successRate: number;
  throughput: number;
  memoryUsage: number;
  cpuUsage: number;
  errorRate: number;
  lastUpdated: Date;
}

// Job assignment model
export interface JobAssignment {
  id: string;
  jobId: string;
  workerId: string;
  assignedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: 'assigned' | 'processing' | 'completed' | 'failed';
  priority: JobPriority;
  retryCount: number;
  estimatedDuration?: number;
  actualDuration?: number;
}

// Worker health check result
export interface WorkerHealthStatus {
  instanceId: string;
  status: WorkerStatus;
  isHealthy: boolean;
  lastHeartbeat: Date;
  responseTime: number;
  activeJobs: number;
  queueLength: number;
  performance: WorkerPerformanceMetrics;
  errors: string[];
  warnings: string[];
}

// Worker service class for managing worker instances
export class WorkerService {
  private static readonly HEARTBEAT_TIMEOUT = 60000; // 1 minute
  private static readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

  /**
   * Register a new worker instance
   */
  static async registerWorker(worker: Omit<WorkerInstance, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkerInstance> {
    try {
      // Check if worker already exists
      const existingWorker = await prisma.$queryRaw<any[]>`
        SELECT * FROM worker_instances 
        WHERE instance_id = ${worker.instanceId} 
        OR (hostname = ${worker.hostname} AND pid = ${worker.pid})
      `;

      if (existingWorker.length > 0) {
        // Update existing worker
        const updated = await prisma.$queryRaw<any[]>`
          UPDATE worker_instances 
          SET 
            status = ${worker.status},
            last_heartbeat = ${worker.lastHeartbeat},
            max_concurrency = ${worker.maxConcurrency},
            metadata = ${JSON.stringify(worker.metadata)},
            version = ${worker.version},
            updated_at = NOW()
          WHERE instance_id = ${worker.instanceId}
          RETURNING *
        `;
        return this.mapToWorkerInstance(updated[0]);
      }

      // Create new worker
      const newWorker = await prisma.$queryRaw<any[]>`
        INSERT INTO worker_instances (
          instance_id, hostname, pid, status, started_at, last_heartbeat,
          current_jobs, max_concurrency, total_processed, total_errors,
          metadata, version, created_at, updated_at
        ) VALUES (
          ${worker.instanceId}, ${worker.hostname}, ${worker.pid}, ${worker.status},
          ${worker.startedAt}, ${worker.lastHeartbeat}, ${worker.currentJobs},
          ${worker.maxConcurrency}, ${worker.totalProcessed}, ${worker.totalErrors},
          ${JSON.stringify(worker.metadata)}, ${worker.version}, NOW(), NOW()
        ) RETURNING *
      `;

      return this.mapToWorkerInstance(newWorker[0]);
    } catch (error) {
      throw new Error(`Failed to register worker: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update worker heartbeat
   */
  static async updateHeartbeat(instanceId: string, metrics?: Partial<WorkerPerformanceMetrics>): Promise<void> {
    try {
      await prisma.$queryRaw`
        UPDATE worker_instances 
        SET 
          last_heartbeat = NOW(),
          status = CASE 
            WHEN status = 'offline' THEN 'idle'
            ELSE status
          END,
          updated_at = NOW()
        WHERE instance_id = ${instanceId}
      `;

      // Update performance metrics if provided
      if (metrics) {
        await this.updatePerformanceMetrics(instanceId, metrics);
      }
    } catch (error) {
      throw new Error(`Failed to update heartbeat: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all active workers
   */
  static async getActiveWorkers(): Promise<WorkerInstance[]> {
    try {
      const workers = await prisma.$queryRaw<any[]>`
        SELECT * FROM worker_instances 
        WHERE last_heartbeat > NOW() - INTERVAL '2 minutes'
        AND status != 'offline'
        ORDER BY last_heartbeat DESC
      `;

      return workers.map(this.mapToWorkerInstance);
    } catch (error) {
      throw new Error(`Failed to get active workers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get worker health status
   */
  static async getWorkerHealth(instanceId?: string): Promise<WorkerHealthStatus[]> {
    try {
      const whereClause = instanceId ? `WHERE w.instance_id = '${instanceId}'` : '';
      
      const results = await prisma.$queryRaw<any[]>`
        SELECT 
          w.*,
          COALESCE(pm.average_processing_time, 0) as avg_processing_time,
          COALESCE(pm.success_rate, 100) as success_rate,
          COALESCE(pm.throughput, 0) as throughput,
          COALESCE(pm.memory_usage, 0) as memory_usage,
          COALESCE(pm.cpu_usage, 0) as cpu_usage,
          COALESCE(pm.error_rate, 0) as error_rate,
          COALESCE(ja.active_jobs, 0) as active_jobs,
          COALESCE(ja.queue_length, 0) as queue_length
        FROM worker_instances w
        LEFT JOIN worker_performance_metrics pm ON w.instance_id = pm.instance_id
        LEFT JOIN (
          SELECT 
            worker_id,
            COUNT(CASE WHEN status = 'processing' THEN 1 END) as active_jobs,
            COUNT(CASE WHEN status = 'assigned' THEN 1 END) as queue_length
          FROM job_assignments 
          WHERE status IN ('assigned', 'processing')
          GROUP BY worker_id
        ) ja ON w.instance_id = ja.worker_id
        ${whereClause}
        ORDER BY w.last_heartbeat DESC
      `;

      return results.map(row => this.mapToHealthStatus(row));
    } catch (error) {
      throw new Error(`Failed to get worker health: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Assign job to optimal worker
   */
  static async assignJob(jobId: string, priority: JobPriority = JobPriority.NORMAL): Promise<JobAssignment | null> {
    try {
      // Find the best available worker
      const availableWorkers = await prisma.$queryRaw<any[]>`
        SELECT 
          w.*,
          COALESCE(ja.current_jobs, 0) as current_load
        FROM worker_instances w
        LEFT JOIN (
          SELECT 
            worker_id,
            COUNT(*) as current_jobs
          FROM job_assignments 
          WHERE status IN ('assigned', 'processing')
          GROUP BY worker_id
        ) ja ON w.instance_id = ja.worker_id
        WHERE w.status IN ('idle', 'processing')
        AND w.last_heartbeat > NOW() - INTERVAL '2 minutes'
        AND COALESCE(ja.current_jobs, 0) < w.max_concurrency
        ORDER BY 
          CASE 
            WHEN w.status = 'idle' THEN 0 
            ELSE 1 
          END,
          COALESCE(ja.current_jobs, 0) ASC,
          w.total_errors ASC
        LIMIT 1
      `;

      if (availableWorkers.length === 0) {
        return null; // No available workers
      }

      const worker = availableWorkers[0];

      // Create job assignment
      const assignment = await prisma.$queryRaw<any[]>`
        INSERT INTO job_assignments (
          job_id, worker_id, assigned_at, status, priority, retry_count
        ) VALUES (
          ${jobId}, ${worker.instance_id}, NOW(), 'assigned', ${priority}, 0
        ) RETURNING *
      `;

      return this.mapToJobAssignment(assignment[0]);
    } catch (error) {
      throw new Error(`Failed to assign job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update job status
   */
  static async updateJobStatus(
    assignmentId: string, 
    status: JobAssignment['status'],
    error?: string
  ): Promise<void> {
    try {
      const updateFields = ['status = $1', 'updated_at = NOW()'];
      const values = [status];

      if (status === 'processing') {
        updateFields.push('started_at = NOW()');
      } else if (status === 'completed' || status === 'failed') {
        updateFields.push('completed_at = NOW()');
      }

      await prisma.$queryRaw`
        UPDATE job_assignments 
        SET ${updateFields.join(', ')}
        WHERE id = ${assignmentId}
      `;

      // Update worker statistics
      if (status === 'completed') {
        await prisma.$queryRaw`
          UPDATE worker_instances 
          SET 
            total_processed = total_processed + 1,
            updated_at = NOW()
          WHERE instance_id = (
            SELECT worker_id FROM job_assignments WHERE id = ${assignmentId}
          )
        `;
      } else if (status === 'failed') {
        await prisma.$queryRaw`
          UPDATE worker_instances 
          SET 
            total_errors = total_errors + 1,
            updated_at = NOW()
          WHERE instance_id = (
            SELECT worker_id FROM job_assignments WHERE id = ${assignmentId}
          )
        `;
      }
    } catch (error) {
      throw new Error(`Failed to update job status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up offline workers
   */
  static async cleanupOfflineWorkers(): Promise<number> {
    try {
      const result = await prisma.$queryRaw<any[]>`
        UPDATE worker_instances 
        SET 
          status = 'offline',
          updated_at = NOW()
        WHERE last_heartbeat < NOW() - INTERVAL '5 minutes'
        AND status != 'offline'
        RETURNING instance_id
      `;

      // Reassign jobs from offline workers
      if (result.length > 0) {
        const offlineWorkerIds = result.map(r => r.instance_id);
        await prisma.$queryRaw`
          UPDATE job_assignments 
          SET status = 'assigned', worker_id = NULL
          WHERE worker_id = ANY(${offlineWorkerIds})
          AND status IN ('assigned', 'processing')
        `;
      }

      return result.length;
    } catch (error) {
      throw new Error(`Failed to cleanup offline workers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update performance metrics
   */
  private static async updatePerformanceMetrics(
    instanceId: string, 
    metrics: Partial<WorkerPerformanceMetrics>
  ): Promise<void> {
    try {
      await prisma.$queryRaw`
        INSERT INTO worker_performance_metrics (
          instance_id, average_processing_time, success_rate, throughput,
          memory_usage, cpu_usage, error_rate, last_updated
        ) VALUES (
          ${instanceId}, 
          ${metrics.averageProcessingTime || 0},
          ${metrics.successRate || 100},
          ${metrics.throughput || 0},
          ${metrics.memoryUsage || 0},
          ${metrics.cpuUsage || 0},
          ${metrics.errorRate || 0},
          NOW()
        ) ON CONFLICT (instance_id) DO UPDATE SET
          average_processing_time = EXCLUDED.average_processing_time,
          success_rate = EXCLUDED.success_rate,
          throughput = EXCLUDED.throughput,
          memory_usage = EXCLUDED.memory_usage,
          cpu_usage = EXCLUDED.cpu_usage,
          error_rate = EXCLUDED.error_rate,
          last_updated = NOW()
      `;
    } catch (error) {
      console.error('Failed to update performance metrics:', error);
    }
  }

  // Mapping helpers
  private static mapToWorkerInstance(row: any): WorkerInstance {
    return {
      id: row.id,
      instanceId: row.instance_id,
      hostname: row.hostname,
      pid: row.pid,
      status: row.status as WorkerStatus,
      startedAt: row.started_at,
      lastHeartbeat: row.last_heartbeat,
      lastJob: row.last_job,
      currentJobs: row.current_jobs,
      maxConcurrency: row.max_concurrency,
      totalProcessed: row.total_processed,
      totalErrors: row.total_errors,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private static mapToJobAssignment(row: any): JobAssignment {
    return {
      id: row.id,
      jobId: row.job_id,
      workerId: row.worker_id,
      assignedAt: row.assigned_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      status: row.status,
      priority: row.priority as JobPriority,
      retryCount: row.retry_count,
      estimatedDuration: row.estimated_duration,
      actualDuration: row.actual_duration,
    };
  }

  private static mapToHealthStatus(row: any): WorkerHealthStatus {
    const now = new Date();
    const lastHeartbeat = new Date(row.last_heartbeat);
    const isHealthy = (now.getTime() - lastHeartbeat.getTime()) < this.HEARTBEAT_TIMEOUT;

    return {
      instanceId: row.instance_id,
      status: row.status as WorkerStatus,
      isHealthy,
      lastHeartbeat,
      responseTime: now.getTime() - lastHeartbeat.getTime(),
      activeJobs: row.active_jobs || 0,
      queueLength: row.queue_length || 0,
      performance: {
        instanceId: row.instance_id,
        averageProcessingTime: row.avg_processing_time || 0,
        successRate: row.success_rate || 100,
        throughput: row.throughput || 0,
        memoryUsage: row.memory_usage || 0,
        cpuUsage: row.cpu_usage || 0,
        errorRate: row.error_rate || 0,
        lastUpdated: row.last_updated || now,
      },
      errors: [],
      warnings: isHealthy ? [] : ['Worker heartbeat timeout'],
    };
  }
}