# Monitoring & Observability System - คู่มือการใช้งาน

> ระบบติดตามและตรวจสอบประสิทธิภาพของ Affilitics.co แบบเรียลไทม์

## ภาพรวม

ระบบ Monitoring & Observability ที่สร้างขึ้นประกอบด้วย 5 ส่วนหลัก เพื่อให้มั่นใจว่าระบบมี uptime 99.5% และสามารถตรวจจับปัญหาได้อย่างรวดเร็ว

### ส่วนประกอบหลัก

1. **Error Tracking & Notification** - ติดตามและแจ้งเตือนข้อผิดพลาด
2. **Performance Metrics Dashboard** - รวบรวมข้อมูลประสิทธิภาพ
3. **System Health Monitoring** - ตรวจสอบสุขภาพของระบบอัตโนมัติ
4. **Alert Thresholds** - กำหนดเกณฑ์การแจ้งเตือน
5. **Structured Logging** - บันทึก log แบบมีโครงสร้าง

---

## 1. Error Tracking & Notification System

**ไฟล์**: `/packages/db/src/services/error-tracker.ts`

### ความสามารถ

- ✅ ติดตาม error แบบเรียลไทม์
- ✅ จัดกลุ่ม error ตามความรุนแรง (Critical, High, Medium, Low, Info)
- ✅ ส่ง notification ผ่าน Webhook
- ✅ สรุปสถิติ error และ top errors
- ✅ กรองการแจ้งเตือนซ้ำ (cooldown period)

### วิธีใช้งาน

```typescript
import { ErrorTracker, ErrorSeverity, ErrorCategory } from '@affilitics/db';

// บันทึก error
await ErrorTracker.trackError({
  severity: ErrorSeverity.CRITICAL,
  category: ErrorCategory.DATABASE,
  message: 'Database connection failed',
  stack: error.stack,
  context: {
    workspaceId: 'ws-123',
    userId: 'user-456'
  }
});

// ดูสถิติ error (24 ชั่วโมงที่ผ่านมา)
const stats = await ErrorTracker.getErrorStats('24h');
console.log(`Total errors: ${stats.totalErrors}`);
console.log(`Critical errors: ${stats.criticalErrors}`);

// ดู top errors
const topErrors = await ErrorTracker.getTopErrors('24h', 10);
```

### Alert Levels

- **CRITICAL**: ระบบล่ม, database failure, >10% error rate → แจ้งเตือนทันที
- **HIGH**: Feature ใช้งานไม่ได้, ประสิทธิภาพลดลงมาก → แจ้งเตือนหลัง 5 ครั้ง
- **MEDIUM**: ปัญหาบางส่วน, error ที่แก้ไขได้ → ไม่แจ้งเตือน (บันทึกเท่านั้น)
- **LOW/INFO**: ปัญหาเล็กน้อย → ไม่แจ้งเตือน

---

## 2. Performance Metrics Dashboard

**ไฟล์**: `/apps/web/src/lib/metrics-aggregator.ts`

### ข้อมูลที่รวบรวม

#### System Overview
- สถานะระบบ: Healthy / Degraded / Critical
- Uptime percentage
- จำนวน Active alerts
- Last incident

#### Performance Metrics
- API Response Time (average, P95, P99)
- CSV Processing Time
- Success Rate
- Throughput (jobs/hour)

#### System Resources
- Memory Usage (%)
- CPU Usage (%)
- Storage Usage (%)

#### Worker Metrics
- Active Workers
- Queue Length
- Processing Rate
- Average Job Time

#### Business Metrics
- Active Workspaces
- Total Users
- Monthly Active Users
- Storage Used

### วิธีใช้งาน

