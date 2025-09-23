// Legacy exports - use new secure clients from @/lib/supabase instead
import { createServiceClient } from './supabase/server'

/**
 * @deprecated Use createServiceClient from @/lib/supabase/server instead
 */
export function supabaseAsService() {
  return createServiceClient()
}
