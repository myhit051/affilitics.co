-- Enhanced Row Level Security Policies for Affilitics.co
-- Security: Comprehensive workspace isolation and data protection
-- This file extends the base RLS policies with enhanced security measures

-- Enable RLS on all workspace-related tables if not already enabled
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE stg_shopee_aff ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_security_events ENABLE ROW LEVEL SECURITY;

-- Create enhanced security functions
CREATE OR REPLACE FUNCTION auth.workspace_id() RETURNS UUID AS $$
  SELECT COALESCE(
    auth.jwt()->>'workspace_id',
    current_setting('app.current_workspace_id', TRUE)
  )::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth.user_id() RETURNS UUID AS $$
  SELECT COALESCE(
    auth.jwt()->>'sub',
    current_setting('app.current_user_id', TRUE)
  )::UUID;
$$ LANGUAGE SQL STABLE;

-- Enhanced workspace access validation
CREATE OR REPLACE FUNCTION auth.has_workspace_access(workspace_id UUID, min_role TEXT DEFAULT 'viewer') RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM members 
    WHERE user_id = auth.user_id() 
    AND workspace_id = $1
    AND CASE min_role
      WHEN 'owner' THEN role = 'owner'
      WHEN 'admin' THEN role IN ('owner', 'admin')
      WHEN 'member' THEN role IN ('owner', 'admin', 'member')
      ELSE role IN ('owner', 'admin', 'member', 'viewer')
    END
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Enhanced function to check if user is workspace member with role validation
CREATE OR REPLACE FUNCTION auth.is_workspace_member(workspace_id UUID) RETURNS BOOLEAN AS $$
  SELECT auth.has_workspace_access($1, 'viewer');
$$ LANGUAGE SQL STABLE;

-- Enhanced function to check admin privileges
CREATE OR REPLACE FUNCTION auth.is_workspace_admin(workspace_id UUID) RETURNS BOOLEAN AS $$
  SELECT auth.has_workspace_access($1, 'admin');
$$ LANGUAGE SQL STABLE;

-- Enhanced function to check owner privileges
CREATE OR REPLACE FUNCTION auth.is_workspace_owner(workspace_id UUID) RETURNS BOOLEAN AS $$
  SELECT auth.has_workspace_access($1, 'owner');
$$ LANGUAGE SQL STABLE;

-- Security: Rate limiting tables
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  blocked BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL,
  workspace_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_access_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Enable RLS on security tables
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Security: Enhanced RLS policies for workspaces table
DROP POLICY IF EXISTS sel_ws_workspaces ON workspaces;
CREATE POLICY sel_ws_workspaces ON workspaces
FOR SELECT USING (
  -- Users can only see workspaces they are members of
  id IN (
    SELECT workspace_id 
    FROM members 
    WHERE user_id = auth.user_id()
  )
);

DROP POLICY IF EXISTS ins_ws_workspaces ON workspaces;
CREATE POLICY ins_ws_workspaces ON workspaces
FOR INSERT WITH CHECK (
  -- Only authenticated users can create workspaces
  auth.user_id() IS NOT NULL
);

DROP POLICY IF EXISTS upd_ws_workspaces ON workspaces;
CREATE POLICY upd_ws_workspaces ON workspaces
FOR UPDATE USING (
  -- Only workspace owners can update workspace details
  auth.is_workspace_owner(id)
);

DROP POLICY IF EXISTS del_ws_workspaces ON workspaces;
CREATE POLICY del_ws_workspaces ON workspaces
FOR DELETE USING (
  -- Only workspace owners can delete workspaces
  auth.is_workspace_owner(id)
);

-- Security: Enhanced RLS policies for members table
DROP POLICY IF EXISTS sel_ws_members ON members;
CREATE POLICY sel_ws_members ON members
FOR SELECT USING (
  -- Users can see members of workspaces they belong to
  workspace_id IN (
    SELECT workspace_id 
    FROM members m2 
    WHERE m2.user_id = auth.user_id()
  )
);

