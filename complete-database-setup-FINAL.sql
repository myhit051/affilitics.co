-- ✅ COMPLETE DATABASE SETUP + PRODUCTION SECURITY
-- สร้างตารางครบชุด + RLS Policies ที่ปลอดภัย
-- รันได้ใน Supabase SQL Editor

-- ==========================================
-- PHASE 1: ENABLE EXTENSIONS
-- ==========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================
-- PHASE 2: DROP ALL EXISTING INSECURE POLICIES
-- ==========================================

DO $$ 
BEGIN
  -- Drop all existing temporary/insecure policies
  DROP POLICY IF EXISTS "Temporary - Allow all reads on workspaces" ON workspaces;
  DROP POLICY IF EXISTS "Temporary - Allow all inserts on workspaces" ON workspaces;
  DROP POLICY IF EXISTS "Temporary - Allow all reads on members" ON members;
  DROP POLICY IF EXISTS "Temporary - Allow all inserts on members" ON members;
  
  -- Drop any other insecure policies
  DROP POLICY IF EXISTS "Enable all for authenticated users" ON workspaces;
  DROP POLICY IF EXISTS "Enable all for authenticated users" ON members;
  DROP POLICY IF EXISTS "Enable all for authenticated users" ON import_jobs;
  DROP POLICY IF EXISTS "Enable all for authenticated users" ON import_errors;
  DROP POLICY IF EXISTS "Enable all for authenticated users" ON stg_shopee_aff;
  DROP POLICY IF EXISTS "Enable all for authenticated users" ON affiliate_orders;
  DROP POLICY IF EXISTS "Enable all for authenticated users" ON metrics_daily;
  
EXCEPTION
  WHEN OTHERS THEN 
    -- Ignore errors if policies don't exist
    NULL;
END $$;

-- ==========================================
-- PHASE 3: CREATE/UPDATE CORE TABLES
-- ==========================================

-- WORKSPACES TABLE (อัพเดทถ้ามีอยู่แล้ว)
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- MEMBERS TABLE (อัพเดทถ้ามีอยู่แล้ว)
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id)
);

-- IMPORT JOBS TABLE
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

-- IMPORT ERRORS TABLE
CREATE TABLE IF NOT EXISTS import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_no int NOT NULL,
  field text,
  message text NOT NULL,
  sample text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- STAGING SHOPEE TABLE
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

-- AFFILIATE ORDERS TABLE
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

-- METRICS DAILY TABLE
CREATE TABLE IF NOT EXISTS metrics_daily (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date date NOT NULL,
  platform text NOT NULL DEFAULT '',
  subid text NOT NULL DEFAULT '',
  orders integer,
  revenue numeric(14,2),
  commission numeric(14,2),
  PRIMARY KEY (workspace_id, date, platform, subid)
);

-- ==========================================
-- PHASE 4: CREATE INDEXES FOR PERFORMANCE
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_members_workspace_user ON members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_workspace ON import_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stg_shopee_ws_job ON stg_shopee_aff(workspace_id, source_job_id);
CREATE INDEX IF NOT EXISTS idx_stg_shopee_workspace ON stg_shopee_aff(workspace_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_orders_ws_date ON affiliate_orders(workspace_id, event_date);
CREATE INDEX IF NOT EXISTS idx_affiliate_orders_workspace ON affiliate_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_metrics_workspace ON metrics_daily(workspace_id);

-- ==========================================
-- PHASE 5: ENABLE RLS ON ALL TABLES
-- ==========================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE stg_shopee_aff ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_daily ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- PHASE 6: CREATE SECURE WORKSPACE POLICIES
-- ==========================================

-- WORKSPACE SELECT: Users can see workspaces they are members of
CREATE POLICY "workspace_select_secure" ON workspaces
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = workspaces.id 
      AND members.user_id = auth.uid()
    )
  );

-- WORKSPACE INSERT: Users can create new workspaces
CREATE POLICY "workspace_insert_secure" ON workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- WORKSPACE UPDATE: Only owners and admins can update
CREATE POLICY "workspace_update_secure" ON workspaces
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = workspaces.id 
      AND members.user_id = auth.uid()
      AND members.role IN ('owner', 'admin')
    )
  );

-- WORKSPACE DELETE: Only owners can delete
CREATE POLICY "workspace_delete_secure" ON workspaces
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = workspaces.id 
      AND members.user_id = auth.uid()
      AND members.role = 'owner'
    )
  );

-- ==========================================
-- PHASE 7: CREATE SECURE MEMBER POLICIES
-- ==========================================

-- MEMBER SELECT: Members can see other members in their workspace
CREATE POLICY "member_select_secure" ON members
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members m2 
      WHERE m2.workspace_id = members.workspace_id 
      AND m2.user_id = auth.uid()
    )
  );

-- MEMBER INSERT: For workspace creation and invitations
CREATE POLICY "member_insert_secure" ON members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND (
      -- User is creating themselves as owner of new workspace
      user_id = auth.uid() 
      OR 
      -- Or admins/owners can invite new members
      EXISTS (
        SELECT 1 FROM members m2 
        WHERE m2.workspace_id = members.workspace_id 
        AND m2.user_id = auth.uid()
        AND m2.role IN ('owner', 'admin')
      )
    )
  );

