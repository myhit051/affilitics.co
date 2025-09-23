# Import System Documentation

A comprehensive import/upload system for affiliate marketing data supporting Shopee, Lazada, and TikTok CSV formats.

## Features

### 🚀 Core Functionality
- **Multi-platform support**: Shopee, Lazada, TikTok Shop
- **Drag & drop file upload** with real-time validation
- **CSV parsing and validation** with detailed error reporting
- **Data preview** with searchable table view
- **Import history** with advanced filtering and search
- **Background job processing** with real-time status updates
- **Error management** with categorized error reporting

### 🔒 Security
- **File validation**: Type, size, and content validation
- **Input sanitization**: XSS and injection prevention
- **Rate limiting**: Protection against abuse
- **Workspace isolation**: Multi-tenant security
- **Malicious content detection**: Script and SQL injection detection

### 📊 Data Processing
- **Platform-specific parsing**: Custom validation rules per platform
- **Duplicate detection**: Across files and workspace
- **Data transformation**: Standardized output format
- **Batch processing**: Memory-efficient large file handling
- **Progress tracking**: Real-time processing updates

## Components

### ImportDashboard
Main dashboard component that orchestrates the entire import workflow.

```tsx
import { ImportDashboard } from '@/components/import'

export default function ImportPage() {
  return <ImportDashboard />
}
```

### FileUpload
Drag & drop file upload with platform selection and validation.

```tsx
import { FileUpload } from '@/components/import'

function MyComponent() {
  return (
    <FileUpload
      platform="shopee"
      setPlatform={setPlatform}
      onUploadSuccess={(result) => console.log('Uploaded:', result)}
      onValidationComplete={(result) => console.log('Validated:', result)}
    />
  )
}
```

### ImportHistory
Browse and manage import history with advanced filtering.

```tsx
import { ImportHistory } from '@/components/import'

function HistoryPage() {
  return (
    <ImportHistory
      onJobSelect={(job) => console.log('Selected:', job)}
      onRefresh={() => console.log('Refreshing...')}
    />
  )
}
```

### ErrorReporting
Detailed error reporting with filtering and export capabilities.

```tsx
import { ErrorReporting } from '@/components/import'

function ErrorsPage({ jobId }: { jobId: string }) {
  return (
    <ErrorReporting
      jobId={jobId}
      jobFilename="data.csv"
      onClose={() => navigate('/import')}
    />
  )
}
```

### DataPreview
Preview uploaded data with search and pagination.

```tsx
import { DataPreview } from '@/components/import'

function PreviewPage({ jobId }: { jobId: string }) {
  return (
    <DataPreview
      jobId={jobId}
      onClose={() => navigate('/import')}
    />
  )
}
```

## API Endpoints

### POST /api/import/upload
Upload and validate files.

**Request:**
```
FormData {
  file: File,
  platform: 'shopee' | 'lazada' | 'tiktok',
  validateOnly?: boolean
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid",
  "platform": "shopee",
  "filename": "data.csv",
  "size": 12345,
  "message": "File uploaded successfully"
}
```

### POST /api/import/validate
Validate uploaded files with detailed error reporting.

**Request:**
```json
{
  "jobId": "uuid",
  "preview": true
}
```

**Response:**
```json
{
  "success": true,
  "isValid": true,
  "headers": ["Order ID", "Product Name", ...],
  "summary": {
    "totalRows": 1000,
    "validRows": 995,
    "invalidRows": 5
  },
  "criticalErrors": [...],
  "warnings": [...],
  "sampleData": [...]
}
```

### POST /api/import/commit
Start processing validated data.

**Request:**
```json
{
  "jobId": "uuid",
  "dateFrom": "2024-01-01",
  "dateTo": "2024-01-31",
  "forceProcess": false
}
```

**Response:**
```json
{
  "success": true,
  "status": "completed",
  "summary": {
    "totalRows": 1000,
    "insertedRows": 995,
    "skippedRows": 5,
    "successRate": 99.5
  }
}
```

### GET /api/import/status
Monitor job processing status.

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "status": "processing",
    "progress": 75,
    "totalRows": 1000,
    "processedRows": 750,
    "estimatedCompletion": "2024-01-01T10:30:00Z"
  }
}
```

### GET /api/import/history
Browse import history with filtering.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `status`: Filter by status
- `platform`: Filter by platform
- `search`: Search in filenames
- `dateFrom`, `dateTo`: Date range filter
- `sortBy`, `sortOrder`: Sorting options

### GET /api/import/errors
Get detailed error reports.

**Query Parameters:**
- `jobId`: Required job ID
- `page`, `limit`: Pagination
- `errorType`: Filter by error type
- `severity`: Filter by severity (critical, warning, info)
- `search`: Search in error messages

## Hooks

### useImportStatus
Monitor import job status with real-time updates.

```tsx
import { useImportStatus } from '@/components/import'

function MyComponent() {
  const { jobs, addJob, removeJob, refreshAll } = useImportStatus({
    pollingInterval: 3000,
    onStatusChange: (jobId, oldStatus, newStatus) => {
      console.log(`Job ${jobId}: ${oldStatus} -> ${newStatus}`)
    }
  })

  return (
    <div>
      {Array.from(jobs.values()).map(job => (
        <div key={job.id}>{job.filename} - {job.status}</div>
      ))}
    </div>
  )
}
```

### useImportBatch
Manage multiple import jobs as a batch.

```tsx
import { useImportBatch } from '@/components/import'

