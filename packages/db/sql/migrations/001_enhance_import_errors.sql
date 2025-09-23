-- Migration: Enhance import_errors table for comprehensive error handling
-- Date: 2025-09-17
-- Purpose: Add error classification, retry mechanisms, and recovery tracking

-- Add new columns to import_errors table
ALTER TABLE import_errors 
ADD COLUMN IF NOT EXISTS error_type text NOT NULL DEFAULT 'unknown_error',
ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS recovery_strategy text NOT NULL DEFAULT 'manual_review',
ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
ADD COLUMN IF NOT EXISTS resolution text,
ADD COLUMN IF NOT EXISTS dismissed boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
ADD COLUMN IF NOT EXISTS stack_trace text,
ADD COLUMN IF NOT EXISTS additional_context jsonb;

-- Add constraints for enum-like values
ALTER TABLE import_errors 
ADD CONSTRAINT check_error_type CHECK (error_type IN (
  'missing_required_field', 'invalid_data_type', 'invalid_format', 'out_of_range', 'duplicate_record',
  'business_rule_violation', 'referential_integrity', 'constraint_violation',
  'processing_error', 'storage_error', 'network_error', 'timeout_error', 'memory_error',
  'file_corrupted', 'file_too_large', 'unsupported_format', 'encoding_error',
  'platform_api_error', 'platform_rate_limit', 'platform_authentication',
  'unknown_error'
)),
ADD CONSTRAINT check_severity CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
ADD CONSTRAINT check_category CHECK (category IN ('data_quality', 'business_logic', 'system', 'file', 'platform', 'unknown')),
ADD CONSTRAINT check_recovery_strategy CHECK (recovery_strategy IN (
  'retry_automatic', 'retry_manual', 'skip_row', 'fix_data', 'manual_review', 'abort_import', 'no_action'
)),
ADD CONSTRAINT check_retry_count CHECK (retry_count >= 0),
ADD CONSTRAINT check_max_retries CHECK (max_retries >= 0);

-- Add enhanced columns to import_jobs table
ALTER TABLE import_jobs 
ADD COLUMN IF NOT EXISTS error_count int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries int NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS processed_rows int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS processing_summary jsonb;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_import_errors_job_type ON import_errors(job_id, error_type);
CREATE INDEX IF NOT EXISTS idx_import_errors_severity ON import_errors(severity) WHERE NOT dismissed;
CREATE INDEX IF NOT EXISTS idx_import_errors_retryable ON import_errors(job_id, retry_count, max_retries) 
  WHERE retry_count < max_retries AND NOT dismissed;
CREATE INDEX IF NOT EXISTS idx_import_errors_created_at ON import_errors(created_at);
CREATE INDEX IF NOT EXISTS idx_import_errors_resolved ON import_errors(resolved_at) WHERE resolved_at IS NOT NULL;

-- Create indexes for import_jobs
CREATE INDEX IF NOT EXISTS idx_import_jobs_status_workspace ON import_jobs(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_error_count ON import_jobs(workspace_id, error_count) WHERE error_count > 0;
CREATE INDEX IF NOT EXISTS idx_import_jobs_retry ON import_jobs(status, retry_count, max_retries) 
  WHERE retry_count < max_retries AND status IN ('failed', 'validation_failed');

-- Function to update error counts automatically
CREATE OR REPLACE FUNCTION update_job_error_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE import_jobs 
    SET error_count = error_count + 1,
        last_error_at = NEW.created_at
    WHERE id = NEW.job_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle dismissal changes
    IF OLD.dismissed != NEW.dismissed THEN
      IF NEW.dismissed THEN
        UPDATE import_jobs 
        SET error_count = error_count - 1
        WHERE id = NEW.job_id AND error_count > 0;
      ELSE
        UPDATE import_jobs 
        SET error_count = error_count + 1,
            last_error_at = NEW.created_at
        WHERE id = NEW.job_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE import_jobs 
    SET error_count = error_count - 1
    WHERE id = OLD.job_id AND error_count > 0;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically maintain error counts
DROP TRIGGER IF EXISTS trigger_update_job_error_count ON import_errors;
CREATE TRIGGER trigger_update_job_error_count
  AFTER INSERT OR UPDATE OF dismissed OR DELETE
  ON import_errors
  FOR EACH ROW
  EXECUTE FUNCTION update_job_error_count();

-- View for error analytics
CREATE OR REPLACE VIEW import_error_analytics AS
SELECT 
  ie.job_id,
  ij.workspace_id,
  ij.platform,
  ij.filename,
  COUNT(*) as total_errors,
  COUNT(*) FILTER (WHERE ie.severity = 'critical') as critical_errors,
  COUNT(*) FILTER (WHERE ie.severity = 'high') as high_errors,
  COUNT(*) FILTER (WHERE ie.severity = 'medium') as medium_errors,
  COUNT(*) FILTER (WHERE ie.severity = 'low') as low_errors,
  COUNT(*) FILTER (WHERE ie.severity = 'info') as info_errors,
  COUNT(*) FILTER (WHERE ie.retry_count > 0) as retried_errors,
  COUNT(*) FILTER (WHERE ie.resolved_at IS NOT NULL) as resolved_errors,
  COUNT(*) FILTER (WHERE ie.dismissed) as dismissed_errors,
  MIN(ie.created_at) as first_error_at,
  MAX(ie.created_at) as last_error_at
FROM import_errors ie
JOIN import_jobs ij ON ie.job_id = ij.id
GROUP BY ie.job_id, ij.workspace_id, ij.platform, ij.filename;

-- Function to get error recovery recommendations
CREATE OR REPLACE FUNCTION get_error_recovery_recommendations(p_job_id uuid)
RETURNS TABLE(
  error_type text,
  error_count bigint,
  severity text,
  recommendation text,
  action text,
  estimated_effort text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ie.error_type,
    COUNT(*) as error_count,
    ie.severity,
    CASE ie.recovery_strategy
      WHEN 'retry_automatic' THEN 'These errors can be automatically retried. The system will attempt to reprocess these records.'
      WHEN 'skip_row' THEN 'These errors can be safely skipped. Records with these errors will be excluded from import.'
      WHEN 'fix_data' THEN 'Data needs to be corrected in the source file before reimporting.'
      WHEN 'abort_import' THEN 'This error type requires aborting the import. Please fix the issue and retry the entire import.'
      ELSE 'Manual review required to determine the best course of action.'
    END as recommendation,
    CASE ie.recovery_strategy
      WHEN 'retry_automatic' THEN 'retry'
      WHEN 'skip_row' THEN 'skip'
      WHEN 'fix_data' THEN 'fix_data'
      WHEN 'abort_import' THEN 'abort'
      ELSE 'manual_review'
    END as action,
    CASE ie.recovery_strategy
      WHEN 'retry_automatic' THEN 'low'
      WHEN 'skip_row' THEN 'low'
      WHEN 'fix_data' THEN 'high'
      WHEN 'abort_import' THEN 'high'
      ELSE 'medium'
    END as estimated_effort
  FROM import_errors ie
  WHERE ie.job_id = p_job_id 
    AND NOT ie.dismissed
  GROUP BY ie.error_type, ie.severity, ie.recovery_strategy
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old error records (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_import_errors(days_to_keep int DEFAULT 90)
RETURNS TABLE(deleted_count bigint) AS $$
DECLARE
  cutoff_date timestamptz;
  result bigint;
BEGIN
  cutoff_date := NOW() - (days_to_keep || ' days')::interval;
  
  -- Delete errors from jobs older than the cutoff that are completed or failed
  DELETE FROM import_errors 
  WHERE job_id IN (
    SELECT id FROM import_jobs 
    WHERE created_at < cutoff_date 
      AND status IN ('completed', 'failed', 'cancelled')
  );
  
  GET DIAGNOSTICS result = ROW_COUNT;
  
  RETURN QUERY SELECT result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE import_errors IS 'Comprehensive error tracking for import operations with categorization and recovery strategies';
COMMENT ON COLUMN import_errors.error_type IS 'Specific error type from predefined taxonomy';
COMMENT ON COLUMN import_errors.severity IS 'Error severity level (critical, high, medium, low, info)';
COMMENT ON COLUMN import_errors.category IS 'Error category (data_quality, business_logic, system, file, platform, unknown)';
COMMENT ON COLUMN import_errors.recovery_strategy IS 'Recommended recovery action for this error type';
COMMENT ON COLUMN import_errors.retry_count IS 'Number of retry attempts made for this error';
COMMENT ON COLUMN import_errors.additional_context IS 'Additional contextual information about the error in JSON format';