```typescript
import { MetricsAggregator } from '@/lib/metrics-aggregator';

// ดึงข้อมูล dashboard ทั้งหมด
const metrics = await MetricsAggregator.getDashboardMetrics('ws-123', '24h');

console.log('System Status:', metrics.overview.status);
console.log('API Response Time:', metrics.performance.apiResponseTime.average);
console.log('Active Workers:', metrics.workers.activeWorkers);

// ตรวจสอบสุขภาพระบบ
const health = await MetricsAggregator.getSystemHealth();
health.forEach(check => {
  console.log(`${check.component}: ${check.status} - ${check.message}`);
});

// ดู alert status
const alerts = await MetricsAggregator.getAlertStatus();
console.log(`Alert Level: ${alerts.level}`);
console.log(`Active Alerts: ${alerts.activeAlerts}`);
```

---

## 3. System Health Monitoring

**ไฟล์**: `/apps/worker/services/health-checker.js`

### Health Checks

ตรวจสอบทุก 1 นาที:

1. **Database Health** - ทดสอบการเชื่อมต่อและ response time
2. **Worker Service Health** - ตรวจสอบ worker instances และ heartbeat
3. **API Health** - ตรวจสอบ error rate และ response time
4. **External Dependencies** - ตรวจสอบ Supabase Storage และ services อื่นๆ
5. **System Resources** - ตรวจสอบ memory และ CPU usage
6. **Job Queue Health** - ตรวจสอบ queue backlog และ failure rate

### วิธีใช้งาน

```javascript
import { startHealthMonitoring, runHealthCheck } from './services/health-checker.js';

// เริ่มการตรวจสอบอัตโนมัติ (ทุก 1 นาที)
startHealthMonitoring();

// ตรวจสอบทันที
const result = await runHealthCheck();
console.log('System Status:', result.status);
result.checks.forEach(check => {
  console.log(`${check.component}: ${check.status}`);
});
```

### Health Status Levels

- **HEALTHY**: ทำงานปกติ
- **DEGRADED**: ประสิทธิภาพลดลง แต่ยังใช้งานได้
- **UNHEALTHY**: มีปัญหาร้ายแรง ต้องดำเนินการทันที
- **UNKNOWN**: ไม่สามารถตรวจสอบได้

---

## 4. Alert Threshold Configuration

**ไฟล์**: `/packages/db/src/config/alert-thresholds.ts`

### เกณฑ์การแจ้งเตือนตามหมวดหมู่

#### Performance Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| API Response Time | >500ms | >1000ms |
| API Error Rate | >5% | >10% |
| CSV Processing Time | >15s | >30s |
| CSV Success Rate | <95% | <90% |
| Throughput | <20 jobs/hr | <10 jobs/hr |

#### Resource Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Memory Usage | >75% | >90% |
| CPU Usage | >75% | >90% |
| Storage Usage | >80% | >90% |
| Active Connections | >70 | >90 |
| Queue Length | >100 jobs | >200 jobs |

#### Worker Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Active Workers | <2 | <1 |
| Worker Error Rate | >10% | >15% |
| Job Failure Rate | >5% | >10% |
| Heartbeat Age | >2 min | >5 min |

#### Error Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Total Errors/Hour | >50 | >100 |
| Critical Errors/Hour | >2 | >5 |
| Error Rate % | >5% | >10% |

### วิธีใช้งาน

```typescript
import { AlertThresholdManager, checkThreshold } from '@affilitics/db';

// ตรวจสอบว่า metric เกินเกณฑ์หรือไม่
const result = checkThreshold(
  'performance',
  'apiResponseTime',
  750, // current value
  false // inverted threshold
);

if (result.exceeded) {
  console.log(`Alert! ${result.severity} - Response time: 750ms (threshold: ${result.threshold}ms)`);
}

// ดึงค่า threshold
const config = AlertThresholdManager.getConfig();
console.log('Critical API response time:', config.performance.apiResponseTime.critical);

// อัพเดท threshold (ถ้าจำเป็น)
AlertThresholdManager.updateConfig({
  performance: {
    apiResponseTime: {
      critical: 2000, // เพิ่มเป็น 2 วินาที
      warning: 1000,
      info: 500
    }
  }
});
```

---

## 5. Structured Logging System

**ไฟล์**: `/packages/db/src/services/logger.ts`

