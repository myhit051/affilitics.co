export { PrismaClient } from '@prisma/client'
export * from '@prisma/client'

// Export import job status constants
export * from './constants/import-job-status.js'
export * from './constants/import-error-types.js'

// Export services
export * from './services/import-error-service.js'

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