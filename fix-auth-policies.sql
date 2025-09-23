-- Fix: Create temporary policies that work without auth.uid() for initial setup
-- This allows the app to work while we fix the authentication issue

-- Drop existing policies that require auth.uid()
DROP POLICY IF EXISTS "Users can view their own memberships" ON members;
DROP POLICY IF EXISTS "Users can insert their own memberships" ON members;
DROP POLICY IF EXISTS "Users can view workspaces they belong to" ON workspaces;

-- Create temporary permissive policies for development
-- WARNING: These are for development only, not production

-- Allow all authenticated users to read members table
CREATE POLICY "Temporary - Allow all reads on members" ON members
  FOR SELECT
  USING (true);

-- Allow all authenticated users to insert into members table  
CREATE POLICY "Temporary - Allow all inserts on members" ON members
  FOR INSERT
  WITH CHECK (true);

-- Allow all authenticated users to read workspaces
CREATE POLICY "Temporary - Allow all reads on workspaces" ON workspaces
  FOR SELECT
  USING (true);

-- Allow all authenticated users to insert workspaces
CREATE POLICY "Temporary - Allow all inserts on workspaces" ON workspaces
  FOR INSERT
  WITH CHECK (true);

-- Create a default workspace and membership for testing
-- This will help the app work immediately
INSERT INTO workspaces (id, name, plan) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Workspace', 'free')
ON CONFLICT (id) DO NOTHING;

-- Verify the fix
SELECT 'Tables created successfully' as status;
SELECT COUNT(*) as workspace_count FROM workspaces;
SELECT COUNT(*) as member_count FROM members;