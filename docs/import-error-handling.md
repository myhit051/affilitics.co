# Import Error Handling System

## Overview

This document describes the comprehensive error handling system implemented for data import operations. The system provides detailed error tracking, categorization, recovery mechanisms, and analytics to ensure robust and reliable data import processes.

## Architecture

### Core Components

1. **Error Type System** (`import-error-types.ts`)
   - Comprehensive error categorization
   - Severity levels and recovery strategies
   - UI configuration for consistent display

2. **Error Service** (`import-error-service.ts`)
   - Centralized error logging and management
   - Retry mechanisms and recovery workflows
   - Error analytics and reporting

3. **Database Schema** (`migrations/001_enhance_import_errors.sql`)
   - Enhanced `import_errors` table with full context
   - Automatic error counting and maintenance
   - Performance-optimized indexes

4. **API Endpoints**
   - `/api/import/errors` - Error retrieval and management
   - `/api/import/retry` - Retry mechanisms
   - `/api/import/analytics` - Error analytics and insights

5. **Frontend Components**
   - Enhanced error reporting with filtering and actions
   - Real-time error visualization
   - Recovery recommendations

## Error Classification

### Error Types

| Type | Description | Severity | Recovery Strategy |
|------|-------------|----------|------------------|
| `missing_required_field` | Required field is missing or empty | Critical | Fix Data |
| `invalid_data_type` | Data type doesn't match expected format | Critical | Fix Data |
| `invalid_format` | Data format is invalid but correctable | High | Fix Data |
| `out_of_range` | Value outside acceptable range | Medium | Manual Review |
| `duplicate_record` | Record already exists | Low | Skip Row |
| `business_rule_violation` | Violates business logic | High | Manual Review |
| `processing_error` | System processing error | Critical | Retry Automatic |
| `storage_error` | File storage system error | Critical | Retry Automatic |
| `network_error` | Network connectivity issue | High | Retry Automatic |
| `timeout_error` | Operation timed out | Medium | Retry Automatic |
| `file_corrupted` | File is corrupted or unreadable | Critical | Abort Import |
| `platform_api_error` | Platform API returned error | High | Retry Automatic |

### Severity Levels

- **Critical**: Blocks import completely, requires immediate attention
- **High**: Significant issue that may affect data integrity
- **Medium**: Important issue that should be addressed
- **Low**: Minor issue that can often be ignored
- **Info**: Informational message, no action required

### Categories

- **Data Quality**: Issues with data format, type, or content
- **Business Logic**: Violations of business rules or constraints
- **System**: Technical system errors
- **File**: File-related issues (corruption, format, size)
- **Platform**: External platform or API issues
- **Unknown**: Unclassified errors

## Error Recovery

### Recovery Strategies

1. **Automatic Retry**
   - System automatically retries the operation
   - Uses exponential backoff with jitter
   - Configurable retry limits

2. **Manual Retry**
   - Requires user intervention to retry
   - Provides detailed error context
   - Allows strategy selection

3. **Skip Row**
   - Skips problematic rows and continues
   - Logs skipped rows for review
   - Maintains processing statistics

4. **Fix Data**
   - Requires data correction before retry
   - Provides specific guidance
   - Blocks retry until resolved

5. **Manual Review**
   - Flags for human review
   - Provides detailed context
   - Supports resolution tracking

6. **Abort Import**
   - Stops the entire import process
   - Used for critical system errors
   - Requires manual intervention

### Retry Configuration

```typescript
// Default retry settings
const RETRY_CONFIG = {
  DEFAULT_MAX_RETRIES: 3,
  MIN_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 300000,
  RETRY_BACKOFF_MULTIPLIER: 2.0,
  RETRY_JITTER_MS: 1000,
}
```

## API Reference

### Error Retrieval

```http
GET /api/import/errors?jobId={jobId}&page={page}&limit={limit}
```

