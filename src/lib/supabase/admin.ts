import { createClient } from '@supabase/supabase-js'

// Service role client — 僅用於 server-side，有完整資料庫存取權限
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
