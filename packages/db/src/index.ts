export { PrismaClient } from '@prisma/client'
export * from '@prisma/client'

// Export import job status constants
export * from './constants/import-job-status.js'
export * from './constants/import-error-types.js'

// Export services
export * from './services/import-error-service.js'
export * from './services/config-service.js'
export * from './services/security-service.js'
export * from './services/metrics-service.js'
export * from './services/error-tracker.js'
export * from './services/logger.js'
export * from './services/audit-logger.js'
export * from './services/query-optimizer.js'

// Export configurations
export * from './config/alert-thresholds.js'

// Export models with specific exports to avoid conflicts
export { 
  WorkerService,
  WorkerStatus,
  JobPriority,
  type WorkerInstance,
  type WorkerPerformanceMetrics,
  type JobAssignment,
  type WorkerHealthStatus
} from './models/worker-instance.js'
export { 
  ImportJobService,
  ImportJobStatus as EnhancedImportJobStatus,
  type EnhancedImportJob,
  type ErrorSummary as JobErrorSummary,
  type JobRetryResult,
  type RetryStrategy
} from './models/import-job.js'

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma