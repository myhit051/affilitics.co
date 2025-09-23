-- Workspace Audit Logging Schema
-- Security: Comprehensive audit trail for workspace operations

-- Create audit_logs table for tracking all workspace operations
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Security: Add indexes for efficient querying
  CONSTRAINT fk_audit_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Security: Create indexes for performance and querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_id ON audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_composite ON audit_logs(workspace_id, timestamp DESC);

-- Security: Enable RLS for audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Security: RLS policies for audit logs
-- Only workspace members can read audit logs
CREATE POLICY sel_ws_audit_logs ON audit_logs
FOR SELECT USING (
  workspace_id IN (
    SELECT workspace_id 
    FROM members 
    WHERE user_id = auth.jwt()->>'sub' 
    AND workspace_id = audit_logs.workspace_id
  )
);

-- Only the user who performed the action can insert audit logs
CREATE POLICY ins_ws_audit_logs ON audit_logs
FOR INSERT WITH CHECK (
  user_id = auth.jwt()->>'sub' AND
  workspace_id IN (
    SELECT workspace_id 
    FROM members 
    WHERE user_id = auth.jwt()->>'sub'
  )
);

-- Security: No updates or deletes allowed on audit logs
-- Audit logs should be immutable for compliance

-- Create workspace security events table for tracking security-related events
CREATE TABLE IF NOT EXISTS workspace_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  user_id UUID,
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'info', -- critical, high, medium, low, info
  description TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  fingerprint VARCHAR(50),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Security: Constraint for severity levels
  CONSTRAINT chk_severity CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info'))
);

-- Security: Indexes for security events
CREATE INDEX IF NOT EXISTS idx_security_events_workspace_id ON workspace_security_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON workspace_security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_resolved ON workspace_security_events(resolved);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON workspace_security_events(created_at DESC);

-- Security: Enable RLS for security events
ALTER TABLE workspace_security_events ENABLE ROW LEVEL SECURITY;

-- Security: Only workspace owners and admins can view security events
CREATE POLICY sel_ws_security_events ON workspace_security_events
FOR SELECT USING (
  workspace_id IN (
    SELECT workspace_id 
    FROM members 
    WHERE user_id = auth.jwt()->>'sub' 
    AND workspace_id = workspace_security_events.workspace_id
    AND role IN ('owner', 'admin')
  )
);

-- Security: System can insert security events
CREATE POLICY ins_ws_security_events ON workspace_security_events
FOR INSERT WITH CHECK (true); -- Allow system inserts

-- Security: Only owners and admins can resolve security events
CREATE POLICY upd_ws_security_events ON workspace_security_events
FOR UPDATE USING (
  workspace_id IN (
    SELECT workspace_id 
    FROM members 
    WHERE user_id = auth.jwt()->>'sub' 
    AND workspace_id = workspace_security_events.workspace_id
    AND role IN ('owner', 'admin')
  )
);

-- Add missing columns to existing tables if they don't exist
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS validation_result JSONB;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS validation_summary TEXT;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS total_rows INTEGER;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS valid_rows INTEGER;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Add missing columns to import_errors table
ALTER TABLE import_errors ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE import_errors ADD COLUMN IF NOT EXISTS row_number INTEGER;
ALTER TABLE import_errors ADD COLUMN IF NOT EXISTS column_name TEXT;
ALTER TABLE import_errors ADD COLUMN IF NOT EXISTS field_name TEXT;
ALTER TABLE import_errors ADD COLUMN IF NOT EXISTS error_type TEXT;
ALTER TABLE import_errors ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE import_errors ADD COLUMN IF NOT EXISTS field_value TEXT;

-- Update existing RLS policies to include new columns
DROP POLICY IF EXISTS sel_ws_import_errors ON import_errors;
CREATE POLICY sel_ws_import_errors ON import_errors
FOR SELECT USING (
  workspace_id = auth.jwt()->>'workspace_id' OR
  job_id IN (SELECT id FROM import_jobs WHERE workspace_id = auth.jwt()->>'workspace_id')
);

DROP POLICY IF EXISTS ins_ws_import_errors ON import_errors;
CREATE POLICY ins_ws_import_errors ON import_errors
FOR INSERT WITH CHECK (
  workspace_id = auth.jwt()->>'workspace_id' OR
  job_id IN (SELECT id FROM import_jobs WHERE workspace_id = auth.jwt()->>'workspace_id')
);

-- Create function to automatically log workspace operations
CREATE OR REPLACE FUNCTION log_workspace_operation()
RETURNS TRIGGER AS $$
BEGIN
  -- Log the operation in audit_logs
  INSERT INTO audit_logs (
    workspace_id,
    user_id,
    action,
    details,
    timestamp
  ) VALUES (
    COALESCE(NEW.workspace_id, OLD.workspace_id),
    auth.jwt()->>'sub',
    TG_OP || '_' || TG_TABLE_NAME,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'record_id', COALESCE(NEW.id, OLD.id),
      'old_values', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
      'new_values', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    ),
    NOW()
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for audit logging on key tables
CREATE TRIGGER audit_import_jobs
  AFTER INSERT OR UPDATE OR DELETE ON import_jobs
  FOR EACH ROW EXECUTE FUNCTION log_workspace_operation();

CREATE TRIGGER audit_affiliate_orders
  AFTER INSERT OR UPDATE OR DELETE ON affiliate_orders
  FOR EACH ROW EXECUTE FUNCTION log_workspace_operation();

-- Security: Create function to detect suspicious activity
CREATE OR REPLACE FUNCTION detect_suspicious_activity()
RETURNS TRIGGER AS $$
DECLARE
  recent_failed_attempts INTEGER;
  ip_addr INET;
BEGIN
  -- Extract IP from details if available
  ip_addr := (NEW.details->>'ip_address')::INET;
  
  -- Check for multiple failed authentication attempts
  IF NEW.action LIKE '%auth_failed%' OR NEW.action LIKE '%access_denied%' THEN
    SELECT COUNT(*) INTO recent_failed_attempts
    FROM audit_logs
    WHERE action LIKE '%failed%' OR action LIKE '%denied%'
    AND timestamp > NOW() - INTERVAL '15 minutes'
    AND (details->>'ip_address')::INET = ip_addr;
    
    -- If more than 5 failed attempts in 15 minutes, create security event
    IF recent_failed_attempts >= 5 THEN
      INSERT INTO workspace_security_events (
        workspace_id,
        user_id,
        event_type,
        severity,
        description,
        details,
        ip_address
      ) VALUES (
        NEW.workspace_id,
        NEW.user_id,
        'suspicious_activity',
        'high',
        'Multiple failed authentication attempts detected',
        jsonb_build_object(
          'failed_attempts', recent_failed_attempts,
          'time_window', '15 minutes',
          'trigger_action', NEW.action
        ),
        ip_addr
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for suspicious activity detection
CREATE TRIGGER detect_suspicious_activity_trigger
  AFTER INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION detect_suspicious_activity();

-- Security: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_import_jobs_workspace_created ON import_jobs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_orders_workspace_date ON affiliate_orders(workspace_id, event_date DESC);

-- Grant necessary permissions
GRANT SELECT, INSERT ON audit_logs TO authenticated;
GRANT SELECT ON workspace_security_events TO authenticated;
GRANT UPDATE (resolved, resolved_at, resolved_by) ON workspace_security_events TO authenticated;