DROP POLICY IF EXISTS ins_ws_members ON members;
CREATE POLICY ins_ws_members ON members
FOR INSERT WITH CHECK (
  -- Only workspace admins can add new members
  auth.is_workspace_admin(workspace_id)
);

DROP POLICY IF EXISTS upd_ws_members ON members;
CREATE POLICY upd_ws_members ON members
FOR UPDATE USING (
  -- Admins can update member roles, users can update their own profile
  auth.is_workspace_admin(workspace_id) OR
  (user_id = auth.user_id() AND OLD.role = NEW.role)
);

DROP POLICY IF EXISTS del_ws_members ON members;
CREATE POLICY del_ws_members ON members
FOR DELETE USING (
  -- Admins can remove members, users can leave workspace themselves
  auth.is_workspace_admin(workspace_id) OR
  user_id = auth.user_id()
);

-- Security: Enhanced RLS policies for import_jobs
DROP POLICY IF EXISTS sel_ws_import_jobs ON import_jobs;
CREATE POLICY sel_ws_import_jobs ON import_jobs
FOR SELECT USING (
  auth.is_workspace_member(workspace_id)
);

DROP POLICY IF EXISTS ins_ws_import_jobs ON import_jobs;
CREATE POLICY ins_ws_import_jobs ON import_jobs
FOR INSERT WITH CHECK (
  auth.has_workspace_access(workspace_id, 'member') AND
  created_by = auth.user_id()
);

DROP POLICY IF EXISTS upd_ws_import_jobs ON import_jobs;
CREATE POLICY upd_ws_import_jobs ON import_jobs
FOR UPDATE USING (
  auth.has_workspace_access(workspace_id, 'member') AND
  (created_by = auth.user_id() OR auth.is_workspace_admin(workspace_id))
);

DROP POLICY IF EXISTS del_ws_import_jobs ON import_jobs;
CREATE POLICY del_ws_import_jobs ON import_jobs
FOR DELETE USING (
  auth.has_workspace_access(workspace_id, 'admin')
);

-- Security: Enhanced RLS policies for import_errors
DROP POLICY IF EXISTS sel_ws_import_errors ON import_errors;
CREATE POLICY sel_ws_import_errors ON import_errors
FOR SELECT USING (
  COALESCE(workspace_id, (
    SELECT ij.workspace_id 
    FROM import_jobs ij 
    WHERE ij.id = job_id
  )) IN (
    SELECT workspace_id 
    FROM members 
    WHERE user_id = auth.user_id()
  )
);

DROP POLICY IF EXISTS ins_ws_import_errors ON import_errors;
CREATE POLICY ins_ws_import_errors ON import_errors
FOR INSERT WITH CHECK (
  COALESCE(workspace_id, (
    SELECT ij.workspace_id 
    FROM import_jobs ij 
    WHERE ij.id = job_id
  )) IN (
    SELECT workspace_id 
    FROM members 
    WHERE user_id = auth.user_id()
  )
);

-- Security: Enhanced RLS policies for staging tables
DROP POLICY IF EXISTS sel_ws_stg_shopee ON stg_shopee_aff;
CREATE POLICY sel_ws_stg_shopee ON stg_shopee_aff
FOR SELECT USING (
  auth.is_workspace_member(workspace_id)
);

DROP POLICY IF EXISTS ins_ws_stg_shopee ON stg_shopee_aff;
CREATE POLICY ins_ws_stg_shopee ON stg_shopee_aff
FOR INSERT WITH CHECK (
  auth.has_workspace_access(workspace_id, 'member')
);

DROP POLICY IF EXISTS upd_ws_stg_shopee ON stg_shopee_aff;
CREATE POLICY upd_ws_stg_shopee ON stg_shopee_aff
FOR UPDATE USING (
  auth.has_workspace_access(workspace_id, 'member')
);

DROP POLICY IF EXISTS del_ws_stg_shopee ON stg_shopee_aff;
CREATE POLICY del_ws_stg_shopee ON stg_shopee_aff
FOR DELETE USING (
  auth.has_workspace_access(workspace_id, 'admin')
);

