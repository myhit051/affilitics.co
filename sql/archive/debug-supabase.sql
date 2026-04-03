-- Debug Script: Check what's really happening in Supabase
-- Run this in Supabase SQL Editor to see the real status

-- 1. Check if tables exist
SELECT 
  schemaname,
  tablename,
  tableowner,
  hasindexes,
  hasrules,
  hastriggers,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('workspaces', 'members')
ORDER BY tablename;

-- 2. Check table structure
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('workspaces', 'members')
ORDER BY table_name, ordinal_position;

-- 3. Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN ('members', 'workspaces')
ORDER BY tablename, policyname;

-- 4. Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('workspaces', 'members');

-- 5. Test basic insert (this might help identify the real issue)
-- This will show us what error we actually get
DO $$
BEGIN
  -- Try to insert a test record to see what happens
  INSERT INTO workspaces (name, plan) VALUES ('Test Workspace', 'free');
  RAISE NOTICE 'Successfully inserted test workspace';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error inserting workspace: %', SQLERRM;
END $$;

-- 6. Check current user context
SELECT 
  current_user,
  session_user,
  auth.uid() as auth_uid,
  auth.role() as auth_role;

-- 7. Show any constraints that might be causing issues
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
AND tc.table_name IN ('workspaces', 'members')
ORDER BY tc.table_name, tc.constraint_type;