### Log Levels

- **DEBUG**: ข้อมูลเพื่อ debugging
- **INFO**: ข้อมูลทั่วไป
- **WARN**: คำเตือน
- **ERROR**: ข้อผิดพลาด
- **FATAL**: ข้อผิดพลาดร้ายแรง

### วิธีใช้งาน

```typescript
import Logger, { log, LogLevel } from '@affilitics/db';

// การใช้งานพื้นฐาน
log.info('User logged in successfully', { userId: 'user-123' });
log.warn('High memory usage detected', { memoryUsage: 85 });
log.error('Failed to process CSV file', error, { jobId: 'job-456' });

// สร้าง child logger พร้อม context
const workerLogger = Logger.child({
  service: 'csv-worker',
  workspaceId: 'ws-789'
});

workerLogger.info('Processing started', { fileName: 'data.csv' });
workerLogger.error('Processing failed', error);

// Query logs
const logs = await Logger.queryLogs({
  level: LogLevel.ERROR,
  workspaceId: 'ws-789',
  startTime: new Date('2025-10-01'),
  limit: 100
});

// ดูสถิติ logs
const stats = await Logger.getStatistics();
console.log('Total logs:', stats.total);
console.log('Errors:', stats.byLevel.error);
```

### Log Context Fields

- `service` - ชื่อ service (web, worker, api)
- `workspaceId` - Workspace ID
- `userId` - User ID
- `requestId` - Request ID (สำหรับติดตาม request)
- `sessionId` - Session ID
- `jobId` - Job ID (สำหรับ CSV processing)
- `correlationId` - Correlation ID (ติดตามข้ามหลาย services)

---

## การติดตั้งและการใช้งาน

### 1. ตั้งค่า Environment Variables

เพิ่มใน `.env`:

```bash
# Monitoring Configuration
ENABLE_METRICS=true
ERROR_REPORTING=true
LOG_LEVEL=info
ALERT_WEBHOOKS=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Worker Configuration
WORKER_HEALTH_CHECK_INTERVAL=60000  # 1 minute
WORKER_HEARTBEAT_INTERVAL=30000     # 30 seconds
```

### 2. เริ่มต้นใช้งานใน Worker

```javascript
// apps/worker/enhanced-worker.js
import { startHealthMonitoring } from './services/health-checker.js';
import Logger from '@affilitics/db';

// Initialize logger
Logger.initialize({
  level: 'info',
  context: { service: 'csv-worker' }
});

// Start health monitoring
startHealthMonitoring();

Logger.info('Worker started successfully');
```

### 3. ใช้งานใน API Routes

```typescript
// apps/web/src/app/api/some-route/route.ts
import { ErrorTracker, ErrorSeverity, ErrorCategory, log } from '@affilitics/db';

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  log.info('Processing request', { requestId });

  try {
    // Your code here
    return Response.json({ success: true });
  } catch (error) {
    // Track error
    await ErrorTracker.trackError({
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.API,
      message: 'Request processing failed',
      stack: error.stack,
      context: { requestId }
    });

    log.error('Request failed', error, { requestId });

    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

## การทดสอบระบบ Monitoring

### Test Error Tracking

```typescript
// ทดสอบการบันทึก error
await ErrorTracker.trackError({
  severity: ErrorSeverity.WARNING,
  category: ErrorCategory.SYSTEM,
  message: 'Test error for monitoring',
  context: { test: true }
});

// ตรวจสอบว่าบันทึกสำเร็จ
const stats = await ErrorTracker.getErrorStats('1h');
console.log('Recent errors:', stats.totalErrors);
```

### Test Health Checks

```javascript
import { runHealthCheck } from './services/health-checker.js';

const health = await runHealthCheck();
console.log('Health check results:', health);

// ควรเห็นผลลัพธ์:
// {
//   status: 'healthy',
//   checks: [
//     { component: 'Database', status: 'healthy', message: '...' },
//     { component: 'Worker Service', status: 'healthy', message: '...' },
//     ...
//   ]
// }
```

### Test Metrics Collection

```typescript
import { MetricsAggregator } from '@/lib/metrics-aggregator';

