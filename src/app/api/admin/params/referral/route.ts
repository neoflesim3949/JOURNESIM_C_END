import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdminAuth, getUnauthorizedResponse } from '@/lib/admin'

const REFERRAL_KEYS = [
  'referral_signup_points',
  'referral_min_spend',
  'referral_l1_bonus',
  'referral_l1_percent',
  'referral_l2_percent',
  'referral_lock_days'
]

export async function GET() {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const supabase = createAdminClient()

  const { data: settings } = await supabase
    .from('system_settings')
    .select('key, value, description')
    .in('key', REFERRAL_KEYS)

  return NextResponse.json(settings || [])
}

export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const body = await request.json()
  const supabase = createAdminClient()

  const { key, value } = body as { key: string; value: string }
  if (!REFERRAL_KEYS.includes(key)) {
    return NextResponse.json({ error: '無效的設定鍵' }, { status: 400 })
  }

  const { error } = await supabase
    .from('system_settings')
    .upsert({ 
        key, 
        value: String(value),
        updated_at: new Date().toISOString()
    }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
