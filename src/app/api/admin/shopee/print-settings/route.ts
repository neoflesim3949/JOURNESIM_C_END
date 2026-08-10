import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 蝦皮列印相關設定（標籤字體/方向、使用期限、寄件人、收據印章）— 存 system_settings 全後台共用
const KEYS = ['shopee_label_settings', 'shopee_expiry_date', 'shopee_sender_info', 'receipt_stamp_url']

export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('system_settings').select('key, value').in('key', KEYS)
  const settings: Record<string, string> = {}
  for (const row of data || []) settings[row.key] = row.value ?? ''
  return NextResponse.json({ settings })
}

// PUT { settings: { key: value } } — 只收白名單 key；value 空字串代表清除
export async function PUT(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const settings = (body.settings || {}) as Record<string, unknown>
  const supabase = createAdminClient()
  const now = new Date().toISOString()
  for (const [key, value] of Object.entries(settings)) {
    if (!KEYS.includes(key)) continue
    const { error } = await supabase.from('system_settings')
      .upsert({ key, value: String(value ?? ''), updated_at: now }, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