function BatchUploader() {
  const { 
    addToBatch, 
    clearBatch, 
    batchStatus, 
    isComplete 
  } = useImportBatch()

  return (
    <div>
      <p>Batch Status: {batchStatus.completed}/{batchStatus.total}</p>
      {isComplete && <p>All jobs completed!</p>}
    </div>
  )
}
```

### useImportNotifications
Get notifications for import status changes.

```tsx
import { useImportNotifications } from '@/components/import'

function NotificationCenter() {
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead 
  } = useImportNotifications()

  return (
    <div>
      <span>Unread: {unreadCount}</span>
      {notifications.map(notification => (
        <div key={notification.id}>
          {notification.title}: {notification.message}
        </div>
      ))}
    </div>
  )
}
```

## Platform Configurations

### Supported Platforms

#### Shopee
- **Required headers**: Order ID, Product Name, Commission Rate, Commission Amount, Order Status, Order Date
- **Optional headers**: Product ID, SKU, Category, Shop Name, Customer ID, Quantity, Unit Price, Total Amount, Currency, Click Time, Conversion Time
- **Validation**: Order ID format, commission rate 0-100%, status values, date validation

#### Lazada
- **Required headers**: Transaction ID, Product Title, Commission Rate (%), Commission (Local Currency), Transaction Status, Transaction Time
- **Optional headers**: Product ID, Product URL, Category, Seller Name, Buyer ID, Product Quantity, Product Price, Order Value, Currency, Click Timestamp, Purchase Timestamp, Country
- **Validation**: Transaction ID format, commission rate 0-50%, URL validation, status values

#### TikTok Shop
- **Required headers**: Order No., Product Name, Commission Rate, Estimated Commission, Order Status, Order Create Time
- **Optional headers**: Product ID, Video ID, Creator, Category Name, Shop Name, User ID, Product Quantity, Product Price, Order Amount, Currency, Video Publish Time, Settlement Date, Final Commission, Region
- **Validation**: Order number format, commission rate 0-30%, video ID format, status values

## Security Features

### File Validation
- **File type checking**: Only CSV files allowed
- **Size limits**: Platform-specific limits (10-20MB)
- **Content scanning**: Malicious pattern detection
- **Filename sanitization**: Remove dangerous characters

### Input Sanitization
- **XSS prevention**: HTML/script tag removal
- **SQL injection**: Pattern detection and blocking
- **Formula injection**: Excel formula escaping
- **Content encoding**: Character validation

### Access Control
- **Workspace isolation**: Multi-tenant data separation
- **Rate limiting**: Upload frequency protection
- **Authentication**: JWT token validation
- **Authorization**: Role-based access control

## Error Handling

### Error Types
- **Critical**: Missing required fields, invalid data types
- **Warning**: Duplicates, format issues
- **Info**: Business rule violations, minor issues

### Error Recovery
- **Retry mechanism**: Failed job retry with cleanup
- **Partial processing**: Continue processing valid records
- **Error export**: CSV export of all errors
- **Error dismissal**: Mark errors as reviewed

## Performance Optimization

### Memory Management
- **Streaming processing**: Large file handling
- **Batch processing**: 100-record batches
- **Progress tracking**: Real-time progress updates
- **Resource cleanup**: Temporary file removal

### Database Optimization
- **Bulk inserts**: Efficient batch operations
- **Conflict resolution**: ON CONFLICT handling
- **Index usage**: Optimized queries
- **Connection pooling**: Resource management

## Testing

### Unit Tests
```bash
npm test src/lib/import/
```

### Integration Tests
```bash
npm run test:integration
```

### E2E Tests
```bash
npm run test:e2e -- --spec "**/import/**"
```

## Deployment Considerations

### Environment Variables
```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
SUPABASE_STORAGE_BUCKET=uploads
APP_ORIGIN=https://app.affilitics.co
```

### Database Setup
Ensure the following tables exist:
- `import_jobs`
- `import_errors`
- `affiliate_orders`
- `workspaces`

### Storage Setup
Configure Supabase storage bucket with appropriate policies for file uploads.

### Security Headers
```
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

## Contributing

### Code Style
- Follow existing TypeScript patterns
- Use React hooks for state management
- Implement proper error boundaries
- Add comprehensive JSDoc comments

### Testing Requirements
- Unit tests for utilities
- Integration tests for API endpoints
- E2E tests for user workflows
- Error scenario testing

### Security Checklist
- [ ] Input validation on all endpoints
- [ ] File type and size validation
- [ ] Content scanning for malicious patterns
- [ ] Workspace isolation enforcement
- [ ] Rate limiting implementation
- [ ] Error message sanitization

## Troubleshooting

### Common Issues

#### File Upload Fails
1. Check file size limits
2. Verify MIME type allowlist
3. Check storage bucket permissions
4. Validate authentication headers

#### Validation Errors
1. Review platform-specific requirements
2. Check CSV format and encoding
3. Verify required headers presence
4. Check data type compliance

#### Processing Failures
1. Check database connectivity
2. Verify workspace permissions
3. Review batch size limits
4. Check memory usage

#### Performance Issues
1. Monitor batch processing size
2. Check database query performance
3. Review file size and complexity
4. Optimize polling intervals

For additional support, check the application logs and monitoring dashboards.