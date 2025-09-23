# Affilitics Starter — Slice 1–2 (Upload → Staging → Transform → Metrics)

โครงพร้อมใช้งานสำหรับสแตก: **Next.js (App Router) + Prisma + Supabase (Postgres + RLS + Storage)**  
เป้าหมาย: อัปโหลด CSV (Shopee) → ลง `stg_shopee_aff` → แปลงเป็น `affiliate_orders` → สรุป `metrics_daily`

## โครงสร้าง
- `apps/web` — Next.js + Route Handlers
- `apps/worker` — Worker ประมวลผลไฟล์ (poll ตาราง `import_jobs`)
- `packages/db/sql` — สคีมา + RLS + ฟังก์ชัน/วิวเมตริก
- `packages/db/prisma` — Prisma schema
- `.env.example` — ตัวอย่างตัวแปรแวดล้อม
- `docker-compose.yml` — ตัวอย่างรัน web+worker (เชื่อม Supabase ภายนอก)

> หมายเหตุ: ใช้ Supabase เป็น Auth/Storage/DB. Worker ต่อ Postgres ผ่าน `DATABASE_URL` (service role).

## เริ่มต้น
1) เติมคีย์จริงใน `.env` จาก `.env.example`
2) รัน SQL: `schema.sql` → `rls.sql` → `functions.sql`
3) Dev: `pnpm install` → `pnpm --filter @aff/web dev` และ `pnpm --filter @aff/worker dev`
4) Deploy: ปรับบริการใน Coolify ให้ web/worker ใช้ env เหมาะสม

## เส้นทางสำคัญ
- `POST /api/import/upload` — รับไฟล์ CSV, เซฟลง Supabase Storage + สร้าง `import_jobs`
- Worker จะอ่านงาน `import_jobs(status='queued')` → parse → เขียน `stg_shopee_aff` → อัปเดตสถานะ
- `POST /api/import/commit` — เรียก Transform + Refresh metrics ช่วงวันที่ที่เกี่ยวข้อง
- `GET /api/metrics/summary` — สรุปเมตริก (ช่วงวันที่/แพลตฟอร์ม/ซับไอดี)

## ความปลอดภัย
- เปิด **RLS** ทุกตารางข้อมูลผู้ใช้ (รวม staging/fact/metrics)
- ทุกคำสั่ง query ต้องมี `workspace_id`
- ตรวจ `Authorization: Bearer <jwt>` + header `x-workspace-id`
- สำหรับ production: เพิ่ม CSRF, Origin allowlist, และ Hardening อื่น ๆ ตามเช็คลิสต์หลัก
