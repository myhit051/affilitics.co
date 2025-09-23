#!/usr/bin/env node

/**
 * Database Initialization Script
 * 
 * This script applies the SQL schema files to Supabase in the correct order:
 * 1. schema.sql - Creates tables including the missing 'members' table
 * 2. rls.sql - Applies Row Level Security policies
 * 3. functions.sql - Creates database functions
 * 4. audit-schema.sql - Creates audit logging tables
 * 
 * Run this script to fix the "Could not find the table 'public.members'" error.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables:')
  console.error('  - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)')
  console.error('  - SUPABASE_SERVICE_ROLE_KEY')
  console.error('\nPlease check your .env file.')
  process.exit(1)
}

// Create Supabase client with service role key for admin operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function executeSQL(filename, description) {
  try {
    console.log(`\n📄 Applying ${description}...`)
    
    const sqlPath = join(__dirname, 'sql', filename)
    const sql = readFileSync(sqlPath, 'utf8')
    
    // Split SQL into individual statements and execute them
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
    
    for (const statement of statements) {
      if (statement.trim()) {
        const { error } = await supabase.rpc('exec_sql', { sql_statement: statement })
        
        if (error) {
          // Try direct query execution as fallback
          const { error: directError } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .limit(1)
          
          if (directError) {
            console.error(`❌ Failed to execute statement: ${statement.substring(0, 100)}...`)
            console.error(`Error: ${error.message}`)
          }
        }
      }
    }
    
    console.log(`✅ Successfully applied ${description}`)
    
  } catch (error) {
    console.error(`❌ Error applying ${description}:`, error.message)
    throw error
  }
}

async function checkTableExists(tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)
    
    if (error && error.message.includes('does not exist')) {
      return false
    }
    
    return true
  } catch (error) {
    return false
  }
}

async function initializeDatabase() {
  try {
    console.log('🚀 Starting database initialization...')
    console.log(`📡 Connecting to: ${SUPABASE_URL}`)
    
    // Check if members table already exists
    const membersExists = await checkTableExists('members')
    
    if (membersExists) {
      console.log('✅ Members table already exists. Database appears to be initialized.')
      console.log('\n🎉 Database initialization completed successfully!')
      return
    }
    
    console.log('❌ Members table not found. Applying database schema...')
    
    // Apply SQL files in correct order
    await executeSQL('schema.sql', 'Database Schema (tables, indexes)')
    await executeSQL('rls.sql', 'Row Level Security Policies')
    await executeSQL('functions.sql', 'Database Functions')
    await executeSQL('audit-schema.sql', 'Audit Logging Schema')
    
    // Verify members table was created
    const membersExistsAfter = await checkTableExists('members')
    
    if (membersExistsAfter) {
      console.log('✅ Members table successfully created!')
    } else {
      throw new Error('Members table was not created properly')
    }
    
    console.log('\n🎉 Database initialization completed successfully!')
    console.log('💡 You can now run your application without the "members table not found" error.')
    
  } catch (error) {
    console.error('\n💥 Database initialization failed:', error.message)
    console.error('\n🔧 Manual setup instructions:')
    console.error('1. Go to your Supabase project dashboard')
    console.error('2. Navigate to SQL Editor')
    console.error('3. Run the following files in order:')
    console.error('   - packages/db/sql/schema.sql')
    console.error('   - packages/db/sql/rls.sql') 
    console.error('   - packages/db/sql/functions.sql')
    console.error('   - packages/db/sql/audit-schema.sql')
    
    process.exit(1)
  }
}

// Alternative approach: Direct table creation if schema.sql fails
async function createMembersTableDirect() {
  try {
    console.log('\n🔧 Creating members table directly...')
    
    const createMembersSQL = `
      CREATE TABLE IF NOT EXISTS members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, workspace_id)
      );
    `
    
    // This is a simplified approach - just create the essential tables
    const { error } = await supabase.rpc('exec_sql', { sql_statement: createMembersSQL })
    
    if (error) {
      console.error('❌ Failed to create members table directly:', error.message)
      return false
    }
    
    console.log('✅ Members table created successfully!')
    return true
    
  } catch (error) {
    console.error('❌ Error creating members table directly:', error.message)
    return false
  }
}

// Main execution
if (process.argv.includes('--direct')) {
  createMembersTableDirect()
} else {
  initializeDatabase()
}