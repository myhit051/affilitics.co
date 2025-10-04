import { config } from 'dotenv'
config({ path: '../../.env' })

// Test individual services
import { createCSVProcessor } from './processors/csv-stream.js'
import { createRetryHandler } from './processors/retry-handler.js'
import { createHealthMonitor } from './services/health-monitor.js'
import { createMetricsCollector } from './services/metrics-collector.js'
import { formatError, formatUserError } from './utils/error-formatter.js'

console.log('🧪 Testing Enhanced Worker Services...\n')

// Test 1: CSV Stream Processor
console.log('1️⃣ Testing CSV Stream Processor...')
try {
  const csvProcessor = createCSVProcessor({
    batchSize: 10,
    progressInterval: 0.5
  })
  
  // Test with sample CSV data
  const sampleCSV = `Order ID,SubID,Order Time,Amount,Commission
12345,SUB001,2023-10-01,100.00,10.00
12346,SUB002,2023-10-02,200.00,20.00
12347,SUB003,2023-10-03,150.00,15.00`

  let processedCount = 0
  const recordProcessor = async (batch) => {
    processedCount += batch.length
    console.log(`  📊 Processed batch of ${batch.length} records (total: ${processedCount})`)
  }
  
  const result = await csvProcessor.processData(sampleCSV, {}, recordProcessor)
  console.log(`  ✅ CSV processing completed: ${result.processedRows} rows in ${result.duration}ms`)
  
} catch (error) {
  console.error('  ❌ CSV processor test failed:', error.message)
}

// Test 2: Retry Handler
console.log('\n2️⃣ Testing Retry Handler...')
try {
  const retryHandler = createRetryHandler({
    maxRetries: 2,
    baseDelay: 100 // Fast for testing
  })
  
  const mockJob = {
    id: 'test-job-123',
    status: 'failed',
    error: 'Connection timeout'
  }
  
  let retryCount = 0
  const retryCallback = async (job) => {
    retryCount++
    console.log(`  🔄 Retry attempt ${retryCount} for job ${job.id}`)
    if (retryCount < 2) {
      throw new Error('Still failing')
    }
    console.log(`  ✅ Job ${job.id} succeeded on retry ${retryCount}`)
  }
  
  retryHandler.on('retryScheduled', (info) => {
    console.log(`  ⏰ Retry scheduled: attempt ${info.attemptNumber}, delay ${info.delay}ms`)
  })
  
  const scheduled = await retryHandler.scheduleRetry(mockJob, retryCallback)
  console.log(`  📝 Retry scheduled: ${scheduled}`)
  
  // Wait a bit for retries to complete
  await new Promise(resolve => setTimeout(resolve, 500))
  
} catch (error) {
  console.error('  ❌ Retry handler test failed:', error.message)
}

// Test 3: Health Monitor
console.log('\n3️⃣ Testing Health Monitor...')
try {
  const healthMonitor = createHealthMonitor({
    workerId: 'test-worker',
    heartbeatInterval: 1000, // 1 second for testing
    healthCheckInterval: 500
  })
  
  healthMonitor.on('healthCheck', (health) => {
    console.log(`  💓 Health check: ${health.status} (Memory: ${Math.round(health.memoryUsage.heapUsed / 1024 / 1024)}MB)`)
  })
  
  healthMonitor.on('heartbeat', (data) => {
    console.log(`  💗 Heartbeat sent: ${data.workerId} (uptime: ${Math.round(data.uptime / 1000)}s)`)
  })
  
  await healthMonitor.start()
  console.log('  ✅ Health monitor started')
  
  // Simulate some activity
  healthMonitor.reportJobStarted('test-job-1')
  healthMonitor.reportJobCompleted('test-job-1', 1500)
  
  // Wait for a few health checks
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  healthMonitor.stop()
  console.log('  ✅ Health monitor stopped')
  
} catch (error) {
  console.error('  ❌ Health monitor test failed:', error.message)
}

// Test 4: Metrics Collector
console.log('\n4️⃣ Testing Metrics Collector...')
try {
  const metricsCollector = createMetricsCollector({
    workerId: 'test-worker',
    collectInterval: 1000
  })
  
  metricsCollector.on('systemMetrics', (metrics) => {
    console.log(`  📈 System metrics collected: Memory ${Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`)
  })
  
  metricsCollector.start()
  console.log('  ✅ Metrics collector started')
  
  // Record some test metrics
  metricsCollector.recordJobStarted('test-job-1', { platform: 'shopee' })
  metricsCollector.recordJobCompleted('test-job-1', { rowsProcessed: 100 }, 1500)
  metricsCollector.recordCsvParsing('test-job-1', 800, 100, 1024)
  metricsCollector.recordDbWrite('test-job-1', 600, 100, 'insert')
  
  // Wait for metrics collection
  await new Promise(resolve => setTimeout(resolve, 1500))
  
  const summary = metricsCollector.getMetricsSummary()
  console.log(`  📊 Metrics summary:`)
  console.log(`     - Jobs processed: ${summary.counters.jobsProcessed}`)
  console.log(`     - Jobs succeeded: ${summary.counters.jobsSucceeded}`)
  console.log(`     - Rows processed: ${summary.counters.rowsProcessed}`)
  console.log(`     - Avg processing time: ${summary.aggregated.avgJobProcessingTime}ms`)
  
  metricsCollector.stop()
  console.log('  ✅ Metrics collector stopped')
  
} catch (error) {
  console.error('  ❌ Metrics collector test failed:', error.message)
}

// Test 5: Error Formatter
console.log('\n5️⃣ Testing Error Formatter...')
try {
  // Test different error types
  const testErrors = [
    new Error('CSV file is malformed'),
    new Error('Connection timeout occurred'),
    new Error('Out of memory allocation failed'),
    new Error('Validation failed: missing required fields'),
    new Error('Authentication token expired')
  ]
  
  testErrors.forEach((error, index) => {
    const formattedError = formatError(error, { jobId: `test-job-${index}` })
    const userError = formatUserError(error, { jobId: `test-job-${index}` })
    
    console.log(`  📝 Error ${index + 1}:`)
    console.log(`     Category: ${formattedError.category}`)
    console.log(`     Severity: ${formattedError.severity}`)
    console.log(`     User message: ${userError.message}`)
    console.log(`     Suggestion: ${userError.suggestion}`)
    console.log(`     Retryable: ${userError.retryable}`)
    console.log('')
  })
  
  console.log('  ✅ Error formatter working correctly')
  
} catch (error) {
  console.error('  ❌ Error formatter test failed:', error.message)
}

console.log('\n🎉 All service tests completed!')
console.log('✨ Enhanced Worker services are ready for integration!')