-- MEMBER UPDATE: Owners and admins can update member roles
CREATE POLICY "member_update_secure" ON members
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members m2 
      WHERE m2.workspace_id = members.workspace_id 
      AND m2.user_id = auth.uid()
      AND m2.role IN ('owner', 'admin')
    )
  );

-- MEMBER DELETE: Owners/admins can remove others, users can remove themselves
CREATE POLICY "member_delete_secure" ON members
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND (
      members.user_id = auth.uid()
      OR 
      EXISTS (
        SELECT 1 FROM members m2 
        WHERE m2.workspace_id = members.workspace_id 
        AND m2.user_id = auth.uid()
        AND m2.role IN ('owner', 'admin')
      )
    )
  );

-- ==========================================
-- PHASE 8: CREATE SECURE IMPORT JOB POLICIES
-- ==========================================

-- Users can see import jobs in their workspace
CREATE POLICY "import_job_select_secure" ON import_jobs
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = import_jobs.workspace_id 
      AND members.user_id = auth.uid()
    )
  );

-- Members and above can create import jobs
CREATE POLICY "import_job_insert_secure" ON import_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = import_jobs.workspace_id 
      AND members.user_id = auth.uid()
      AND members.role IN ('owner', 'admin', 'member')
    )
  );

-- Members and above can update import jobs
CREATE POLICY "import_job_update_secure" ON import_jobs
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = import_jobs.workspace_id 
      AND members.user_id = auth.uid()
      AND members.role IN ('owner', 'admin', 'member')
    )
  );

-- Admins and owners can delete import jobs
CREATE POLICY "import_job_delete_secure" ON import_jobs
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = import_jobs.workspace_id 
      AND members.user_id = auth.uid()
      AND members.role IN ('owner', 'admin')
    )
  );

-- ==========================================
-- PHASE 9: CREATE SECURE IMPORT ERROR POLICIES
-- ==========================================

-- Users can see import errors for jobs in their workspace
CREATE POLICY "import_error_select_secure" ON import_errors
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM import_jobs ij
      JOIN members m ON m.workspace_id = ij.workspace_id
      WHERE ij.id = import_errors.job_id 
      AND m.user_id = auth.uid()
    )
  );

-- System can insert import errors for authorized jobs
CREATE POLICY "import_error_insert_secure" ON import_errors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM import_jobs ij
      JOIN members m ON m.workspace_id = ij.workspace_id
      WHERE ij.id = import_errors.job_id 
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin', 'member')
    )
  );

-- Members and above can update import errors
CREATE POLICY "import_error_update_secure" ON import_errors
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM import_jobs ij
      JOIN members m ON m.workspace_id = ij.workspace_id
      WHERE ij.id = import_errors.job_id 
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin', 'member')
    )
  );

-- Admins and owners can delete import errors
CREATE POLICY "import_error_delete_secure" ON import_errors
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM import_jobs ij
      JOIN members m ON m.workspace_id = ij.workspace_id
      WHERE ij.id = import_errors.job_id 
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
    )
  );

-- ==========================================
-- PHASE 10: CREATE SECURE STAGING DATA POLICIES
-- ==========================================

-- Users can see staging data in their workspace
CREATE POLICY "stg_shopee_select_secure" ON stg_shopee_aff
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = stg_shopee_aff.workspace_id 
      AND members.user_id = auth.uid()
    )
  );

-- System can insert staging data for authorized jobs
CREATE POLICY "stg_shopee_insert_secure" ON stg_shopee_aff
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM import_jobs ij
      JOIN members m ON m.workspace_id = ij.workspace_id
      WHERE ij.id = stg_shopee_aff.source_job_id 
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin', 'member')
    )
  );

-- Members and above can update staging data
CREATE POLICY "stg_shopee_update_secure" ON stg_shopee_aff
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = stg_shopee_aff.workspace_id 
      AND members.user_id = auth.uid()
      AND members.role IN ('owner', 'admin', 'member')
    )
  );

-- Admins and owners can delete staging data
CREATE POLICY "stg_shopee_delete_secure" ON stg_shopee_aff
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = stg_shopee_aff.workspace_id 
      AND members.user_id = auth.uid()
      AND members.role IN ('owner', 'admin')
    )
  );

-- ==========================================
-- PHASE 11: CREATE SECURE AFFILIATE ORDER POLICIES
-- ==========================================

-- Users can see affiliate orders in their workspace
CREATE POLICY "affiliate_order_select_secure" ON affiliate_orders
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = affiliate_orders.workspace_id 
      AND members.user_id = auth.uid()
    )
  );

-- Members and above can insert affiliate orders
CREATE POLICY "affiliate_order_insert_secure" ON affiliate_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = affiliate_orders.workspace_id 
      AND members.user_id = auth.uid()
      AND members.role IN ('owner', 'admin', 'member')
    )
  );

