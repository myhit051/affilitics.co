
# Affilitics — ลำดับการทำงานแบบ “เห็นผลงานไว” (Vertical Slices)

> เป้าหมาย: ให้ผู้ใช้ “อัปโหลดไฟล์ยอดขาย → เห็นสรุปเมตริกบนแดชบอร์ด” ได้จริง โดยเริ่มจาก 1 แพลตฟอร์ม (Shopee) แล้วค่อยขยายไป Lazada/TikTok  
> สแตก: Next.js (App Router) + Supabase (Postgres + RLS) + Prisma + Coolify + Queue/Worker (Node)  
> โหมด: Multi-tenant (workspace_id), RLS, Import pipeline, Metrics daily

---

## ภาพรวม Slice (เรียงก่อน–หลัง)
1) **Slice 0 — Foundation**: Auth/Workspace + RLS + โครงสร้าง Repo/CI/CD  
2) **Slice 1 — E2E Minimal**: อัปโหลด CSV Shopee → Parse/Validate → Insert staging → ดูประวัติ import  
3) **Slice 2 — Transform & Metrics**: จาก staging → transform → upsert fact → คำนวณ metrics_daily + Dashboard การ์ดสรุป  
4) **Slice 3 — UX & Hardening**: Progress/Retry/Idempotency, Error states, Rate limits, Observability  
5) **Slice 4 — ขยายแพลตฟอร์ม**: เพิ่ม Lazada/TikTok + สรุปเทียบข้ามแพลตฟอร์ม

> แนวทาง: แต่ละ Slice ต้อง “Deploy ได้จริง” และมี DoD ชัดเจน

---

## Slice 0 — Foundation (2–3 วัน)
### งานหลัก
- **Auth + Workspace**
  - ตาราง: `workspaces`, `members`, `users` (mapping กับ auth.users ของ Supabase)
  - Flow: สร้าง workspace, เชิญสมาชิก, สลับ workspace
- **RLS/Policies**
  - เปิด RLS ทุกตารางที่มีข้อมูลผู้ใช้ (รวม staging/fact/metrics)
  - JWT claim ต้องมี `workspace_id`, `role`
- **Repo / CI/CD / Env**
  - Monorepo: `apps/web` (Next.js), `apps/worker`, `packages/core` (สคีมา/ไทป์ร่วม)
  - Pipeline: build/test/scan/deploy (Coolify) + `.env.example` + การจัดการ secret
  - Seed script: สร้าง workspace ทดสอบ + ผู้ใช้ตัวอย่าง

### ตัวอย่าง RLS (ย่น)
```sql
ALTER TABLE affiliate_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sel_ws" ON affiliate_orders FOR SELECT USING (workspace_id = auth.jwt()->>'workspace_id');
CREATE POLICY "ins_ws" ON affiliate_orders FOR INSERT WITH CHECK (workspace_id = auth.jwt()->>'workspace_id');
CREATE POLICY "upd_ws" ON affiliate_orders FOR UPDATE USING (workspace_id = auth.jwt()->>'workspace_id');
```
### DoD
- ผู้ใช้ใหม่ล็อกอินได้, สร้าง workspace ได้, สลับ workspace ได้
- Dev ใหม่ clone แล้ว `docker compose up` / `pnpm dev` ใช้งานได้ ≤ 30 นาที
- RLS ทดสอบข้าม workspace แล้วถูกปฏิเสธ

---

## Slice 1 — E2E Minimal: Upload → Staging → History (2–4 วัน)
### งานหลัก
- **Frontend**
  - หน้า Import (เลือกแพลตฟอร์ม Shopee + อัปไฟล์ CSV)
  - แสดง *Upload History* (ชื่อไฟล์, ขนาด, สถานะ, เวลา, ผู้ทำ)
- **Backend (Next.js Route Handlers)**
  - `POST /api/import/upload` → รับไฟล์, เก็บ object storage, บันทึกตาราง `import_jobs`
  - ป้องกัน: 403 จาก CSRF/CORS → ใช้ `SameSite=Lax` + ตรวจ `Origin`/`X-CSRF-Token` (ถ้า cookie)
- **Worker**
  - คิวงาน (Rabbit/Redis BullMQ/pg-boss) อ่านไฟล์จาก storage → Parse (PapaParse/fast-csv) แบบ stream
  - ตรวจ header/encoding/delimiter → Map columns → เขียนลง `stg_shopee_aff`
  - บันทึก *row-level error* ลง `import_errors`
- **DB/ตาราง**
  - `import_jobs(id, workspace_id, platform, filename, size, status, created_by, started_at, finished_at, error)`
  - `stg_shopee_aff(..., workspace_id, source_job_id, raw_cols...)`
  - `import_errors(job_id, row_no, field, message, sample)`

### Idempotency
- ชนิดไฟล์เดียวกัน + hash เนื้อไฟล์ → ถ้าเคยประมวลผลสำเร็จแล้ว ให้เตือน/ถามยืนยัน

### DoD
- อัปโหลด CSV Shopee ได้จริง, job เปลี่ยนสถานะ `queued→processing→done/failed`
- ดู History & Error ได้, RLS บล็อกไม่ให้เห็นไฟล์ของ workspace อื่น
- รองรับไฟล์ 50–100K แถว (stream ไม่หลุด)

---

## Slice 2 — Transform → Fact → Metrics (3–5 วัน)
### งานหลัก
- **Transform SQL** (จากโน้ตเดิมของคุณ): รวม de-dup + upsert → fact table `affiliate_orders`
- **ฟังก์ชันคำนวณเมตริก**
  - `metrics_subid_daily(workspace_id, date_from, date_to)` และ/หรือ materialized view `metrics_daily`
  - กำหนด KPI: orders, gross, net, commission, AOV, CTR (ถ้ามี clicks), ROI (เมื่อเชื่อม ad_spend)
