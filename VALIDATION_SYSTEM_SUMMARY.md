# CSV Validation System Implementation Summary

## Overview
Implemented a comprehensive CSV validation system with platform-specific rules for Shopee, Lazada, and TikTok. The system provides robust data quality checking, error reporting, and performance optimization for large file processing.

## Key Components Implemented

### 1. Platform Configuration System (`/apps/web/src/lib/import/platform-configs.ts`)
**Features:**
- Environment-driven validation rules using configuration variables
- Enhanced custom validators with structured error responses
- Cross-platform compatibility analysis
- Dynamic platform configuration with overrides
- Comprehensive validation rule management

**Key Functions:**
- `getPlatformConfig()` - Get platform-specific configuration
- `validatePlatformConfig()` - Validate platform configuration integrity
- `createCustomPlatformConfig()` - Create custom platform configurations
- `comparePlatformConfigs()` - Compare platform compatibility
- `PlatformConfigUtils` - Utility functions for platform management

**Environment Variables Support:**
- `CSV_SHOPEE_MAX_COMMISSION_RATE` - Shopee commission rate limits
- `CSV_LAZADA_MAX_COMMISSION_RATE` - Lazada commission rate limits
- `CSV_TIKTOK_MAX_COMMISSION_RATE` - TikTok commission rate limits
- `CSV_COMMISSION_RATE_MIN_PERCENT` - Global minimum commission rate
- `CSV_ORDER_DATE_MAX_DAYS_AGO` - Maximum age for order dates
- `CSV_CURRENCY_MAX_VALUE` - Maximum currency amount validation

### 2. Enhanced CSV Validator (`/apps/web/src/lib/import/csv-validator.ts`)
**Features:**
- Streaming validation for memory-efficient processing
- Enhanced error context with line numbers and suggestions
- Improved field-specific error messages and auto-fix suggestions
- Performance optimization with early exit conditions
- Data cleaning and normalization

**Key Enhancements:**
- `validateWithStreaming()` - Memory-efficient streaming validation
- `processStreamRowEnhanced()` - Enhanced row processing with context
- `validateSingleRowEnhanced()` - Improved single row validation
- `getFieldSpecificSuggestion()` - Platform-specific error suggestions
- `cleanFieldValue()` - Automatic data cleaning and type coercion

### 3. Business Rules Validation (`/apps/web/src/lib/import/business-rules.ts`)
**Features:**
- Cross-field validation engine
- Enhanced business rule interface with categories and priorities
- Platform-specific business logic validation
- Auto-fix suggestions for common issues
- Contextual help and documentation links

**Key Components:**
- `CrossFieldValidator` - Engine for complex cross-field validations
- `EnhancedBusinessRule` - Extended business rule interface
- `validateBusinessRulesEnhanced()` - Enhanced validation with cross-field support
- Date consistency validation across order, click, and settlement dates
- Amount calculation validation for price × quantity = total
- Status consistency validation for commission vs order status

### 4. Platform Detection System (`/apps/web/src/lib/import/platform-detection.ts`)
**Features:**
- Intelligent platform detection based on CSV structure
- Confidence scoring with threshold-based decisions
- Language pattern recognition (Thai for Shopee, English for others)
- Currency format detection
- Content pattern analysis

**Detection Criteria:**
- **Shopee**: Thai headers, ฿ currency, Thai order statuses
- **Lazada**: English headers, standard currency symbols, specific field patterns
- **TikTok**: Video-specific fields, creator handles, social media patterns

### 5. Validation Caching System (`/apps/web/src/lib/import/validation-cache.ts`)
**Features:**
- High-performance in-memory caching
- Configurable TTL and cache size limits
- LRU/LFU eviction strategies
- Cache hit rate monitoring
- Background cleanup and optimization

**Configuration:**
- `CSV_VALIDATION_CACHE_ENABLED` - Enable/disable caching
- `CSV_VALIDATION_CACHE_TTL_MINUTES` - Cache entry time-to-live
- `CSV_VALIDATION_CACHE_MAX_ENTRIES` - Maximum cache entries

### 6. API Endpoints

#### Validation Preview API (`/apps/web/src/app/api/import/validate-preview/route.ts`)
**Features:**
- Real-time validation feedback for CSV files
- Platform auto-detection
- Rate limiting and security measures
- Preview mode with configurable row limits
- Comprehensive error reporting with suggestions

**Request Parameters:**
```typescript
{
  csvContent: string
  platform?: string
  options: {
    previewRows: number (1-1000, default: 100)
    enableAutoDetection: boolean (default: true)
    validateBusinessRules: boolean (default: true)
    enableCache: boolean (default: true)
    strictMode: boolean (default: false)
    timeout: number (1000-60000ms, default: 30000)
  }
}
```

#### Validation Report API (`/apps/web/src/app/api/import/validation-report/route.ts`)
**Features:**
- Comprehensive validation reports with analytics
- Data quality scoring (0-100 scale)
- Business rules compliance analysis
- Platform-specific recommendations
- Actionable improvement suggestions

**Report Sections:**
- Platform detection and analysis
- Validation summary with error categorization
- Data quality metrics and scoring
- Business rules compliance assessment
- Recommended actions with time estimates

### 7. Security and Rate Limiting (`/apps/web/src/lib/security/rate-limit.ts`)
**Features:**
- Simple in-memory rate limiting
- Configurable time windows and request limits
- IP-based rate limiting with forwarded IP support
- Automatic cleanup of expired entries

## Configuration Variables

