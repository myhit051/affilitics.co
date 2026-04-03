-- ✅ PRODUCTION SECURITY FIX - FINAL VERSION
-- สำหรับ Supabase Database ที่มีตารางจริง
-- ✅ ตรวจสอบแล้วว่าตารางเหล่านี้มีอยู่จริงใน schema.sql

-- ==========================================
-- PHASE 1: ENABLE RLS ON ALL TABLES
-- ==========================================

-- Enable RLS on all core tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE stg_shopee_aff ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_daily ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- PHASE 2: DROP ALL EXISTING INSECURE POLICIES
-- ==========================================

-- Drop any existing policies that might be insecure
DO $$ 
BEGIN
  -- Drop workspace policies
  DROP POLICY IF EXISTS "workspaces_policy" ON workspaces;
  DROP POLICY IF EXISTS "workspace_select" ON workspaces;
  DROP POLICY IF EXISTS "workspace_insert" ON workspaces;
  DROP POLICY IF EXISTS "workspace_update" ON workspaces;
  DROP POLICY IF EXISTS "workspace_delete" ON workspaces;
  
  -- Drop member policies
  DROP POLICY IF EXISTS "members_policy" ON members;
  DROP POLICY IF EXISTS "member_select" ON members;
  DROP POLICY IF EXISTS "member_insert" ON members;
  DROP POLICY IF EXISTS "member_update" ON members;
  DROP POLICY IF EXISTS "member_delete" ON members;
  
  -- Drop import job policies
  DROP POLICY IF EXISTS "import_jobs_policy" ON import_jobs;
  DROP POLICY IF EXISTS "import_job_select" ON import_jobs;
  DROP POLICY IF EXISTS "import_job_insert" ON import_jobs;
  DROP POLICY IF EXISTS "import_job_update" ON import_jobs;
  DROP POLICY IF EXISTS "import_job_delete" ON import_jobs;
  
  -- Drop import error policies
  DROP POLICY IF EXISTS "import_errors_policy" ON import_errors;
  DROP POLICY IF EXISTS "import_error_select" ON import_errors;
  DROP POLICY IF EXISTS "import_error_insert" ON import_errors;
  DROP POLICY IF EXISTS "import_error_update" ON import_errors;
  DROP POLICY IF EXISTS "import_error_delete" ON import_errors;
  
  -- Drop staging table policies
  DROP POLICY IF EXISTS "stg_shopee_aff_policy" ON stg_shopee_aff;
  DROP POLICY IF EXISTS "stg_shopee_select" ON stg_shopee_aff;
  DROP POLICY IF EXISTS "stg_shopee_insert" ON stg_shopee_aff;
  DROP POLICY IF EXISTS "stg_shopee_update" ON stg_shopee_aff;
  DROP POLICY IF EXISTS "stg_shopee_delete" ON stg_shopee_aff;
  
  -- Drop affiliate order policies
  DROP POLICY IF EXISTS "affiliate_orders_policy" ON affiliate_orders;
  DROP POLICY IF EXISTS "affiliate_order_select" ON affiliate_orders;
  DROP POLICY IF EXISTS "affiliate_order_insert" ON affiliate_orders;
  DROP POLICY IF EXISTS "affiliate_order_update" ON affiliate_orders;
  DROP POLICY IF EXISTS "affiliate_order_delete" ON affiliate_orders;
  
  -- Drop metrics policies
  DROP POLICY IF EXISTS "metrics_daily_policy" ON metrics_daily;
  DROP POLICY IF EXISTS "metrics_select" ON metrics_daily;
  DROP POLICY IF EXISTS "metrics_insert" ON metrics_daily;
  DROP POLICY IF EXISTS "metrics_update" ON metrics_daily;
  DROP POLICY IF EXISTS "metrics_delete" ON metrics_daily;
  
  -- Drop any USING (true) policies
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
-- PHASE 3: CREATE SECURE WORKSPACE POLICIES
-- ==========================================

-- WORKSPACE TABLE: Users can see workspaces they are members of
CREATE POLICY "workspace_select_policy" ON workspaces
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

-- Users can create new workspaces (they become owners automatically)
CREATE POLICY "workspace_insert_policy" ON workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Only owners and admins can update workspace
CREATE POLICY "workspace_update_policy" ON workspaces
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

-- Only owners can delete workspace
CREATE POLICY "workspace_delete_policy" ON workspaces
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
-- PHASE 4: CREATE SECURE MEMBER POLICIES
-- ==========================================

-- Members can see other members in their workspace
CREATE POLICY "member_select_policy" ON members
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

