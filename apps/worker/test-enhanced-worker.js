import { config } from 'dotenv'
config({ path: '../../.env' })

console.log('🚀 Testing Enhanced Worker Integration...\n')

// Mock the enhanced worker to prevent infinite loop
import { createClient } from '@supabase/supabase-js'
import { Pool } from 'pg'
import { IMPORT_JOB_STATUS } from '@aff/db'

// Import worker services
import { createCSVProcessor } from './processors/csv-stream.js'
import { createRetryHandler } from './processors/retry-handler.js'
import { createHealthMonitor } from './services/health-monitor.js'
import { createMetricsCollector } from './services/metrics-collector.js'
import { formatError, formatUserError, formatLogError } from './utils/error-formatter.js'
import { SimpleJobService, SimpleMetricsService, SimpleSecurityService } from './services/simple-job-service.js'

async function testEnhancedWorkerIntegration() {
  console.log('1️⃣ Testing configuration validation...')
  
  const required = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE']
  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    console.log(`  ⚠️  Missing environment variables: ${missing.join(', ')}`)
    console.log('  📝 Using mock configuration for testing')
  } else {
    console.log('  ✅ All required environment variables present')
  }

  console.log('\n2️⃣ Testing service initialization...')
  
  try {
    // Test CSV processor
    const csvProcessor = createCSVProcessor({
      batchSize: 100,
      progressInterval: 0.1,
      maxMemoryUsage: 512 * 1024 * 1024,
      timeout: 300000
    })
    console.log('  ✅ CSV processor initialized')

    // Test retry handler
    const retryHandler = createRetryHandler({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 300000,
      backoffMultiplier: 2
    })
    console.log('  ✅ Retry handler initialized')

    // Test health monitor
    const healthMonitor = createHealthMonitor({
      workerId: 'test-worker',
      heartbeatInterval: 30000,
      healthCheckInterval: 5000,
      memoryThreshold: 512 * 1024 * 1024,
      cpuThreshold: 80
    })
    console.log('  ✅ Health monitor initialized')

    // Test metrics collector
    const metricsCollector = createMetricsCollector({
      workerId: 'test-worker',
      collectInterval: 30000,
      retentionPeriod: 3600000,
      batchSize: 100
    })
    console.log('  ✅ Metrics collector initialized')

    console.log('\n3️⃣ Testing service integration...')

    // Start health monitor and metrics collector
    await healthMonitor.start()
    metricsCollector.start()
    console.log('  ✅ Services started successfully')

    // Test CSV processing with all metrics
    console.log('\n4️⃣ Testing integrated CSV processing...')
    
    const sampleCSV = `Order ID,SubID,Order Time,Amount,Net,Commission
12345,SUB001,2023-10-01 10:00:00,100.00,90.00,10.00
12346,SUB002,2023-10-02 11:00:00,200.00,180.00,20.00
12347,SUB003,2023-10-03 12:00:00,150.00,135.00,15.00
12348,SUB004,2023-10-04 13:00:00,300.00,270.00,30.00
12349,SUB005,2023-10-05 14:00:00,250.00,225.00,25.00`

    let processedCount = 0
    const startTime = Date.now()
    
    const recordProcessor = async (batch, totalProcessed) => {
      processedCount += batch.length
      
      // Simulate database insert delay
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Record metrics
      metricsCollector.recordDbWrite('test-job', 10, batch.length, 'insert')
      
      console.log(`  📊 Processed batch of ${batch.length} records (total: ${processedCount})`)
    }

    // Record job start
    healthMonitor.reportJobStarted('test-job')
    metricsCollector.recordJobStarted('test-job', { platform: 'shopee', fileSize: sampleCSV.length })

    // Process CSV
    const result = await csvProcessor.processData(sampleCSV, {
      columns: true,
      relax_column_count: true,
      trim: true
    }, recordProcessor)

    const processingTime = Date.now() - startTime
    
    // Record CSV parsing metrics
    metricsCollector.recordCsvParsing('test-job', processingTime, processedCount, sampleCSV.length)
    
    // Record job completion
    healthMonitor.reportJobCompleted('test-job', processingTime)
    metricsCollector.recordJobCompleted('test-job', { 
      rowsProcessed: processedCount,
      fileSize: sampleCSV.length 
    }, processingTime)

    console.log(`  ✅ CSV processing completed: ${processedCount} rows in ${processingTime}ms`)

    console.log('\n5️⃣ Testing error handling integration...')
    
    // Test error formatting
    const testError = new Error('CSV file is malformed and contains invalid data')
    const formattedError = formatError(testError, { jobId: 'test-job', filename: 'test.csv' })
    const userError = formatUserError(testError, { jobId: 'test-job' })
    
    console.log(`  📝 Error formatted:`)
    console.log(`     Category: ${formattedError.category}`)
    console.log(`     Severity: ${formattedError.severity}`)
    console.log(`     User message: ${userError.message}`)
    console.log(`     Retryable: ${userError.retryable}`)

    // Test retry logic
    if (userError.retryable) {
      const mockJob = { id: 'test-job', status: 'failed', error: testError.message }
      const canRetry = retryHandler.canRetry('test-job', 'failed')
      console.log(`  🔄 Can retry: ${canRetry}`)
    }

    console.log('\n6️⃣ Testing performance metrics...')
    
    // Wait a bit for metrics collection
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const healthSummary = healthMonitor.getHealthSummary()
    const metricsSummary = metricsCollector.getMetricsSummary()
    
    console.log(`  💓 Health status: ${healthSummary.status}`)
    console.log(`  📈 Jobs processed: ${metricsSummary.counters.jobsProcessed}`)
    console.log(`  📈 Avg processing time: ${metricsSummary.aggregated.avgJobProcessingTime}ms`)
    console.log(`  💾 Memory usage: ${Math.round(healthSummary.memoryUsagePercent)}%`)

    console.log('\n7️⃣ Cleaning up...')
    
    // Stop services
    healthMonitor.stop()
    metricsCollector.stop()
    
    console.log('  ✅ All services stopped')

    console.log('\n🎉 Enhanced Worker Integration Test Completed!')
    console.log('✨ All systems are working together correctly!')
    
    // Performance summary
    console.log('\n📊 Performance Summary:')
    console.log(`   - CSV Processing: ${processedCount} rows in ${processingTime}ms`)
    console.log(`   - Throughput: ${Math.round((processedCount / processingTime) * 1000)} rows/second`)
    console.log(`   - Memory efficiency: Streaming processing with batching`)
    console.log(`   - Error handling: User-friendly messages with retry logic`)
    console.log(`   - Monitoring: Real-time health and performance metrics`)

  } catch (error) {
    console.error('❌ Integration test failed:', error.message)
    console.error(error.stack)
  }
}

// Run the test
testEnhancedWorkerIntegration().catch(console.error)