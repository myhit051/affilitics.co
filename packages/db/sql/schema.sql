-- สร้างตารางหลัก
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('shopee','lazada','tiktok')),
  filename text NOT NULL,
  size bigint NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  hash text,
  UNIQUE (workspace_id, hash)
);

CREATE TABLE IF NOT EXISTS import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_no int NOT NULL,
  field text,
  message text NOT NULL,
  sample text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- staging Shopee (คอลัมน์ยืดหยุ่นตามไฟล์จริง ปรับเพิ่มได้)
CREATE TABLE IF NOT EXISTS stg_shopee_aff (
  id bigserial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  order_id text,
  subid text,
  order_time timestamptz,
  amount numeric(14,2),
  net numeric(14,2),
  commission numeric(14,2),
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stg_ws_job ON stg_shopee_aff(workspace_id, source_job_id);

CREATE TABLE IF NOT EXISTS affiliate_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform text NOT NULL,
  order_id text NOT NULL,
  subid text,
  event_date date NOT NULL,
  amount numeric(14,2),
  net numeric(14,2),
  commission numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform, order_id)
);

CREATE INDEX IF NOT EXISTS idx_aff_orders_ws_date ON affiliate_orders(workspace_id, event_date);

CREATE TABLE IF NOT EXISTS metrics_daily (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date date NOT NULL,
  platform text,
  subid text,
  orders integer,
  revenue numeric(14,2),
  commission numeric(14,2),
  PRIMARY KEY (workspace_id, date, coalesce(platform,''), coalesce(subid,''))
);
