import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdminAuth, getUnauthorizedResponse } from '@/lib/admin'
import { clearBcConfigCache, getBalance, type BcProfile } from '@/lib/billionconnect'
import crypto from 'crypto'

// BC 多渠道設定檔：bc_profiles（JSON 陣列）＋ bc_active（作用中 id）
// GET — 現行設定檔清單、作用中 id、env 預設（供顯示「未設任何 profile 時用 env」）
export async function GET() {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const supabase = createAdminClient()
  const { data } = await supabase.from('system_settings').select('key, value').in('key', ['bc_profiles', 'bc_active'])
  let profiles: BcProfile[] = []
  try { profiles = JSON.parse(data?.find(r => r.key === 'bc_profiles')?.value || '[]') } catch { profiles = [] }
  const activeId = data?.find(r => r.key === 'bc_active')?.value || (profiles[0]?.id ?? '')
  return NextResponse.json({
    profiles,
    active_id: activeId,
    env: {
      url: process.env.BILLIONCONNECT_URL || '',
      app_key: process.env.BILLIONCONNECT_APP_KEY || '',
      has_secret: !!process.env.BILLIONCONNECT_APP_SECRET,
    },
  })
}

// PATCH — 儲存設定檔清單與作用中 id
export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const body = await request.json() as { profiles?: BcProfile[]; active_id?: string }
  const supabase = createAdminClient()
  const now = new Date().toISOString()
  if (Array.isArray(body.profiles)) {
    const clean = body.profiles.map(p => ({
      id: p.id || crypto.randomUUID(),
      name: String(p.name || '').trim() || '未命名渠道',
      url: String(p.url || '').trim(),
      appKey: String(p.appKey || '').trim(),
      appSecret: String(p.appSecret || '').trim(),
    }))
    const { error } = await supabase.from('system_settings').upsert({ key: 'bc_profiles', value: JSON.stringify(clean), updated_at: now }, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (body.active_id !== undefined) {
    await supabase.from('system_settings').upsert({ key: 'bc_active', value: String(body.active_id), updated_at: now }, { onConflict: 'key' })
  }
  clearBcConfigCache()
  return NextResponse.json({ ok: true })
}

// POST — 連線測試（作用中渠道打 F014 餘額）；body.active_id 可先切換再測
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const supabase = createAdminClient()
  try {
    const body = await request.json().catch(() => ({})) as { active_id?: string }
    if (body.active_id) {
      await supabase.from('system_settings').upsert({ key: 'bc_active', value: String(body.active_id), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    }
  } catch { /* 無 body 也可 */ }
  clearBcConfigCache()
  try {
    const bal = await getBalance()
    return NextResponse.json({ ok: true, balance: bal })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 200 })
  }
}
