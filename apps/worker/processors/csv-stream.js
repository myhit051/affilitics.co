import { parse } from 'csv-parse'
import { createReadStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'
import { EventEmitter } from 'events'

/**
 * Memory-efficient streaming CSV parser
 * เป็น streaming parser ที่ประมวลผล CSV แบบ memory-efficient
 * รองรับไฟล์ขนาดใหญ่ถึง 50MB โดยใช้หน่วยความจำต่ำ
 */
export class CSVStreamProcessor extends EventEmitter {
  constructor(options = {}) {
    super()
    
    // Configuration
    this.batchSize = options.batchSize || 1000 // Process records in batches
    this.progressInterval = options.progressInterval || 0.1 // Report every 10%
    this.maxMemoryUsage = options.maxMemoryUsage || 512 * 1024 * 1024 // 512MB limit
    this.timeout = options.timeout || 300000 // 5 minutes timeout
    
    // State tracking
    this.processedRows = 0
    this.totalRows = 0
    this.batch = []
    this.startTime = null
    this.lastProgressReport = 0
    
    // Performance metrics
    this.metrics = {
      startTime: null,
      endTime: null,
      totalRows: 0,
      processedRows: 0,
      memoryPeak: 0,
      batchesProcessed: 0,
      errors: []
    }
  }

  /**
   * Process CSV from file path
   * @param {string} filePath - Path to CSV file
   * @param {Object} parseOptions - CSV parse options
   * @param {Function} recordProcessor - Function to process each record
   * @returns {Promise<Object>} Processing results
   */
  async processFile(filePath, parseOptions = {}, recordProcessor) {
    this.metrics.startTime = Date.now()
    this.startTime = Date.now()
    
    try {
      // Set up CSV parser options with streaming optimizations
      const parserOptions = {
        columns: true, // Use first row as column headers
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true, // Handle inconsistent column counts
        max_record_size: 1024 * 1024, // 1MB max record size
        ...parseOptions
      }

      // Create processing transform stream
      const processingTransform = this._createProcessingTransform(recordProcessor)
      
      // Create CSV parser
      const parser = parse(parserOptions)
      
      // Set up timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('CSV processing timeout')), this.timeout)
      })
      
      // Process stream with timeout
      const processingPromise = pipeline(
        createReadStream(filePath),
        parser,
        processingTransform
      )
      
      // Race between processing and timeout
      await Promise.race([processingPromise, timeoutPromise])
      
      // Process final batch if exists
      if (this.batch.length > 0) {
        await this._processBatch(recordProcessor)
      }
      
      this.metrics.endTime = Date.now()
      this.metrics.totalRows = this.processedRows
      this.metrics.processedRows = this.processedRows
      
      this.emit('completed', this.metrics)
      
      return {
        success: true,
        metrics: this.metrics,
        processedRows: this.processedRows,
        duration: this.metrics.endTime - this.metrics.startTime
      }
      
    } catch (error) {
      this.metrics.endTime = Date.now()
      this.metrics.errors.push({
        timestamp: Date.now(),
        message: error.message,
        stack: error.stack
      })
      
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Process CSV from buffer/string data
   * @param {Buffer|string} data - CSV data
   * @param {Object} parseOptions - CSV parse options
   * @param {Function} recordProcessor - Function to process each record
   * @returns {Promise<Object>} Processing results
   */
  async processData(data, parseOptions = {}, recordProcessor) {
    this.metrics.startTime = Date.now()
    this.startTime = Date.now()
    
    try {
      const parserOptions = {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        ...parseOptions
      }

      const records = []
      
      // Create parser
      const parser = parse(data.toString(), parserOptions)
      
      // Process records
      for await (const record of parser) {
        this.batch.push(record)
        
        // Process batch when it reaches batch size
        if (this.batch.length >= this.batchSize) {
          await this._processBatch(recordProcessor)
        }
        
        // Report progress
        this._reportProgress()
        
        // Check memory usage
        await this._checkMemoryUsage()
      }
      
      // Process final batch
      if (this.batch.length > 0) {
        await this._processBatch(recordProcessor)
      }
      
      this.metrics.endTime = Date.now()
      this.metrics.totalRows = this.processedRows
      this.metrics.processedRows = this.processedRows
      
      this.emit('completed', this.metrics)
      
      return {
        success: true,
        metrics: this.metrics,
        processedRows: this.processedRows,
        duration: this.metrics.endTime - this.metrics.startTime
      }
      
    } catch (error) {
      this.metrics.endTime = Date.now()
      this.metrics.errors.push({
        timestamp: Date.now(),
        message: error.message,
        stack: error.stack
      })
      
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Create processing transform stream
   * @private
   */
  _createProcessingTransform(recordProcessor) {
    return new Transform({
      objectMode: true,
      transform: async (record, encoding, callback) => {
        try {
          this.batch.push(record)
          
          // Process batch when it reaches batch size
          if (this.batch.length >= this.batchSize) {
            await this._processBatch(recordProcessor)
          }
          
          // Report progress
          this._reportProgress()
          
          // Check memory usage
          await this._checkMemoryUsage()
          
          callback()
          
        } catch (error) {
          callback(error)
        }
      }
    })
  }

  /**
   * Process a batch of records
   * @private
   */
  async _processBatch(recordProcessor) {
    if (this.batch.length === 0) return
    
    try {
      // Process batch
      if (recordProcessor) {
        await recordProcessor(this.batch, this.processedRows)
      }
      
      this.processedRows += this.batch.length
      this.metrics.batchesProcessed++
      
      // Emit batch processed event
      this.emit('batchProcessed', {
        batchSize: this.batch.length,
        totalProcessed: this.processedRows,
        memoryUsage: process.memoryUsage()
      })
      
      // Clear batch to free memory
      this.batch = []
      
      // Force garbage collection if possible
      if (global.gc) {
        global.gc()
      }
      
    } catch (error) {
      this.metrics.errors.push({
        timestamp: Date.now(),
        message: error.message,
        batchSize: this.batch.length,
        processedRows: this.processedRows
      })
      throw error
    }
  }

  /**
   * Report processing progress
   * @private
   */
  _reportProgress() {
    if (!this.totalRows) return
    
    const currentProgress = this.processedRows / this.totalRows
    
    // Report progress every progressInterval (default 10%)
    if (currentProgress - this.lastProgressReport >= this.progressInterval) {
      this.lastProgressReport = currentProgress
      
      const elapsed = Date.now() - this.startTime
      const rate = this.processedRows / (elapsed / 1000)
      const memUsage = process.memoryUsage()
      
      // Track peak memory usage
      this.metrics.memoryPeak = Math.max(this.metrics.memoryPeak, memUsage.heapUsed)
      
      this.emit('progress', {
        processed: this.processedRows,
        total: this.totalRows,
        percentage: Math.round(currentProgress * 100),
        rate: Math.round(rate),
        elapsed,
        memoryUsage: memUsage
      })
    }
  }

  /**
   * Check memory usage and take action if needed
   * @private
   */
  async _checkMemoryUsage() {
    const memUsage = process.memoryUsage()
    
    // Track peak memory
    this.metrics.memoryPeak = Math.max(this.metrics.memoryPeak, memUsage.heapUsed)
    
    // If memory usage is too high, force garbage collection
    if (memUsage.heapUsed > this.maxMemoryUsage * 0.8) {
      this.emit('memoryWarning', {
        current: memUsage.heapUsed,
        limit: this.maxMemoryUsage,
        percentage: (memUsage.heapUsed / this.maxMemoryUsage) * 100
      })
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
      
      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    
    // Throw error if memory limit exceeded
    if (memUsage.heapUsed > this.maxMemoryUsage) {
      throw new Error(`Memory limit exceeded: ${memUsage.heapUsed} > ${this.maxMemoryUsage}`)
    }
  }

  /**
   * Estimate total rows for progress reporting
   * @param {string} filePath - Path to CSV file
   * @returns {Promise<number>} Estimated row count
   */
  async estimateRowCount(filePath) {
    return new Promise((resolve, reject) => {
      let lineCount = 0
      const stream = createReadStream(filePath)
      
      stream.on('data', (chunk) => {
        lineCount += chunk.toString().split('\n').length - 1
      })
      
      stream.on('end', () => {
        this.totalRows = Math.max(0, lineCount - 1) // Subtract header row
        resolve(this.totalRows)
      })
      
      stream.on('error', reject)
    })
  }

  /**
   * Get current processing metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentMemoryUsage: process.memoryUsage(),
      processedRows: this.processedRows,
      isRunning: this.metrics.startTime && !this.metrics.endTime
    }
  }

  /**
   * Reset processor state for reuse
   */
  reset() {
    this.processedRows = 0
    this.totalRows = 0
    this.batch = []
    this.startTime = null
    this.lastProgressReport = 0
    this.metrics = {
      startTime: null,
      endTime: null,
      totalRows: 0,
      processedRows: 0,
      memoryPeak: 0,
      batchesProcessed: 0,
      errors: []
    }
  }
}

/**
 * Factory function to create CSV stream processor
 * @param {Object} options - Configuration options
 * @returns {CSVStreamProcessor} New processor instance
 */
export function createCSVProcessor(options = {}) {
  return new CSVStreamProcessor(options)
}

/**
 * Helper function for common CSV processing patterns
 * @param {string|Buffer} source - File path or data
 * @param {Object} options - Processing options
 * @param {Function} recordProcessor - Record processing function
 * @returns {Promise<Object>} Processing results
 */
export async function processCSV(source, options = {}, recordProcessor) {
  const processor = createCSVProcessor(options)
  
  if (typeof source === 'string') {
    // Estimate row count for progress reporting
    await processor.estimateRowCount(source)
    return processor.processFile(source, options.parseOptions, recordProcessor)
  } else {
    return processor.processData(source, options.parseOptions, recordProcessor)
  }
}