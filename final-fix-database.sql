-- FINAL FIX: Create workspace and membership for current user
-- Run this in Supabase SQL Editor to get the app working immediately

-- First, let's see the current user ID
SELECT auth.uid() as current_user_id;

-- Create a workspace for the current user (replace with actual user_id if needed)
INSERT INTO workspaces (id, name, plan, created_at) 
VALUES (
  gen_random_uuid(),
  'My Workspace', 
  'free',
  now()
) 
RETURNING id, name;

-- Get the workspace ID we just created
DO $$
DECLARE
    workspace_uuid uuid;
    user_uuid uuid := auth.uid();
BEGIN
    -- Get the most recent workspace
    SELECT id INTO workspace_uuid 
    FROM workspaces 
    ORDER BY created_at DESC 
    LIMIT 1;
    
    -- Create membership for current user
    INSERT INTO members (user_id, workspace_id, role, created_at)
    VALUES (user_uuid, workspace_uuid, 'owner', now())
    ON CONFLICT (user_id, workspace_id) DO NOTHING;
    
    RAISE NOTICE 'Created workspace % for user %', workspace_uuid, user_uuid;
END $$;

-- Alternative: If auth.uid() is still null, create for specific user
-- Replace '3ce488c8-0d23-41eb-9cdf-4aad96f31ddf' with your actual user ID
INSERT INTO members (user_id, workspace_id, role, created_at)
SELECT 
  '3ce488c8-0d23-41eb-9cdf-4aad96f31ddf'::uuid,
  id,
  'owner',
  now()
FROM workspaces 
WHERE name = 'My Workspace'
ON CONFLICT (user_id, workspace_id) DO NOTHING;

-- Verify everything worked
SELECT 
  w.name as workspace_name,
  m.role,
  m.user_id,
  w.id as workspace_id
FROM workspaces w
JOIN members m ON w.id = m.workspace_id
WHERE m.user_id = '3ce488c8-0d23-41eb-9cdf-4aad96f31ddf'::uuid;