**Query Parameters:**
- `jobId` (required): Import job ID
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 500)
- `errorType`: Filter by error type
- `severity`: Filter by severity level
- `category`: Filter by error category
- `resolved`: Filter by resolution status
- `search`: Text search in error messages
- `sortBy`: Sort field (row_no, created_at, severity, error_type)
- `sortOrder`: Sort order (asc, desc)

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "job-uuid",
    "filename": "data.csv",
    "platform": "shopee"
  },
  "errors": [{
    "id": "error-uuid",
    "row": 15,
    "field": "amount",
    "type": "invalid_data_type",
    "message": "Expected numeric value",
    "value": "invalid",
    "severity": "critical",
    "category": "data_quality",
    "recoveryStrategy": "fix_data",
    "retryCount": 0,
    "maxRetries": 3,
    "resolved": false,
    "dismissed": false,
    "createdAt": "2024-01-01T00:00:00Z"
  }],
  "summary": {
    "total": 25,
    "critical": 5,
    "high": 10,
    "medium": 8,
    "low": 2,
    "info": 0,
    "retryable": 8,
    "blocking": 5
  },
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 25,
    "totalPages": 1
  }
}
```

### Error Actions

```http
POST /api/import/errors
```

**Request Body:**
```json
{
  "jobId": "job-uuid",
  "action": "dismiss|resolve|retry|export|clear_all|bulk_update",
  "errorIds": ["error-1", "error-2"],
  "options": {
    "resolution": "Fixed manually",
    "confirmed": true
  }
}
```

### Retry Operations

```http
POST /api/import/retry
```

**Request Body:**
```json
{
  "jobId": "job-uuid",
  "retryStrategy": "auto|manual|force",
  "skipErrors": false,
  "maxRetries": 3,
  "delayMs": 1000
}
```

### Error Analytics

```http
GET /api/import/analytics?days={days}&platform={platform}
```

**Query Parameters:**
- `days`: Analysis period in days (default: 30, max: 365)
- `platform`: Filter by platform
- `groupBy`: Grouping period (day, week, month)
- `includeResolved`: Include resolved errors

## Frontend Integration

### Error Reporting Component

```typescript
import { ErrorReporting } from '@/components/import/error-reporting'

function ImportPage() {
  return (
    <ErrorReporting
      jobId="job-uuid"
      jobFilename="data.csv"
      onClose={() => setShowErrors(false)}
    />
  )
}
```

### Key Features

1. **Real-time Error Display**
   - Live updates during processing
   - Comprehensive error information
   - Interactive filtering and sorting

2. **Bulk Actions**
   - Select multiple errors for batch operations
   - Dismiss, resolve, or export errors
   - Confirmation for destructive actions

3. **Recovery Recommendations**
   - AI-powered recommendations
   - Effort estimation
   - Action priorities

4. **Error Details**
   - Expandable error context
   - Stack traces (development mode)
   - Additional debugging information

## Database Schema

### Enhanced import_errors Table

```sql
CREATE TABLE import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_no int NOT NULL,
  field text,
  message text NOT NULL,
  sample text,
  error_type text NOT NULL,
  severity text NOT NULL,
  category text NOT NULL,
  recovery_strategy text NOT NULL,
  retry_count int NOT NULL DEFAULT 0,
  max_retries int NOT NULL DEFAULT 0,
  last_retry_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  dismissed boolean NOT NULL DEFAULT false,
  dismissed_at timestamptz,
  stack_trace text,
  additional_context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Key Indexes

```sql
-- Performance indexes
CREATE INDEX idx_import_errors_job_type ON import_errors(job_id, error_type);
CREATE INDEX idx_import_errors_severity ON import_errors(severity) WHERE NOT dismissed;
CREATE INDEX idx_import_errors_retryable ON import_errors(job_id, retry_count, max_retries) 
  WHERE retry_count < max_retries AND NOT dismissed;
```

### Maintenance Functions

```sql
-- Automatic error count maintenance
CREATE OR REPLACE FUNCTION update_job_error_count() RETURNS TRIGGER;

-- Error recovery recommendations
CREATE OR REPLACE FUNCTION get_error_recovery_recommendations(p_job_id uuid);

-- Cleanup old errors
CREATE OR REPLACE FUNCTION cleanup_old_import_errors(days_to_keep int DEFAULT 90);
```

## Configuration

### Environment Variables

```bash
# Processing Configuration
IMPORT_BATCH_SIZE=100
IMPORT_MAX_FILE_SIZE=52428800  # 50MB
IMPORT_MAX_ROWS=100000
IMPORT_PROCESSING_TIMEOUT_MS=300000  # 5 minutes

# Error Configuration
IMPORT_MAX_ERRORS_PER_JOB=1000
IMPORT_ERROR_RETENTION_DAYS=90
IMPORT_AUTO_DISMISS_AFTER_DAYS=30

# Retry Configuration
IMPORT_DEFAULT_MAX_RETRIES=3
IMPORT_MAX_RETRIES_LIMIT=10
IMPORT_MIN_RETRY_DELAY_MS=1000
IMPORT_MAX_RETRY_DELAY_MS=300000
IMPORT_RETRY_BACKOFF_MULTIPLIER=2.0

# Analytics Configuration
IMPORT_DEFAULT_ANALYTICS_DAYS=30
IMPORT_ANALYTICS_CACHE_TTL_SECONDS=300

# Security Configuration
IMPORT_SANITIZE_ERROR_MESSAGES=true
IMPORT_INCLUDE_STACK_TRACES=false  # production
IMPORT_ENABLE_ERROR_AUDIT_LOG=true

# Feature Flags
IMPORT_ENABLE_ADVANCED_ANALYTICS=false
IMPORT_ENABLE_AUTO_RETRY=true
IMPORT_ENABLE_ERROR_PREDICTIONS=false
IMPORT_ENABLE_REAL_TIME_UPDATES=false
```