-- Security: Enhanced RLS policies for affiliate_orders
DROP POLICY IF EXISTS sel_ws_aff ON affiliate_orders;
CREATE POLICY sel_ws_aff ON affiliate_orders
FOR SELECT USING (
  auth.is_workspace_member(workspace_id)
);

DROP POLICY IF EXISTS ins_ws_aff ON affiliate_orders;
CREATE POLICY ins_ws_aff ON affiliate_orders
FOR INSERT WITH CHECK (
  auth.has_workspace_access(workspace_id, 'member')
);

DROP POLICY IF EXISTS upd_ws_aff ON affiliate_orders;
CREATE POLICY upd_ws_aff ON affiliate_orders
FOR UPDATE USING (
  auth.has_workspace_access(workspace_id, 'member')
);

DROP POLICY IF EXISTS del_ws_aff ON affiliate_orders;
CREATE POLICY del_ws_aff ON affiliate_orders
FOR DELETE USING (
  auth.has_workspace_access(workspace_id, 'admin')
);

-- Security: Enhanced RLS policies for metrics_daily
DROP POLICY IF EXISTS sel_ws_metrics ON metrics_daily;
CREATE POLICY sel_ws_metrics ON metrics_daily
FOR SELECT USING (
  auth.is_workspace_member(workspace_id)
);

DROP POLICY IF EXISTS ins_ws_metrics ON metrics_daily;
CREATE POLICY ins_ws_metrics ON metrics_daily
FOR INSERT WITH CHECK (
  auth.has_workspace_access(workspace_id, 'member')
);

DROP POLICY IF EXISTS upd_ws_metrics ON metrics_daily;
CREATE POLICY upd_ws_metrics ON metrics_daily
FOR UPDATE USING (
  auth.has_workspace_access(workspace_id, 'member')
);

DROP POLICY IF EXISTS del_ws_metrics ON metrics_daily;
CREATE POLICY del_ws_metrics ON metrics_daily
FOR DELETE USING (
  auth.has_workspace_access(workspace_id, 'admin')
);

-- Security: Enhanced RLS policies for audit_logs
DROP POLICY IF EXISTS sel_ws_audit_logs ON audit_logs;
CREATE POLICY sel_ws_audit_logs ON audit_logs
FOR SELECT USING (
  -- Only workspace admins can view audit logs
  auth.is_workspace_admin(workspace_id)
);

DROP POLICY IF EXISTS ins_ws_audit_logs ON audit_logs;
CREATE POLICY ins_ws_audit_logs ON audit_logs
FOR INSERT WITH CHECK (
  -- System and authenticated users can insert audit logs
  user_id = auth.user_id() AND
  auth.is_workspace_member(workspace_id)
);

-- No UPDATE or DELETE policies for audit_logs - they should be immutable

-- Security: Enhanced RLS policies for workspace_security_events
DROP POLICY IF EXISTS sel_ws_security_events ON workspace_security_events;
CREATE POLICY sel_ws_security_events ON workspace_security_events
FOR SELECT USING (
  -- Only workspace owners can view security events
  auth.is_workspace_owner(workspace_id)
);

DROP POLICY IF EXISTS ins_ws_security_events ON workspace_security_events;
CREATE POLICY ins_ws_security_events ON workspace_security_events
FOR INSERT WITH CHECK (
  -- System can always insert security events
  true
);

DROP POLICY IF EXISTS upd_ws_security_events ON workspace_security_events;
CREATE POLICY upd_ws_security_events ON workspace_security_events
FOR UPDATE USING (
  -- Only workspace owners can resolve security events
  auth.is_workspace_owner(workspace_id)
);

-- Security: RLS policies for rate_limits (system table)
CREATE POLICY sel_rate_limits ON rate_limits
FOR SELECT USING (
  -- Only system/service accounts can read rate limits
  auth.user_id() IS NULL OR
  current_setting('app.system_user', TRUE)::BOOLEAN = TRUE
);

