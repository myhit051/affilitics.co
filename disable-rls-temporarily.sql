-- EMERGENCY FIX: Disable RLS temporarily to get the app working
-- Run this in Supabase SQL Editor

-- Disable RLS on members table temporarily
ALTER TABLE members DISABLE ROW LEVEL SECURITY;

-- Disable RLS on workspaces table temporarily  
ALTER TABLE workspaces DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('workspaces', 'members');

-- Test the query that was failing
SELECT 
  id,
  role,
  workspace_id
FROM members 
WHERE user_id = '3ce488c8-0d23-41eb-9cdf-4aad96f31ddf'::uuid;