const metrics = await MetricsAggregator.getDashboardMetrics();
console.log('Dashboard metrics:', metrics);
```

---

## Dashboard API Endpoints

สร้าง API endpoints เพื่อเข้าถึงข้อมูล monitoring:

### GET /api/monitoring/dashboard

```typescript
// apps/web/src/app/api/monitoring/dashboard/route.ts
import { MetricsAggregator } from '@/lib/metrics-aggregator';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get('timeRange') || '24h';

  const metrics = await MetricsAggregator.getDashboardMetrics(undefined, timeRange);
  return Response.json(metrics);
}
```

### GET /api/monitoring/health

```typescript
// apps/web/src/app/api/monitoring/health/route.ts
import { MetricsAggregator } from '@/lib/metrics-aggregator';

export async function GET(request: Request) {
  const health = await MetricsAggregator.getSystemHealth();
  return Response.json(health);
}
```

### GET /api/monitoring/errors

```typescript
// apps/web/src/app/api/monitoring/errors/route.ts
import { ErrorTracker } from '@affilitics/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get('timeRange') || '24h';

  const stats = await ErrorTracker.getErrorStats(timeRange);
  return Response.json(stats);
}
```

---

## Best Practices

### 1. Error Tracking

- ✅ ใช้ severity ที่เหมาะสม (Critical เฉพาะปัญหาร้ายแรง)
- ✅ ระบุ category ที่ถูกต้อง
- ✅ เพิ่ม context ที่เป็นประโยชน์ (workspaceId, userId, jobId)
- ✅ ส่ง stack trace สำหรับ debugging

### 2. Logging

- ✅ ใช้ log level ที่เหมาะสม
- ✅ เพิ่ม context ที่สำคัญ
- ✅ หลีกเลี่ยงการ log sensitive data (passwords, tokens)
- ✅ ใช้ structured logging (JSON format)

### 3. Health Monitoring

- ✅ ตรวจสอบทุก critical components
- ✅ ตั้งค่า timeout ที่เหมาะสม
- ✅ แจ้งเตือนเมื่อ component unhealthy
- ✅ เก็บประวัติ health checks

### 4. Alert Thresholds

- ✅ ตั้งค่า threshold ตามข้อมูลจริง
- ✅ ทบทวนและปรับ threshold เป็นระยะ
- ✅ หลีกเลี่ยง alert fatigue (แจ้งเตือนมากเกินไป)
- ✅ มี escalation policy ที่ชัดเจน

---

## Monitoring Checklist สำหรับ Production

- [ ] ตั้งค่า webhook สำหรับ critical alerts
- [ ] กำหนด log retention policy (เช่น 30 วัน)
- [ ] สร้าง dashboard สำหรับ monitoring metrics
- [ ] ทดสอบ alert notifications
- [ ] ตั้งค่า automated health checks
- [ ] เตรียม runbook สำหรับ incident response
- [ ] กำหนด on-call rotation
- [ ] Review metrics และ thresholds เป็นประจำ

---

## สรุป

ระบบ Monitoring & Observability ที่สร้างขึ้นมีความสามารถครบถ้วนเพื่อ:

✅ ตรวจจับปัญหาได้อย่างรวดเร็ว (Real-time error tracking)
✅ วิเคราะห์ประสิทธิภาพได้อย่างละเอียด (Performance metrics)
✅ ติดตามสุขภาพระบบอัตโนมัติ (Automated health checks)
✅ แจ้งเตือนเมื่อมีปัญหา (Intelligent alerting)
✅ Debug ได้ง่ายด้วย structured logs (Centralized logging)

ระบบนี้จะช่วยให้ Affilitics.co บรรลุเป้าหมาย **99.5% uptime SLA** และสามารถตอบสนองต่อปัญหาได้อย่างรวดเร็วและมีประสิทธิภาพ
