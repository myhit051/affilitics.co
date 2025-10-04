# Enhanced Worker Service

Worker service สำหรับ Affilitics.co ที่ประมวลผลไฟล์ CSV อย่างมีประสิทธิภาพ พร้อมระบบ monitoring และ error handling ที่ครบครัน

## Features

### ✅ Phase 3.4 Completed Tasks (T023-T027)

- **T023**: Streaming CSV parser with memory efficiency
- **T024**: Job retry logic with exponential backoff  
- **T025**: Worker health monitoring and heartbeat system
- **T026**: Enhanced error handling with user-friendly messages
- **T027**: Performance metrics collection in worker

### 🎯 Key Capabilities

1. **Memory-Efficient CSV Processing**
   - Streaming parser ที่ประมวลผลไฟล์ขนาดใหญ่ถึง 50MB
   - ใช้หน่วยความจำไม่เกิน 512MB
   - Batch processing พร้อม progress reporting

2. **Intelligent Retry System**
   - Exponential backoff strategy
   - สูงสุด 3 ครั้งการ retry
   - Smart error categorization

3. **Real-time Monitoring**
   - Heartbeat ทุก 30 วินาที
   - Health checks ทุก 5 วินาที
   - Performance metrics collection

4. **User-Friendly Error Handling**
   - ข้อความแสดงข้อผิดพลาดเป็นภาษาไทย
   - คำแนะนำการแก้ไขปัญหา
   - Error categorization และ severity levels

## Architecture

```
apps/worker/
├── processors/
│   ├── csv-stream.js       # T023: Streaming CSV parser
│   └── retry-handler.js    # T024: Retry logic with exponential backoff
├── services/
│   ├── health-monitor.js   # T025: Health monitoring & heartbeat
│   ├── metrics-collector.js # T027: Performance metrics collection
│   └── simple-job-service.js # Simple services for backend integration
├── utils/
│   └── error-formatter.js  # T026: Enhanced error handling
├── enhanced-worker.js      # Main integrated worker
├── index.js               # Legacy worker (backup)
└── test-*.js              # Test files
```

## Performance Targets ✅

- **Processing Speed**: ไฟล์ CSV 50MB ประมวลผลใน < 10 วินาที
- **Memory Usage**: < 512MB หน่วยความจำ
- **Throughput**: >100 rows/second
- **Error Rate**: < 1% (พร้อม auto-retry)

## Usage

### Development
```bash
# Start worker in development mode (with auto-restart)
npm run dev

# Run unit tests
npm run test

# Run integration tests  
npm run test:integration
```

### Production
```bash
# Start worker in production mode
npm start

# Use legacy worker (backup)
npm run legacy
```

## Configuration

Environment variables ที่จำเป็น:

```env
# Database
DATABASE_URL=postgresql://...

# Supabase
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE=...
SUPABASE_STORAGE_BUCKET=imports

# Worker Configuration (optional)
WORKER_ID=worker-1
HEARTBEAT_INTERVAL=30000
HEALTH_CHECK_INTERVAL=5000
MEMORY_THRESHOLD=536870912
CPU_THRESHOLD=80

# API Endpoints (optional)
HEALTH_ENDPOINT=https://api.example.com/health
METRICS_ENDPOINT=https://api.example.com/metrics
WORKER_API_KEY=...
```

## Monitoring

### Health Status
- `healthy`: ทุกอย่างปกติ
- `warning`: มีปัญหาเล็กน้อย (เช่น memory สูง)
- `critical`: มีปัญหาร้าย (เช่น memory เกินขีด)
- `unknown`: ไม่สามารถตรวจสอบได้

### Metrics Collected
- Job processing times
- CSV parsing performance  
- Database write performance
- Memory and CPU usage
- Error rates and retry statistics
- Throughput metrics

## Error Handling

### Error Categories
- `file_processing`: ปัญหาการประมวลผลไฟล์
- `network`: ปัญหาการเชื่อมต่อเครือข่าย
- `database`: ปัญหาฐานข้อมูล
- `memory`: ปัญหาหน่วยความจำ
- `validation`: ข้อมูลไม่ถูกต้อง
- `authentication`: ปัญหาการยืนยันตัวตน
- `timeout`: หมดเวลาการประมวลผล

### User-Friendly Messages
ข้อความแสดงข้อผิดพลาดเป็นภาษาไทยที่เข้าใจง่าย พร้อมคำแนะนำการแก้ไข

## Integration with Backend Infrastructure

Worker ได้รับการออกแบบให้เชื่อมต่อกับ Backend Infrastructure จาก Phase 3.3:

- **Job Management**: ใช้ SimpleJobService สำหรับจัดการ jobs
- **Metrics**: ส่งข้อมูล metrics ไปยัง API endpoints
- **Security**: ตรวจสอบ file access และ workspace permissions
- **Error Reporting**: รายงานข้อผิดพลาดผ่าน API

## Testing

### Unit Tests
```bash
npm run test
```
ทดสอบ services แต่ละตัวแยกกัน

### Integration Tests  
```bash
npm run test:integration
```
ทดสอบการทำงานร่วมกันของ services ทั้งหมด

### Manual Testing
```bash
# Start worker and monitor logs
npm run dev

# Check health status (in another terminal)
curl http://localhost:3000/api/health/worker
```

## Performance Optimization

1. **Memory Management**
   - Streaming processing แทน loading ทั้งไฟล์
   - Batch processing เพื่อลดการใช้หน่วยความจำ
   - Automatic garbage collection

2. **CPU Optimization**
   - Efficient CSV parsing with csv-parse library
   - Async/await patterns เพื่อ non-blocking operations
   - Rate limiting เพื่อป้องกัน CPU overload

3. **Database Performance**
   - Batch inserts แทน single-row inserts
   - Connection pooling
   - Prepared statements

## Troubleshooting

### Common Issues

1. **Worker ไม่เริ่มงาน**
   - ตรวจสอบ environment variables
   - ตรวจสอบ database connection
   - ดู logs สำหรับ error messages

2. **Processing ช้า**
   - ตรวจสอบ memory usage
   - ลด batch size ถ้า memory สูง
   - ตรวจสอบ database performance

3. **Jobs ล้มเหลวบ่อย**
   - ตรวจสอบ error categories
   - ดู retry statistics
   - ตรวจสอบ file formats

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm run dev

# Check memory usage
node --expose-gc enhanced-worker.js
```

## Future Enhancements

- Support สำหรับ platforms อื่น ๆ นอกจาก Shopee
- Advanced monitoring dashboard
- Auto-scaling based on job queue length
- Machine learning-based error prediction
- Real-time processing notifications