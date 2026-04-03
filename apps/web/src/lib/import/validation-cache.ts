/**
 * Validation Caching System for CSV Import
 * Provides high-performance caching for validation results to avoid reprocessing
 */

import { createHash } from 'crypto'
// import { CSV_VALIDATION_CONFIG, getEffectiveConfig } from '@aff/db'
// Mock for build purposes
const getEffectiveConfig = () => ({
  csvValidation: {
    VALIDATION_CACHE_MAX_ENTRIES: 1000,
    VALIDATION_CACHE_TTL_MINUTES: 30
  },
  features: {
    ENABLE_CSV_VALIDATION_CACHE: true
  }
})
import type { ParsedCSVData, StreamingValidationOptions } from './csv-validator'

export interface CacheEntry<T = any> {
  key: string
  value: T
  timestamp: number
  accessCount: number
  lastAccessed: number
  size: number
  ttl: number
  tags: string[]
  metadata?: Record<string, any>
}

export interface CacheStats {
  totalEntries: number
  totalSize: number
  hitRate: number
  missRate: number
  evictionCount: number
  totalHits: number
  totalMisses: number
  avgAccessTime: number
  memoryUsage: number
}

export interface CacheConfig {
  maxEntries: number
  maxSize: number // in bytes
  ttl: number // in milliseconds
  enableCompression: boolean
  enablePersistence: boolean
  cleanupInterval: number
  evictionStrategy: 'lru' | 'lfu' | 'ttl'
}

export class ValidationCache {
  private cache: Map<string, CacheEntry<ParsedCSVData>>
  private stats: CacheStats
  private config: CacheConfig
  private cleanupTimer?: NodeJS.Timeout
  private compressionEnabled: boolean

  constructor(config?: Partial<CacheConfig>) {
    const effectiveConfig = getEffectiveConfig()
    
    this.config = {
      maxEntries: effectiveConfig.csvValidation.VALIDATION_CACHE_MAX_ENTRIES,
      maxSize: 50 * 1024 * 1024, // 50MB default
      ttl: effectiveConfig.csvValidation.VALIDATION_CACHE_TTL_MINUTES * 60 * 1000,
      enableCompression: true,
      enablePersistence: false,
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      evictionStrategy: 'lru',
      ...config
    }

    this.cache = new Map()
    this.stats = {
      totalEntries: 0,
      totalSize: 0,
      hitRate: 0,
      missRate: 0,
      evictionCount: 0,
      totalHits: 0,
      totalMisses: 0,
      avgAccessTime: 0,
      memoryUsage: 0
    }

    this.compressionEnabled = this.config.enableCompression && typeof window === 'undefined' // Node.js only
    this.startCleanupTimer()
  }

  /**
   * Generate cache key for validation result
   */
  generateCacheKey(
    csvContent: string | Buffer,
    platform: string,
    options: StreamingValidationOptions,
    additionalContext?: Record<string, any>
  ): string {
    const contentHash = this.hashContent(csvContent)
    const optionsHash = this.hashObject(options)
    const contextHash = additionalContext ? this.hashObject(additionalContext) : ''
    
    return `csv_validation:${platform}:${contentHash}:${optionsHash}:${contextHash}`
  }

  /**
   * Get validation result from cache
   */
  async get(key: string): Promise<ParsedCSVData | null> {
    const startTime = Date.now()
    
    try {
      const entry = this.cache.get(key)
      
      if (!entry) {
        this.stats.totalMisses++
        this.updateHitRate()
        return null
      }

      // Check TTL
      if (Date.now() - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
        this.stats.evictionCount++
        this.stats.totalMisses++
        this.updateHitRate()
        return null
      }

      // Update access statistics
      entry.accessCount++
      entry.lastAccessed = Date.now()
      
      this.stats.totalHits++
      this.stats.avgAccessTime = (this.stats.avgAccessTime + (Date.now() - startTime)) / 2
      this.updateHitRate()

      // Decompress if needed
      const result = this.compressionEnabled ? await this.decompress(entry.value) : entry.value
      return result as ParsedCSVData

    } catch (error) {
      console.error('Cache get error:', error)
      this.stats.totalMisses++
      this.updateHitRate()
      return null
    }
  }