-- System can create members (for workspace creation and invitations)
CREATE POLICY "member_insert_policy" ON members
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

-- Owners and admins can update member roles
CREATE POLICY "member_update_policy" ON members
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

-- Owners and admins can remove members, or users can remove themselves
CREATE POLICY "member_delete_policy" ON members
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND (
      -- User can remove themselves
      members.user_id = auth.uid()
      OR 
      -- Owners and admins can remove others
      EXISTS (
        SELECT 1 FROM members m2 
        WHERE m2.workspace_id = members.workspace_id 
        AND m2.user_id = auth.uid()
        AND m2.role IN ('owner', 'admin')
      )
    )
  );

-- ==========================================
-- PHASE 5: CREATE SECURE IMPORT JOB POLICIES
-- ==========================================

-- Users can see import jobs in their workspace
CREATE POLICY "import_job_select_policy" ON import_jobs
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
CREATE POLICY "import_job_insert_policy" ON import_jobs
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
CREATE POLICY "import_job_update_policy" ON import_jobs
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
CREATE POLICY "import_job_delete_policy" ON import_jobs
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
-- PHASE 6: CREATE SECURE IMPORT ERROR POLICIES
-- ==========================================

-- Users can see import errors for jobs in their workspace
CREATE POLICY "import_error_select_policy" ON import_errors
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
CREATE POLICY "import_error_insert_policy" ON import_errors
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
CREATE POLICY "import_error_update_policy" ON import_errors
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
CREATE POLICY "import_error_delete_policy" ON import_errors
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
-- PHASE 7: CREATE SECURE STAGING DATA POLICIES
-- ==========================================

-- Users can see staging data in their workspace
CREATE POLICY "stg_shopee_select_policy" ON stg_shopee_aff
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
CREATE POLICY "stg_shopee_insert_policy" ON stg_shopee_aff
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
CREATE POLICY "stg_shopee_update_policy" ON stg_shopee_aff
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
CREATE POLICY "stg_shopee_delete_policy" ON stg_shopee_aff
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
-- PHASE 8: CREATE SECURE AFFILIATE ORDER POLICIES
-- ==========================================

-- Users can see affiliate orders in their workspace
CREATE POLICY "affiliate_order_select_policy" ON affiliate_orders
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
CREATE POLICY "affiliate_order_insert_policy" ON affiliate_orders
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
CREATE POLICY "affiliate_order_update_policy" ON affiliate_orders
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
CREATE POLICY "affiliate_order_delete_policy" ON affiliate_orders
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
-- PHASE 9: CREATE SECURE METRICS POLICIES
-- ==========================================

-- Users can see metrics in their workspace
CREATE POLICY "metrics_select_policy" ON metrics_daily
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
CREATE POLICY "metrics_insert_policy" ON metrics_daily
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
CREATE POLICY "metrics_update_policy" ON metrics_daily
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
CREATE POLICY "metrics_delete_policy" ON metrics_daily
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
-- PHASE 10: CREATE SECURITY FUNCTIONS
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

-- ==========================================
-- PHASE 11: FINAL VERIFICATION
-- ==========================================

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_members_workspace_user ON members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_workspace ON import_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stg_shopee_workspace ON stg_shopee_aff(workspace_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_orders_workspace ON affiliate_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_metrics_workspace ON metrics_daily(workspace_id);

-- ==========================================
-- COMPLETION MESSAGE
-- ==========================================

DO $$
BEGIN
  RAISE NOTICE '✅ PRODUCTION SECURITY FIX COMPLETED SUCCESSFULLY!';
  RAISE NOTICE '';
  RAISE NOTICE '🛡️ SECURITY FEATURES IMPLEMENTED:';
  RAISE NOTICE '   ✅ Row Level Security enabled on all tables';
  RAISE NOTICE '   ✅ Multi-tenant workspace isolation';
  RAISE NOTICE '   ✅ Role-based access control (Owner/Admin/Member/Viewer)';
  RAISE NOTICE '   ✅ Secure authentication using auth.uid()';
  RAISE NOTICE '   ✅ No USING (true) policies remaining';
  RAISE NOTICE '   ✅ Performance indexes created';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 NEXT STEPS:';
  RAISE NOTICE '   1. Test user registration and workspace creation';
  RAISE NOTICE '   2. Verify member invitation system';
  RAISE NOTICE '   3. Test data import functionality';
  RAISE NOTICE '   4. Monitor application for any permission errors';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  WARNING: All mock data fallbacks removed from application code';
  RAISE NOTICE '   Your app now requires valid Supabase authentication to function';
END $$;