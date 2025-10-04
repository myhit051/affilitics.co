# 🚀 Coolify Deployment Guide - Affilitics.co

คู่มือการ deploy Affilitics.co บน Coolify แบบครบถ้วน

---

## 📋 สิ่งที่ต้องเตรียม

### 1. Coolify Instance
- ✅ Coolify server พร้อมใช้งาน
- ✅ Domain name (optional แต่แนะนำ)
- ✅ SSL certificate (Coolify จัดการให้อัตโนมัติ)

### 2. Supabase Project
- ✅ Supabase project สร้างแล้ว
- ✅ Database URL
- ✅ API keys (anon key, service role key)
- ✅ Storage bucket สร้างแล้ว

### 3. Git Repository
- ✅ Code push ไปที่ GitHub/GitLab แล้ว
- ✅ Branch: `001-i-have-an` (หรือ `main`)

---

## 🔧 ขั้นตอนการ Deploy

### Step 1: สร้าง Project ใน Coolify

1. **เข้า Coolify Dashboard**
   - Login เข้า Coolify instance ของคุณ
   - คลิก "New Resource" → "Application"

2. **เชื่อมต่อ Git Repository**
   - เลือก Git provider (GitHub/GitLab)
   - เลือก repository: `affilitics.co`
   - เลือก branch: `001-i-have-an`

3. **กำหนดค่า Build**
   - **Build Type**: Docker Compose
   - **Dockerfile**: `Dockerfile`
   - **Docker Compose**: `docker-compose.yml`
   - **Port**: `3000`

### Step 2: ตั้งค่า Environment Variables

ใน Coolify, ไปที่ **Environment Variables** และเพิ่ม:

#### Required Variables

```bash
# Application
NODE_ENV=production
PORT=3000
APP_ORIGIN=https://your-domain.com

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE=eyJhbGc...
SUPABASE_STORAGE_BUCKET=affilitics-uploads

# Database
DATABASE_URL=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres

# Monitoring
ENABLE_METRICS=true
ERROR_REPORTING=true
LOG_LEVEL=info
ALERT_WEBHOOKS=https://hooks.slack.com/services/YOUR/WEBHOOK
```

#### Optional Variables (Performance Tuning)

```bash
# Worker Configuration
MAX_CONCURRENT_JOBS=10
MAX_QUEUE_SIZE=1000
MEMORY_WARNING_THRESHOLD=0.75
MEMORY_CRITICAL_THRESHOLD=0.90
HEALTH_CHECK_INTERVAL=60000

# Node.js
NODE_OPTIONS=--max_old_space_size=4096
NEXT_TELEMETRY_DISABLED=1
```

### Step 3: กำหนดค่า Domain (Optional)