### Configuration Validation

The system automatically validates configuration on startup:

```typescript
import { validateImportConfig, getConfigSummary } from '@aff/db/src/constants/import-config'

// Validate configuration
const validation = validateImportConfig()
if (!validation.isValid) {
  console.error('Configuration errors:', validation.errors)
}

// Get configuration summary
const summary = getConfigSummary()
console.log('Import configuration:', summary)
```

## Monitoring and Analytics

### Key Metrics

1. **Error Rates**
   - Errors per job
   - Error rate trends
   - Error type distribution

2. **Recovery Performance**
   - Retry success rates
   - Resolution times
   - Recovery strategies effectiveness

3. **System Performance**
   - Processing times
   - Memory usage
   - Throughput metrics

### Alerts and Notifications

1. **High Error Rate**: When error rate exceeds threshold
2. **Critical Errors**: Immediate notification for critical errors
3. **System Issues**: When system errors spike
4. **Recovery Failures**: When retry mechanisms fail

## Best Practices

### Error Handling

1. **Comprehensive Logging**
   - Log all errors with full context
   - Include stack traces in development
   - Sanitize sensitive information

2. **User-Friendly Messages**
   - Provide clear, actionable error messages
   - Include specific field and row information
   - Offer recovery suggestions

3. **Progressive Disclosure**
   - Show essential information first
   - Expandable details for technical users
   - Context-sensitive help

### Performance

1. **Batch Processing**
   - Process errors in batches
   - Limit concurrent operations
   - Use database transactions efficiently

2. **Memory Management**
   - Monitor memory usage during processing
   - Clean up temporary resources
   - Use streaming for large datasets

3. **Caching**
   - Cache analytics data appropriately
   - Invalidate cache on data changes
   - Use efficient cache keys

### Security

1. **Input Validation**
   - Validate all user inputs
   - Sanitize error messages
   - Prevent injection attacks

2. **Access Control**
   - Verify workspace permissions
   - Audit error access
   - Rate limit API calls

3. **Data Protection**
   - Encrypt sensitive error data
   - Implement data retention policies
   - Secure error exports

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Reduce batch sizes
   - Increase cleanup frequency
   - Monitor memory limits

2. **Slow Error Queries**
   - Check index usage
   - Optimize filter combinations
   - Consider pagination limits

3. **Retry Loops**
   - Review retry strategies
   - Check error classifications
   - Monitor retry counts

4. **Missing Errors**
   - Verify error logging integration
   - Check database constraints
   - Review error service configuration

### Debugging

1. **Enable Debug Logging**
   ```bash
   NODE_ENV=development
   IMPORT_INCLUDE_STACK_TRACES=true
   ```

2. **Check Configuration**
   ```typescript
   import { getConfigSummary } from '@aff/db/src/constants/import-config'
   console.log(getConfigSummary())
   ```

3. **Database Queries**
   ```sql
   -- Check error statistics
   SELECT error_type, severity, COUNT(*) 
   FROM import_errors 
   WHERE job_id = 'job-uuid' 
   GROUP BY error_type, severity;
   
   -- Check retry patterns
   SELECT retry_count, COUNT(*) 
   FROM import_errors 
   WHERE job_id = 'job-uuid' 
   GROUP BY retry_count;
   ```

## Migration Guide

### From Basic Error Handling

1. **Run Database Migration**
   ```bash
   psql -d database -f packages/db/sql/migrations/001_enhance_import_errors.sql
   ```

2. **Update Code**
   - Replace basic error handling with ErrorService
   - Update frontend components
   - Add configuration constants

3. **Test Functionality**
   - Verify error logging
   - Test retry mechanisms
   - Validate analytics

### Configuration Migration

1. **Environment Variables**
   - Add new configuration variables
   - Update existing timeouts and limits
   - Enable/disable features as needed

2. **Database Cleanup**
   - Archive old error data
   - Update indexes
   - Verify constraints

## Support

For questions or issues with the error handling system:

1. Check this documentation first
2. Review the troubleshooting section
3. Check the code comments for implementation details
4. Consult the configuration reference

## License

This error handling system is part of the affilitics.co platform and is proprietary software.