  /**
   * Store validation result in cache
   */
  async set(
    key: string,
    value: ParsedCSVData,
    options?: {
      ttl?: number
      tags?: string[]
      metadata?: Record<string, any>
    }
  ): Promise<boolean> {
    try {
      // Check cache limits before adding
      if (this.cache.size >= this.config.maxEntries) {
        await this.evictEntries()
      }

      // Compress if enabled
      const storedValue = this.compressionEnabled ? await this.compress(value) : value
      const size = this.calculateSize(storedValue)

      // Check size limits
      if (this.stats.totalSize + size > this.config.maxSize) {
        await this.evictBySize(size)
      }

      const entry: CacheEntry<ParsedCSVData> = {
        key,
        value: storedValue,
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
        size,
        ttl: options?.ttl || this.config.ttl,
        tags: options?.tags || [],
        metadata: options?.metadata
      }

      this.cache.set(key, entry)
      this.stats.totalEntries = this.cache.size
      this.stats.totalSize += size

      return true

    } catch (error) {
      console.error('Cache set error:', error)
      return false
    }
  }

  /**
   * Check if key exists in cache (without updating access stats)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    
    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      this.stats.evictionCount++
      return false
    }
    
    return true
  }

  /**
   * Remove entry from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key)
    if (entry) {
      this.stats.totalSize -= entry.size
      this.stats.totalEntries--
      return this.cache.delete(key)
    }
    return false
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear()
    this.stats = {
      ...this.stats,
      totalEntries: 0,
      totalSize: 0,
      evictionCount: 0
    }
  }

  /**
   * Clear entries by tags
   */
  clearByTags(tags: string[]): number {
    let cleared = 0
    
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (entry.tags.some(tag => tags.includes(tag))) {
        this.delete(key)
        cleared++
      }
    }
    
