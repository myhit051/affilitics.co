-- Emergency Fix: Create Missing Members Table
-- Run this in Supabase SQL Editor to fix "Could not find the table 'public.members'" error

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create workspaces table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create the missing members table
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id)
);

-- Basic RLS policies for members table (essential for security)
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own memberships
CREATE POLICY "Users can view their own memberships" ON members
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own memberships (for registration)
CREATE POLICY "Users can insert their own memberships" ON members
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Basic RLS policies for workspaces table
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view workspaces they are members of
CREATE POLICY "Users can view workspaces they belong to" ON workspaces
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM members 
      WHERE members.workspace_id = workspaces.id 
      AND members.user_id = auth.uid()
    )
  );

-- Verify tables were created successfully
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('workspaces', 'members')
ORDER BY table_name;