CREATE POLICY ins_rate_limits ON rate_limits
FOR INSERT WITH CHECK (
  -- Only system can insert rate limit records
  true
);

CREATE POLICY upd_rate_limits ON rate_limits
FOR UPDATE USING (
  -- Only system can update rate limit records
  true
);

CREATE POLICY del_rate_limits ON rate_limits
FOR DELETE USING (
  -- Only system can delete expired rate limit records
  true
);

-- Security: RLS policies for user_sessions
CREATE POLICY sel_user_sessions ON user_sessions
FOR SELECT USING (
  -- Users can only see their own sessions
  user_id = auth.user_id()
);

CREATE POLICY ins_user_sessions ON user_sessions
FOR INSERT WITH CHECK (
  -- System can create sessions for any user
  true
);

CREATE POLICY upd_user_sessions ON user_sessions
FOR UPDATE USING (
  -- Users can update their own sessions
  user_id = auth.user_id()
);

CREATE POLICY del_user_sessions ON user_sessions
FOR DELETE USING (
  -- Users can delete their own sessions, system can delete any
  user_id = auth.user_id() OR
  current_setting('app.system_user', TRUE)::BOOLEAN = TRUE
);

-- Security: Create function to validate workspace access for API calls
CREATE OR REPLACE FUNCTION security.validate_workspace_request(
  p_workspace_id UUID,
  p_min_role TEXT DEFAULT 'viewer'
) RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user has access to the workspace
  IF NOT auth.has_workspace_access(p_workspace_id, p_min_role) THEN
    -- Log unauthorized access attempt
    INSERT INTO workspace_security_events (
      workspace_id,
      user_id,
      event_type,
      severity,
      description,
      details
    ) VALUES (
      p_workspace_id,
      auth.user_id(),
      'unauthorized_access',
      'high',
      'Attempted unauthorized workspace access',
      jsonb_build_object(
        'required_role', p_min_role,
        'workspace_id', p_workspace_id,
        'timestamp', NOW()
      )
    );
    
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Security: Create function to audit sensitive operations
CREATE OR REPLACE FUNCTION security.audit_operation(
  p_action TEXT,
  p_workspace_id UUID,
  p_details JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
  INSERT INTO audit_logs (
    workspace_id,
    user_id,
    action,
    details,
    ip_address,
    user_agent
  ) VALUES (
    p_workspace_id,
    auth.user_id(),
    p_action,
    p_details,
    current_setting('app.client_ip', TRUE)::INET,
    current_setting('app.user_agent', TRUE)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Security: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_members_user_workspace ON members(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_members_workspace_role ON members(workspace_id, role);
CREATE INDEX IF NOT EXISTS idx_import_jobs_workspace_status ON import_jobs(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_timestamp ON audit_logs(workspace_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_workspace_severity ON workspace_security_events(workspace_id, severity);

-- Security: Grant appropriate permissions
GRANT EXECUTE ON FUNCTION auth.workspace_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.has_workspace_access(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_workspace_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_workspace_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_workspace_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION security.validate_workspace_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION security.audit_operation(TEXT, UUID, JSONB) TO authenticated;

-- Create schema for security functions if it doesn't exist
CREATE SCHEMA IF NOT EXISTS security;

-- Security: Create comprehensive validation function
CREATE OR REPLACE FUNCTION security.comprehensive_workspace_check(
  p_workspace_id UUID,
  p_operation TEXT DEFAULT 'read',
  p_resource TEXT DEFAULT 'general'
) RETURNS TABLE (
  allowed BOOLEAN,
  user_role TEXT,
  reason TEXT
) AS $$
DECLARE
  v_user_id UUID := auth.user_id();
  v_membership RECORD;
  v_required_role TEXT;
BEGIN
  -- Check if user is authenticated
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'User not authenticated';
    RETURN;
  END IF;

  -- Get user membership details
  SELECT role, workspace_id INTO v_membership
  FROM members 
  WHERE user_id = v_user_id AND workspace_id = p_workspace_id;

  -- Check if user is member of workspace
  IF v_membership IS NULL THEN
    -- Log unauthorized access attempt
    PERFORM security.audit_operation(
      'unauthorized_workspace_access',
      p_workspace_id,
      jsonb_build_object(
        'operation', p_operation,
        'resource', p_resource,
        'reason', 'not_workspace_member'
      )
    );
    
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'User is not a member of this workspace';
    RETURN;
  END IF;

  -- Determine required role based on operation and resource
  v_required_role := CASE 
    WHEN p_operation IN ('delete', 'admin') THEN 'admin'
    WHEN p_operation IN ('write', 'update', 'create') THEN 'member'
    ELSE 'viewer'
  END;

  -- Special cases for sensitive resources
  IF p_resource IN ('security_events', 'workspace_settings') THEN
    v_required_role := 'owner';
  ELSIF p_resource IN ('audit_logs', 'member_management') THEN
    v_required_role := 'admin';
  END IF;

  -- Check role hierarchy
  IF (v_required_role = 'owner' AND v_membership.role != 'owner') OR
     (v_required_role = 'admin' AND v_membership.role NOT IN ('owner', 'admin')) OR
     (v_required_role = 'member' AND v_membership.role NOT IN ('owner', 'admin', 'member')) THEN
    
    -- Log insufficient permissions
    PERFORM security.audit_operation(
      'insufficient_permissions',
      p_workspace_id,
      jsonb_build_object(
        'operation', p_operation,
        'resource', p_resource,
        'user_role', v_membership.role,
        'required_role', v_required_role
      )
    );
    
    RETURN QUERY SELECT FALSE, v_membership.role, 'Insufficient permissions for this operation';
    RETURN;
  END IF;

  -- Access granted
  RETURN QUERY SELECT TRUE, v_membership.role, 'Access granted';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION security.comprehensive_workspace_check(UUID, TEXT, TEXT) TO authenticated;

-- Security: Create notification for security events
CREATE OR REPLACE FUNCTION notify_security_event() RETURNS TRIGGER AS $$
BEGIN
  -- Notify application of high/critical security events
  IF NEW.severity IN ('critical', 'high') THEN
    PERFORM pg_notify(
      'security_alert',
      json_build_object(
        'workspace_id', NEW.workspace_id,
        'event_type', NEW.event_type,
        'severity', NEW.severity,
        'description', NEW.description
      )::text
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for security event notifications
DROP TRIGGER IF EXISTS notify_security_event_trigger ON workspace_security_events;
CREATE TRIGGER notify_security_event_trigger
  AFTER INSERT ON workspace_security_events
  FOR EACH ROW EXECUTE FUNCTION notify_security_event();

-- Security: Comments for documentation
COMMENT ON FUNCTION auth.workspace_id() IS 'Get current workspace ID from JWT token or app setting';
COMMENT ON FUNCTION auth.user_id() IS 'Get current user ID from JWT token or app setting';
COMMENT ON FUNCTION auth.has_workspace_access(UUID, TEXT) IS 'Check if user has minimum role access to workspace';
COMMENT ON FUNCTION security.validate_workspace_request(UUID, TEXT) IS 'Validate and audit workspace access requests';
COMMENT ON FUNCTION security.audit_operation(TEXT, UUID, JSONB) IS 'Audit sensitive operations with context';
COMMENT ON FUNCTION security.comprehensive_workspace_check(UUID, TEXT, TEXT) IS 'Comprehensive workspace access validation with detailed response';

-- Final security verification queries (for testing)
-- These can be used to verify RLS policies are working correctly

-- Test queries (uncomment to run manually):
-- SELECT security.comprehensive_workspace_check('workspace_uuid', 'read', 'general');
-- SELECT auth.has_workspace_access('workspace_uuid', 'admin');
-- SELECT * FROM audit_logs WHERE workspace_id = 'workspace_uuid' LIMIT 5;