1. ไปที่ **Domains** tab
2. เพิ่ม domain ของคุณ: `affilitics.yourdomain.com`
3. Coolify จะสร้าง SSL certificate อัตโนมัติ (Let's Encrypt)

### Step 4: Deploy

1. คลิก **Deploy** button
2. รอ build process (ประมาณ 5-10 นาที)
3. ตรวจสอบ logs ว่า deploy สำเร็จ

---

## 🏗️ โครงสร้าง Services

### Web Service (Next.js)
- **Port**: 3000
- **Health Check**: `/api/health`
- **Auto-restart**: enabled

### Worker Service (CSV Processing)
- **Background service**: ไม่มี port expose
- **Health Check**: process monitoring
- **Auto-restart**: enabled

---

## ✅ ตรวจสอบการ Deploy

### 1. Health Checks

```bash
# Web service
curl https://your-domain.com/api/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-10-04T...",
  "uptime": 123456
}
```

### 2. Worker Service

```bash
# Check worker health
curl https://your-domain.com/api/health/worker

# Expected response:
{
  "status": "online",
  "activeWorkers": 1,
  "queueLength": 0
}
```

### 3. Performance Metrics

```bash
# Check performance
curl https://your-domain.com/api/metrics/performance

# Should return metrics data
```

---

## 📊 Monitoring & Logs

### ดู Logs ใน Coolify

1. ไปที่ **Logs** tab
2. เลือก service (web หรือ worker)
3. ดู real-time logs

### Monitoring Endpoints

- **Health**: `https://your-domain.com/api/health`
- **Worker Health**: `https://your-domain.com/api/health/worker`
- **Performance**: `https://your-domain.com/api/metrics/performance`

### Alert Notifications

- Configure webhook URL ใน `ALERT_WEBHOOKS`
- รับ notifications เมื่อ:
  - Error rate > 5%
  - API response time > 500ms
  - Memory usage > 90%
  - Worker failures

---

## 🔄 การ Update/Redeploy

### Auto Deploy (Recommended)

1. Push code ไปที่ branch `001-i-have-an`
2. Coolify จะ detect และ deploy อัตโนมัติ
3. Zero-downtime deployment

### Manual Deploy

1. ไปที่ Coolify dashboard
2. เลือก application
3. คลิก **Redeploy**

---

## 🐛 Troubleshooting

### Build Fails

**ปัญหา**: Docker build failed

**แก้ไข**:
```bash
# ตรวจสอบ Dockerfile
# ดู build logs ใน Coolify
# ตรวจสอบ dependencies ใน package.json
```

### Service Won't Start

**ปัญหา**: Container starts แล้ว crash

**แก้ไข**:
1. ตรวจสอบ environment variables
2. ดู logs: `docker logs affilitics-web`
3. ตรวจสอบ DATABASE_URL ถูกต้อง

### High Memory Usage

**ปัญหา**: Container ใช้ memory มากเกินไป

**แก้ไข**:
```bash
# เพิ่ม memory limit
NODE_OPTIONS=--max_old_space_size=4096

# หรือ scale horizontal
# เพิ่ม instances ใน Coolify
```

### Database Connection Failed

**ปัญหา**: ต่อ Supabase ไม่ได้

**แก้ไข**:
1. ตรวจสอบ DATABASE_URL format:
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
   ```
2. ตรวจสอบ Supabase database accessible จาก Coolify server
3. ตรวจสอบ firewall rules

---

## 🔐 Security Checklist

### Pre-Deployment

- [ ] Environment variables ไม่มีใน Git
- [ ] Supabase RLS policies enabled
- [ ] Rate limiting configured
- [ ] SSL certificate active
- [ ] Secrets rotated (production keys)

### Post-Deployment

- [ ] ทดสอบ authentication flow
- [ ] ตรวจสอบ workspace isolation
- [ ] ทดสอบ file upload limits
- [ ] ตรวจสอบ error tracking ทำงาน
- [ ] Monitor metrics dashboard

---

## 📈 Performance Optimization

### Resource Allocation

**Recommended Server Specs:**
- **CPU**: 2 cores minimum (4 cores recommended)
- **RAM**: 4GB minimum (8GB recommended)
- **Storage**: 20GB minimum (SSD recommended)

### Scaling Strategies

**Horizontal Scaling** (Recommended):
1. ใน Coolify, เพิ่ม instances
2. Load balancer อัตโนมัติ
3. Session management with database

**Vertical Scaling**:
1. เพิ่ม CPU/RAM ของ server
2. Adjust NODE_OPTIONS memory limit

---

## 🎯 Next Steps After Deployment

1. **Monitor System**
   - ดู metrics dashboard
   - ตั้งค่า alert notifications
   - ตรวจสอบ logs เป็นประจำ

2. **Test Features**
   - CSV upload & processing
   - User authentication
   - Workspace isolation
   - Error handling

3. **Performance Tuning**
   - Monitor response times
   - Check memory usage
   - Optimize slow queries
   - Review worker performance

4. **Security Audit**
   - Test RLS policies
   - Verify authentication
   - Check rate limiting
   - Review audit logs

---

## 📞 Support Resources

### Documentation
- **Monitoring Guide**: `/docs/monitoring-observability-guide.md`
- **Implementation Report**: `/IMPLEMENTATION_COMPLETE_REPORT.md`
- **Quick Reference**: `/MONITORING_SUMMARY.md`

### Health Endpoints
- Web: `https://your-domain.com/api/health`
- Worker: `https://your-domain.com/api/health/worker`
- Metrics: `https://your-domain.com/api/metrics/performance`

### Logs Location
- Coolify: Dashboard → Logs tab
- Structured logs: Database `monitoring_logs` table
- Error tracking: Database `monitoring_errors` table

---

## 🚀 Quick Deploy Command

```bash
# Clone repo
git clone https://github.com/myhit051/affilitics.co.git
cd affilitics.co

# Checkout production branch
git checkout 001-i-have-an

# Copy environment file
cp .env.production.example .env.production

# Edit .env.production with your values
nano .env.production

# Deploy with Docker Compose (local test)
docker-compose up -d

# Check services
docker ps
docker logs affilitics-web
docker logs affilitics-worker
```

---

**🎉 Deploy สำเร็จ! Affilitics.co พร้อมใช้งานบน Coolify**

*Generated: October 4, 2025*
*Version: 1.0.0*
*Branch: 001-i-have-an*