    return cleared
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      memoryUsage: this.calculateMemoryUsage()
    }
  }

  /**
   * Get detailed cache information
   */
  getInfo(): {
    config: CacheConfig
    stats: CacheStats
    entries: Array<{
      key: string
      size: number
      age: number
      accessCount: number
      lastAccessed: number
      tags: string[]
    }>
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      size: entry.size,
      age: Date.now() - entry.timestamp,
      accessCount: entry.accessCount,
      lastAccessed: entry.lastAccessed,
      tags: entry.tags
    }))

    return {
      config: this.config,
      stats: this.getStats(),
      entries
    }
  }

  /**
   * Optimize cache by removing stale entries
   */
  async optimize(): Promise<{
    removedEntries: number
    freedBytes: number
  }> {
    const initialSize = this.stats.totalSize
    const initialEntries = this.stats.totalEntries
    
    // Remove expired entries
    const now = Date.now()
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now - entry.timestamp > entry.ttl) {
        this.delete(key)
      }
    }

    // Remove least accessed entries if still over limits
    if (this.cache.size > this.config.maxEntries * 0.8) {
      await this.evictEntries(Math.floor(this.config.maxEntries * 0.2))
    }

    return {
      removedEntries: initialEntries - this.stats.totalEntries,
      freedBytes: initialSize - this.stats.totalSize
    }
  }

  /**
   * Warmup cache with common validation patterns
   */
  async warmup(patterns: Array<{
    platform: string
    sampleData: string
    options: StreamingValidationOptions
  }>): Promise<number> {
    let warmedUp = 0
    
    for (const pattern of patterns) {
      try {
        const key = this.generateCacheKey(pattern.sampleData, pattern.platform, pattern.options)
        
        if (!this.has(key)) {
          // This would typically involve calling the validator
          // For now, we'll create a placeholder entry
          const placeholderResult: ParsedCSVData = {
            headers: [],
            data: [],
            errors: [],
            warnings: [],
            summary: {
              totalRows: 0,
              validRows: 0,
              invalidRows: 0,
              duplicateRows: 0,
              processingTime: 0,
              memoryUsage: 0,
              throughput: 0,
              errorsByType: {}
            },
            validationHash: key
          }
          
          await this.set(key, placeholderResult, {
            tags: ['warmup', pattern.platform],
            metadata: { warmedUp: true }
          })
          
          warmedUp++
        }
      } catch (error) {
        console.error('Cache warmup error:', error)
      }
    }
    
    return warmedUp
  }

  /**
   * Private helper methods
   */
  private hashContent(content: string | Buffer): string {
    const hash = createHash('sha256')
    
    if (Buffer.isBuffer(content)) {
      hash.update(content)
    } else {
      // For large strings, hash only a representative sample
      const sample = content.length > 10000 
        ? content.substring(0, 5000) + content.substring(content.length - 5000)
        : content
      hash.update(sample, 'utf8')
    }
    
    return hash.digest('hex').substring(0, 16) // Use first 16 characters for brevity
  }

  private hashObject(obj: any): string {
    const hash = createHash('sha256')
    hash.update(JSON.stringify(obj, Object.keys(obj).sort()), 'utf8')
    return hash.digest('hex').substring(0, 8)
  }

  private calculateSize(value: any): number {
    // Rough estimation of object size in bytes
    const jsonStr = JSON.stringify(value)
    return Buffer.byteLength(jsonStr, 'utf8')
  }

  private calculateMemoryUsage(): number {
    let totalSize = 0
    for (const entry of Array.from(this.cache.values())) {
      totalSize += entry.size + 200 // Add overhead for entry metadata
    }
    return totalSize
  }

  private updateHitRate(): void {
    const totalRequests = this.stats.totalHits + this.stats.totalMisses
    if (totalRequests > 0) {
      this.stats.hitRate = (this.stats.totalHits / totalRequests) * 100
      this.stats.missRate = (this.stats.totalMisses / totalRequests) * 100
    }
  }

  private async evictEntries(count?: number): Promise<void> {
    const entriesToRemove = count || Math.max(1, Math.floor(this.cache.size * 0.1)) // Remove 10% by default
    const entries = Array.from(this.cache.entries())

    // Sort by eviction strategy
    switch (this.config.evictionStrategy) {
      case 'lru':
        entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)
        break
      case 'lfu':
        entries.sort(([, a], [, b]) => a.accessCount - b.accessCount)
        break
      case 'ttl':
        entries.sort(([, a], [, b]) => a.timestamp - b.timestamp)
        break
    }

    // Remove oldest entries
    for (let i = 0; i < Math.min(entriesToRemove, entries.length); i++) {
      const [key, entry] = entries[i]
      this.stats.totalSize -= entry.size
      this.cache.delete(key)
      this.stats.evictionCount++
    }

    this.stats.totalEntries = this.cache.size
  }

  private async evictBySize(requiredSize: number): Promise<void> {
    let freedSize = 0
    const entries = Array.from(this.cache.entries())

    // Sort by size (largest first) to free up space quickly
    entries.sort(([, a], [, b]) => b.size - a.size)

    for (const [key, entry] of entries) {
      if (freedSize >= requiredSize) break
      
      this.stats.totalSize -= entry.size
      freedSize += entry.size
      this.cache.delete(key)
      this.stats.evictionCount++
    }

    this.stats.totalEntries = this.cache.size
  }

  private async compress(data: ParsedCSVData): Promise<ParsedCSVData> {
    // In a real implementation, you might use compression libraries
    // For now, we'll just return the data as-is
    return data
  }

  private async decompress(data: ParsedCSVData): Promise<ParsedCSVData> {
    // In a real implementation, you might decompress the data
    // For now, we'll just return the data as-is
    return data
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }

    this.cleanupTimer = setInterval(async () => {
      await this.optimize()
    }, this.config.cleanupInterval)
  }

  /**
   * Cleanup when cache is no longer needed
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
    this.clear()
  }
}

/**
 * Global cache instance with lazy initialization
 */
let globalCache: ValidationCache | null = null

export function getValidationCache(): ValidationCache {
  if (!globalCache) {
    const effectiveConfig = getEffectiveConfig()
    
    globalCache = new ValidationCache({
      maxEntries: effectiveConfig.csvValidation.VALIDATION_CACHE_MAX_ENTRIES,
      ttl: effectiveConfig.csvValidation.VALIDATION_CACHE_TTL_MINUTES * 60 * 1000,
      enableCompression: true,
      enablePersistence: false
    })
  }
  
  return globalCache
}

