// Re-export all Supabase utilities for clean imports
export { createClient } from './client'
export { createClient as createServerClient, createMiddlewareClient, createServiceClient } from './server'
export type { Database, Profile, WorkspaceMember, AuthUser, AuthContext } from './types'