### Global CSV Validation
```env
CSV_STREAM_CHUNK_SIZE=1000
CSV_VALIDATION_CHUNK_SIZE=100
CSV_MAX_VALIDATION_ERRORS=1000
CSV_VALIDATION_CACHE_ENABLED=true
CSV_VALIDATION_CACHE_TTL_MINUTES=30
CSV_AUTO_DETECT_PLATFORM=true
CSV_PLATFORM_DETECTION_CONFIDENCE_THRESHOLD=0.8
```

### Business Rules
```env
CSV_COMMISSION_RATE_MIN_PERCENT=0
CSV_COMMISSION_RATE_MAX_PERCENT=50
CSV_ORDER_DATE_MAX_DAYS_AGO=365
CSV_ORDER_DATE_MAX_DAYS_FUTURE=7
CSV_CURRENCY_MAX_VALUE=1000000
CSV_SUPPORTED_CURRENCIES=USD,EUR,GBP,THB,SGD,MYR,VND,IDR,PHP
```

### Platform-Specific Settings
```env
# Shopee
CSV_SHOPEE_MAX_COMMISSION_RATE=30
CSV_SHOPEE_VALID_STATUSES=รอดำเนินการ,สำเร็จ,ยกเลิก,คืนเงิน,รอตรวจสอบ
CSV_SHOPEE_CURRENCY_SYMBOL=฿

# Lazada
CSV_LAZADA_MAX_COMMISSION_RATE=50
CSV_LAZADA_VALID_STATUSES=Confirmed,Pending,Cancelled,Invalid,Paid
CSV_LAZADA_CURRENCY_SYMBOL=$

# TikTok
CSV_TIKTOK_MAX_COMMISSION_RATE=30
CSV_TIKTOK_VALID_STATUSES=Completed,Pending Settlement,Cancelled,Invalid,Under Review
CSV_TIKTOK_CURRENCY_SYMBOL=$
```

## Key Features

### 1. Performance Optimizations
- **Streaming Processing**: Memory-efficient handling of large files (>5MB)
- **Early Exit**: Stop validation when error limits are reached
- **Parallel Workers**: Configurable parallel processing for validation
- **Caching**: Intelligent caching of validation results
- **Memory Management**: Automatic cleanup and memory monitoring

### 2. Error Handling & Reporting
- **Contextual Errors**: Line-level error reporting with surrounding context
- **Severity Levels**: Error categorization (error, warning, info)
- **Auto-Fix Suggestions**: Automatic fix recommendations for common issues
- **Platform-Specific Messages**: Localized error messages (Thai for Shopee)
- **Detailed Suggestions**: Step-by-step improvement guidance

### 3. Business Logic Validation
- **Cross-Field Validation**: Validate relationships between fields
- **Date Consistency**: Ensure chronological order of dates
- **Amount Calculations**: Verify mathematical relationships
- **Status Logic**: Validate business rule compliance
- **Platform Compliance**: Check platform-specific requirements

### 4. Data Quality Assessment
- **Quality Scoring**: 0-100 data quality score
- **Completeness Metrics**: Missing data analysis
- **Consistency Checks**: Data type and format consistency
- **Duplicate Detection**: Configurable duplicate checking
- **Anomaly Detection**: Identify unusual patterns

## Usage Examples

### Basic Validation
```typescript
import { createCSVValidator } from '@/lib/import/csv-validator'
import { getPlatformConfig } from '@/lib/import/platform-configs'

const validator = createCSVValidator()
const config = getPlatformConfig('shopee')

const result = await validator.validateCSV(csvContent, config, {
  preview: true,
  previewRows: 100,
  validateBusinessRules: true
})
```

### Platform Detection
```typescript
import { detectPlatform } from '@/lib/import/platform-detection'

const detection = await detectPlatform(csvContent, {
  sampleSize: 50,
  strictMode: false,
  includeAnalysis: true
})

if (detection.detectedPlatform) {
  console.log(`Detected platform: ${detection.detectedPlatform}`)
  console.log(`Confidence: ${detection.confidence * 100}%`)
}
```

### Business Rules Validation
```typescript
import { validateBusinessRulesEnhanced } from '@/lib/import/business-rules'

const businessRuleResults = validateBusinessRulesEnhanced(row, rowNumber, context)
const criticalErrors = businessRuleResults.filter(r => r.priority === 'critical')
```

## File Structure
```
/apps/web/src/lib/import/
├── csv-validator.ts              # Main validation engine
├── platform-configs.ts           # Platform-specific configurations
├── platform-detection.ts         # Auto-platform detection
├── business-rules.ts             # Business logic validation
├── validation-cache.ts           # Caching system
└── /apps/web/src/app/api/import/
    ├── validate-preview/route.ts # Preview validation API
    └── validation-report/route.ts # Comprehensive reporting API

/apps/web/src/lib/security/
└── rate-limit.ts                # Rate limiting utility

/packages/db/src/constants/
└── import-config.ts             # Configuration constants
```

## Next Steps for Implementation
1. **Frontend Components**: Build React components for validation UI
2. **Column Mapping Interface**: Create drag-and-drop column mapping
3. **Real-time Validation**: WebSocket support for live validation feedback
4. **Error Visualization**: Enhanced error display with charts and graphs
5. **Export Features**: Export validation reports to PDF/Excel
6. **Performance Monitoring**: Add metrics collection and alerting

## Benefits
- **Improved Data Quality**: Comprehensive validation prevents bad data import
- **Better User Experience**: Clear error messages and suggestions
- **Performance**: Efficient processing of large files
- **Scalability**: Environment-driven configuration for different deployments
- **Maintainability**: Modular design with clear separation of concerns
- **Platform Support**: Robust support for multiple e-commerce platforms