/**
 * Create a cache instance with custom configuration
 */
export function createValidationCache(config?: Partial<CacheConfig>): ValidationCache {
  return new ValidationCache(config)
}

/**
 * Cache decorator for validation functions
 */
export function withCache<T extends (...args: any[]) => Promise<ParsedCSVData>>(
  cacheKeyGenerator: (...args: Parameters<T>) => string,
  options?: {
    ttl?: number
    tags?: string[]
    enabled?: boolean
  }
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value
    
    descriptor.value = async function (...args: Parameters<T>): Promise<ParsedCSVData> {
      const cache = getValidationCache()
      const enabled = options?.enabled !== false && getEffectiveConfig().features.ENABLE_CSV_VALIDATION_CACHE
      
      if (!enabled) {
        return method.apply(this, args)
      }
      
      const cacheKey = cacheKeyGenerator(...args)
      
      // Try to get from cache first
      const cached = await cache.get(cacheKey)
      if (cached) {
        return cached
      }
      
      // Execute method and cache result
      const result = await method.apply(this, args)
      await cache.set(cacheKey, result, {
        ttl: options?.ttl,
        tags: options?.tags
      })
      
      return result
    }
  }
}

/**
 * Utility functions for cache management
 */
export const CacheUtils = {
  /**
   * Get cache efficiency metrics
   */
  getEfficiencyMetrics(): {
    hitRate: number
    missRate: number
    avgAccessTime: number
    memoryEfficiency: number
  } {
    const cache = getValidationCache()
    const stats = cache.getStats()
    
    return {
      hitRate: stats.hitRate,
      missRate: stats.missRate,
      avgAccessTime: stats.avgAccessTime,
      memoryEfficiency: stats.totalEntries > 0 ? stats.totalSize / stats.totalEntries : 0
    }
  },

  /**
   * Suggest cache optimizations
   */
  getSuggestions(): string[] {
    const cache = getValidationCache()
    const stats = cache.getStats()
    const suggestions: string[] = []
    
    if (stats.hitRate < 50) {
      suggestions.push('Low cache hit rate - consider increasing TTL or cache size')
    }
    
    if (stats.avgAccessTime > 100) {
      suggestions.push('High access time - consider enabling compression or reducing entry size')
    }
    
    if (stats.evictionCount > stats.totalHits * 0.5) {
      suggestions.push('High eviction rate - consider increasing cache size')
    }
    
    if (stats.memoryUsage > 100 * 1024 * 1024) { // 100MB
      suggestions.push('High memory usage - consider enabling compression or reducing cache size')
    }
    
    return suggestions
  },

  /**
   * Clear cache for specific platform
   */
  clearPlatformCache(platform: string): number {
    const cache = getValidationCache()
    return cache.clearByTags([platform])
  },

  /**
   * Warmup cache for common validation scenarios
   */
  async warmupCommonScenarios(): Promise<number> {
    const cache = getValidationCache()
    const commonPatterns = [
      {
        platform: 'shopee',
        sampleData: 'รหัสการสั่งซื้อ,ชื่อรายการสินค้า,คอมมิชชั่นคำสั่งซื้อโดยรวม(฿),สถานะการสั่งซื้อ,เวลาที่สั่งซื้อ\nSH123,Test Product,10.50,สำเร็จ,2024-09-17',
        options: { enableStreaming: false, preview: true }
      },
      {
        platform: 'lazada',
        sampleData: 'Transaction ID,Product Title,Commission Rate (%),Commission (Local Currency),Transaction Status,Transaction Time\nLZ123,Test Product,5.5,2.75,Confirmed,2024-09-17',
        options: { enableStreaming: false, preview: true }
      },
      {
        platform: 'tiktok',
        sampleData: 'Order No.,Product Name,Commission Rate,Estimated Commission,Order Status,Order Create Time\nTT123,Test Product,8%,4.00,Completed,2024-09-17',
        options: { enableStreaming: false, preview: true }
      }
    ]
    
    return cache.warmup(commonPatterns)
  }
}

export default ValidationCache