- **Backend API**
  - `POST /api/import/commit` → เรียก transform & refresh metrics สำหรับช่วงวันที่ของไฟล์
  - `GET /api/metrics/summary?from=&to=&platform=&subid=`
- **Frontend Dashboard**
  - การ์ดสรุป (ขายรวม, คอมมิชชั่นรวม, ค่าใช้จ่ายรวม*, กำไรเบื้องต้น*), กราฟแนวโน้ม, ตาราง by subid/platform
  - *หมายเหตุ: ค่าใช้จ่ายรวม/กำไรเบื้องต้น จะครบเมื่อเชื่อม `ad_spend` ใน Slice ถัดไป*

### DoD
- อัปโหลดไฟล์ → กด Commit → เห็นสรุปในแดชบอร์ดภายใน ≤ 2 นาที (50K rows)
- Query ทุกตัวกรองด้วย `workspace_id` ถูกต้อง, มี unit/integration test ขั้นต่ำ
- มี Explain plan/Index ที่จำเป็น (เช่น `(workspace_id, event_date)`)

---

## Slice 3 — UX & Hardening (2–3 วัน)
- Progress bar + Realtime status (SSE/WebSocket/DB polling)
- Retry job, Resume จากแถวล่าสุด, ป้องกัน upload ซ้ำ (hash + confirm)
- Rate limits: `/api/import/upload` per user/workspace
- Error states/Empty states/UI ระบุสาเหตุชัดเจน
- Observability: structured logs, request_id, metrics p95, error rate, job duration
- Backup ก่อน deploy migration สำคัญ + Rollback plan

**DoD:** สคริปต์ทดสอบโหลด (locust/k6) ผ่านตาม budget p95 (< 200–300ms สำหรับ API read), error < 1%

---

## Slice 4 — ขยายแพลตฟอร์ม & Enrichment (3–5 วัน)
- เพิ่ม parser **Lazada/TikTok** (ใช้ interface เดียวกับ Shopee)
- เชื่อม `ad_spend` (Facebook Ads ฯลฯ) → คำนวณ ROI/CAC
- รายงานเทียบแพลตฟอร์ม + SubID rollup
- Export CSV/Excel + แชร์ลิงก์ภายใน workspace
- ตั้ง cron/queue refresh metrics รายวัน

---

## โครงสร้างตารางหลัก (สรุป)
- `workspaces(id, name, plan, ...)`
- `members(id, user_id, workspace_id, role, ...)`
- `import_jobs(id, workspace_id, platform, filename, size, status, ...)`
- `stg_shopee_aff(..., workspace_id, source_job_id, ...)`
- `affiliate_orders(id, workspace_id, order_id, subid, platform, amount, net, commission, event_date, ...)`
- `metrics_daily(workspace_id, date, platform, subid, orders, revenue, commission, cost, profit, ...)`
- `import_errors(job_id, row_no, field, message, sample)`

---

## เช็คลิสต์ท้าย Slice (ทุกครั้งก่อนปิดงาน)
- [ ] API Spec อัปเดต (OpenAPI) + ตัวอย่าง payload
- [ ] Test: Unit + Integration (RLS/permission) + E2E (อัปโหลดจริง/commit/ดูแดชบอร์ด)
- [ ] Security: RLS ครบ, ตรวจ `workspace_id` ทุก query, idempotency, CSRF/CORS
- [ ] Observability: log/metrics/traces พร้อมแดชบอร์ด
- [ ] Release note + ถ้า schema เปลี่ยน → มี plan/rollback

---

## Quick Fixes จากปัญหาที่เคยเจอ (บริบทคุณ)
- **403 ที่ `/api/import/upload`**: มักมาจาก CSRF/CORS หรือไม่มี auth header/context
  - ใช้ `cookies` + `SameSite=Lax` หรือ `Authorization: Bearer` + ตรวจ `Origin`
  - ใน Next.js App Router: ทำ route ให้รับเฉพาะ `POST` + เช็ก `req.headers.get('origin')`
- **Supabase URL/Keys**: เก็บใน secret ของ Coolify, อย่า hardcode; เพิ่ม health check `/api/health`
- **RLS แผงลอย**: ลืม enable RLS ในตาราง staging/fact → ดึงข้าม workspace ได้ ให้เปิด RLS ทุกตาราง
- **ไฟล์ใหญ่**: ใช้ stream + แยก batch insert (COPY/UNNEST) + จำกัดขนาด/ชนิดไฟล์ในฝั่ง FE

---

## Definition of Done (โปรเจกต์ย่อยโดยรวมรอบแรก)
- ผู้ใช้สามารถ: สร้าง workspace → อัปโหลด CSV Shopee → commit → เห็นสรุปในแดชบอร์ด
- รองรับ 50–100K แถว/ไฟล์ในงบเวลาเหมาะสม
- มี RLS/permission ครบ + เทสต์ข้าม workspace
- มีแดชบอร์ดสังเกตการณ์ + Error logs ที่ตามรอยได้
- Deploy ด้วย Coolify ได้กดครั้งเดียว (env แยก Staging/Prod)

---

## Backlog ต่อไป (หลังรอบแรก)
- ล็อคอิน SSO, MFA, Organization billing (per seat/usage)
- งาน UI: ฟิลเตอร์ซับซ้อน, บันทึก view, แชร์รายงาน
- Enrichment: ผูกค่าใช้จ่ายโฆษณาอัตโนมัติ (FB/Google) + Attribution
- Data quality rules + anomaly detection
- Export/Sharing ผ่าน link ที่หมดอายุ + role-based watermark