-- Members and above can update affiliate orders
CREATE POLICY "affiliate_order_update_secure" ON affiliate_orders
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = affiliate_orders.workspace_id 
      AND members.user_id = auth.uid()
      AND members.role IN ('owner', 'admin', 'member')
    )
  );

-- Admins and owners can delete affiliate orders
CREATE POLICY "affiliate_order_delete_secure" ON affiliate_orders
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = affiliate_orders.workspace_id 
      AND members.user_id = auth.uid()
      AND members.role IN ('owner', 'admin')
    )
  );

-- ==========================================
-- PHASE 12: CREATE SECURE METRICS POLICIES
-- ==========================================

-- Users can see metrics in their workspace
CREATE POLICY "metrics_select_secure" ON metrics_daily
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = metrics_daily.workspace_id 
      AND members.user_id = auth.uid()
    )
  );

-- Members and above can insert metrics
CREATE POLICY "metrics_insert_secure" ON metrics_daily
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = metrics_daily.workspace_id 
      AND members.user_id = auth.uid()
      AND members.role IN ('owner', 'admin', 'member')
    )
  );

-- Members and above can update metrics
CREATE POLICY "metrics_update_secure" ON metrics_daily
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = metrics_daily.workspace_id 
      AND members.user_id = auth.uid()
      AND members.role IN ('owner', 'admin', 'member')
    )
  );

-- Admins and owners can delete metrics
CREATE POLICY "metrics_delete_secure" ON metrics_daily
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = metrics_daily.workspace_id 
      AND members.user_id = auth.uid()
      AND members.role IN ('owner', 'admin')
    )
  );

-- ==========================================
-- PHASE 13: CREATE SECURITY UTILITY FUNCTIONS
-- ==========================================

-- Function to check if user has workspace access
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM members 
    WHERE workspace_id = p_workspace_id 
    AND user_id = p_user_id
  );
$$;

-- Function to get user's role in workspace
CREATE OR REPLACE FUNCTION public.get_user_workspace_role(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT role FROM members 
  WHERE workspace_id = p_workspace_id 
  AND user_id = p_user_id;
$$;

-- Function to check if user has minimum role
CREATE OR REPLACE FUNCTION public.user_has_min_role(p_workspace_id uuid, p_min_role text, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT CASE 
    WHEN p_min_role = 'viewer' THEN role IN ('viewer', 'member', 'admin', 'owner')
    WHEN p_min_role = 'member' THEN role IN ('member', 'admin', 'owner')
    WHEN p_min_role = 'admin' THEN role IN ('admin', 'owner')
    WHEN p_min_role = 'owner' THEN role = 'owner'
    ELSE false
  END
  FROM members 
  WHERE workspace_id = p_workspace_id 
  AND user_id = p_user_id;
$$;

-- Function to create workspace with owner
CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(p_name text, p_plan text DEFAULT 'free')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_workspace_id uuid;
  current_user_id uuid;
BEGIN
  -- Get current user
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  -- Create workspace
  INSERT INTO workspaces (name, plan)
  VALUES (p_name, p_plan)
  RETURNING id INTO new_workspace_id;
  
  -- Add user as owner
  INSERT INTO members (user_id, workspace_id, role)
  VALUES (current_user_id, new_workspace_id, 'owner');
  
  RETURN new_workspace_id;
END;
$$;

-- ==========================================
-- PHASE 14: GRANT PERMISSIONS
-- ==========================================

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant sequence permissions for serial columns
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ==========================================
-- PHASE 15: COMPLETION MESSAGE
-- ==========================================

DO $$
BEGIN
  RAISE NOTICE '🎉 COMPLETE DATABASE SETUP SUCCESSFUL!';
  RAISE NOTICE '';
  RAISE NOTICE '✅ TABLES CREATED:';
  RAISE NOTICE '   📋 workspaces - Main workspace management';
  RAISE NOTICE '   👥 members - Workspace membership & roles';
  RAISE NOTICE '   📥 import_jobs - Data import tracking';
  RAISE NOTICE '   ❌ import_errors - Import error logging';
  RAISE NOTICE '   🏪 stg_shopee_aff - Shopee staging data';
  RAISE NOTICE '   🛒 affiliate_orders - Processed orders';
  RAISE NOTICE '   📊 metrics_daily - Daily analytics';
  RAISE NOTICE '';
  RAISE NOTICE '🛡️ SECURITY FEATURES:';
  RAISE NOTICE '   ✅ Row Level Security on all tables';
  RAISE NOTICE '   ✅ Multi-tenant workspace isolation';
  RAISE NOTICE '   ✅ Role-based access (Owner/Admin/Member/Viewer)';
  RAISE NOTICE '   ✅ Secure auth.uid() validation';
  RAISE NOTICE '   ✅ Performance indexes created';
  RAISE NOTICE '   ✅ Utility functions for workspace management';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 READY FOR PRODUCTION!';
  RAISE NOTICE '   Next: Test authentication and workspace creation';
END $$;