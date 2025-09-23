-- เปิด RLS
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE stg_shopee_aff ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_daily ENABLE ROW LEVEL SECURITY;

-- นโยบายพื้นฐาน (อ่าน/เขียนจำกัดตาม workspace_id จาก JWT)
-- หมายเหตุ: ปรับชื่อฟังก์ชัน auth.jwt() ให้ตรงกับ Supabase (บน Supabase ใช้ auth.jwt())
-- เลือก workspace จาก claim 'workspace_id'

CREATE POLICY sel_ws_import_jobs ON import_jobs
FOR SELECT USING (workspace_id = auth.jwt()->>'workspace_id');
CREATE POLICY ins_ws_import_jobs ON import_jobs
FOR INSERT WITH CHECK (workspace_id = auth.jwt()->>'workspace_id');
CREATE POLICY upd_ws_import_jobs ON import_jobs
FOR UPDATE USING (workspace_id = auth.jwt()->>'workspace_id');

CREATE POLICY sel_ws_import_errors ON import_errors
FOR SELECT USING (job_id IN (SELECT id FROM import_jobs WHERE workspace_id = auth.jwt()->>'workspace_id'));
CREATE POLICY ins_ws_import_errors ON import_errors
FOR INSERT WITH CHECK (job_id IN (SELECT id FROM import_jobs WHERE workspace_id = auth.jwt()->>'workspace_id'));

CREATE POLICY sel_ws_stg_shopee ON stg_shopee_aff
FOR SELECT USING (workspace_id = auth.jwt()->>'workspace_id');
CREATE POLICY ins_ws_stg_shopee ON stg_shopee_aff
FOR INSERT WITH CHECK (workspace_id = auth.jwt()->>'workspace_id');

CREATE POLICY sel_ws_aff ON affiliate_orders
FOR SELECT USING (workspace_id = auth.jwt()->>'workspace_id');
CREATE POLICY ins_ws_aff ON affiliate_orders
FOR INSERT WITH CHECK (workspace_id = auth.jwt()->>'workspace_id');
CREATE POLICY upd_ws_aff ON affiliate_orders
FOR UPDATE USING (workspace_id = auth.jwt()->>'workspace_id');

CREATE POLICY sel_ws_metrics ON metrics_daily
FOR SELECT USING (workspace_id = auth.jwt()->>'workspace_id');
CREATE POLICY ins_ws_metrics ON metrics_daily
FOR INSERT WITH CHECK (workspace_id = auth.jwt()->>'workspace_id');
CREATE POLICY upd_ws_metrics ON metrics_daily
FOR UPDATE USING (workspace_id = auth.jwt()->>'workspace_id');
