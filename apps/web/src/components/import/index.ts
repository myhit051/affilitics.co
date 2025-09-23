/**
 * Import components index
 * Centralized exports for all import-related components
 */

export { FileUpload } from './file-upload'
export { ImportHistory } from './import-history' 
export { ErrorReporting } from './error-reporting'
export { DataPreview } from './data-preview'
export { ImportDashboard } from './import-dashboard'

// Re-export types for convenience
// Note: Some types may need to be exported from their respective components
// export type { 
//   UploadResult,
//   ValidationResult 
// } from './file-upload'

// export type {
//   ImportHistoryProps
// } from './import-history'

// export type {
//   ErrorReportingProps
// } from './error-reporting'

// export type {
//   DataPreviewProps
// } from './data-preview'

// export type {
//   ImportDashboardProps
// } from './import-dashboard'

// Utility exports
export { useImportStatus, useImportBatch, useImportNotifications } from '@/lib/hooks/use-import-status'
export { 
  getPlatformConfig,
  getSupportedPlatforms,
  isValidPlatform,
  getPlatformDisplayName,
  generateSampleCSV
} from '@/lib/import/platform-configs'
export {
  parseCSVWithValidation,
  transformToStandardFormat,
  generateValidationReport
} from '@/lib/import/csv-parser'
export {
  validateFile,
  validateCSVContent,
  sanitizeFilename,
  sanitizeCSVContent
} from '@/lib/import/security'