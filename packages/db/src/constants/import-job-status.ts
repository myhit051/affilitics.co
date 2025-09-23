/**
 * Import Job Status Constants and Validation
 * 
 * This module defines secure status constants for import jobs and provides
 * validation functions to ensure proper status transitions and prevent
 * status manipulation.
 */

export const IMPORT_JOB_STATUS = {
  // Initial state - file uploaded, ready for validation
  QUEUED: 'queued',
  
  // Worker states
  PROCESSING: 'processing',
  
  // Final states
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  
  // Extended states for future use
  VALIDATING: 'validating',
  VALIDATION_FAILED: 'validation_failed'
} as const

export type ImportJobStatus = typeof IMPORT_JOB_STATUS[keyof typeof IMPORT_JOB_STATUS]

/**
 * Valid status transitions for security
 * Each status can only transition to specific allowed statuses
 */
export const VALID_STATUS_TRANSITIONS: Record<ImportJobStatus, ImportJobStatus[]> = {
  [IMPORT_JOB_STATUS.QUEUED]: [
    IMPORT_JOB_STATUS.PROCESSING,
    IMPORT_JOB_STATUS.VALIDATING,
    IMPORT_JOB_STATUS.CANCELLED,
    IMPORT_JOB_STATUS.FAILED
  ],
  [IMPORT_JOB_STATUS.VALIDATING]: [
    IMPORT_JOB_STATUS.QUEUED,
    IMPORT_JOB_STATUS.VALIDATION_FAILED,
    IMPORT_JOB_STATUS.CANCELLED,
    IMPORT_JOB_STATUS.FAILED
  ],
  [IMPORT_JOB_STATUS.VALIDATION_FAILED]: [
    IMPORT_JOB_STATUS.CANCELLED,
    IMPORT_JOB_STATUS.FAILED
  ],
  [IMPORT_JOB_STATUS.PROCESSING]: [
    IMPORT_JOB_STATUS.COMPLETED,
    IMPORT_JOB_STATUS.FAILED,
    IMPORT_JOB_STATUS.CANCELLED
  ],
  [IMPORT_JOB_STATUS.COMPLETED]: [],
  [IMPORT_JOB_STATUS.FAILED]: [],
  [IMPORT_JOB_STATUS.CANCELLED]: []
}

/**
 * Statuses considered "active" (still being processed)
 */
export const ACTIVE_STATUSES: readonly ImportJobStatus[] = [
  IMPORT_JOB_STATUS.QUEUED,
  IMPORT_JOB_STATUS.VALIDATING,
  IMPORT_JOB_STATUS.PROCESSING
] as const

/**
 * Statuses considered "terminal" (no further processing)
 */
export const TERMINAL_STATUSES: readonly ImportJobStatus[] = [
  IMPORT_JOB_STATUS.COMPLETED,
  IMPORT_JOB_STATUS.FAILED,
  IMPORT_JOB_STATUS.CANCELLED
] as const

/**
 * Statuses that can be picked up by worker
 */
export const WORKER_PROCESSABLE_STATUSES: readonly ImportJobStatus[] = [
  IMPORT_JOB_STATUS.QUEUED
] as const

/**
 * Validates if a status value is a valid ImportJobStatus
 */
export function isValidStatus(status: string): status is ImportJobStatus {
  return Object.values(IMPORT_JOB_STATUS).includes(status as ImportJobStatus)
}

/**
 * Validates if a status transition is allowed
 * @param currentStatus - Current job status
 * @param newStatus - Desired new status
 * @returns true if transition is valid, false otherwise
 */
export function isValidStatusTransition(
  currentStatus: ImportJobStatus,
  newStatus: ImportJobStatus
): boolean {
  if (!isValidStatus(currentStatus) || !isValidStatus(newStatus)) {
    return false
  }
  
  return VALID_STATUS_TRANSITIONS[currentStatus].includes(newStatus)
}

/**
 * Validates status transition and throws error if invalid
 * @param currentStatus - Current job status
 * @param newStatus - Desired new status
 * @param jobId - Job ID for error context
 * @throws Error if transition is not valid
 */
export function validateStatusTransition(
  currentStatus: ImportJobStatus,
  newStatus: ImportJobStatus,
  jobId?: string
): void {
  if (!isValidStatusTransition(currentStatus, newStatus)) {
    const context = jobId ? ` for job ${jobId}` : ''
    throw new Error(
      `Invalid status transition${context}: ${currentStatus} -> ${newStatus}. ` +
      `Valid transitions from ${currentStatus}: ${VALID_STATUS_TRANSITIONS[currentStatus].join(', ')}`
    )
  }
}

/**
 * Checks if a status is active (still being processed)
 */
export function isActiveStatus(status: ImportJobStatus): boolean {
  return ACTIVE_STATUSES.includes(status)
}

/**
 * Checks if a status is terminal (no further processing)
 */
export function isTerminalStatus(status: ImportJobStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/**
 * Checks if a status can be processed by worker
 */
export function isWorkerProcessableStatus(status: ImportJobStatus): boolean {
  return WORKER_PROCESSABLE_STATUSES.includes(status)
}

/**
 * Gets the initial status for new import jobs
 */
export function getInitialStatus(): ImportJobStatus {
  return IMPORT_JOB_STATUS.QUEUED
}

/**
 * Status display names for UI
 */
export const STATUS_DISPLAY_NAMES: Record<ImportJobStatus, string> = {
  [IMPORT_JOB_STATUS.QUEUED]: 'Queued',
  [IMPORT_JOB_STATUS.VALIDATING]: 'Validating',
  [IMPORT_JOB_STATUS.VALIDATION_FAILED]: 'Validation Failed',
  [IMPORT_JOB_STATUS.PROCESSING]: 'Processing',
  [IMPORT_JOB_STATUS.COMPLETED]: 'Completed',
  [IMPORT_JOB_STATUS.FAILED]: 'Failed',
  [IMPORT_JOB_STATUS.CANCELLED]: 'Cancelled'
}

/**
 * Status colors for UI
 */
export const STATUS_COLORS: Record<ImportJobStatus, string> = {
  [IMPORT_JOB_STATUS.QUEUED]: 'blue',
  [IMPORT_JOB_STATUS.VALIDATING]: 'yellow',
  [IMPORT_JOB_STATUS.VALIDATION_FAILED]: 'orange',
  [IMPORT_JOB_STATUS.PROCESSING]: 'blue',
  [IMPORT_JOB_STATUS.COMPLETED]: 'green',
  [IMPORT_JOB_STATUS.FAILED]: 'red',
  [IMPORT_JOB_STATUS.CANCELLED]: 'gray'
}