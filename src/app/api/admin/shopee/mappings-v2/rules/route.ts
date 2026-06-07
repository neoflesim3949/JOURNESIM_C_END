import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_RULE } from '@/lib/shopee-pricing'

// GET ?account_id= — 讀該帳號加價規則（無則回預設）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = new URL(request.url).searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: '請選擇蝦皮帳號' }, { status: 400 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('shopee_pricing_rules')
    .select('multiplier, add_amount, rounding, round_to').eq('account_id', accountId).maybeSingle()
  return NextResponse.json(data || DEFAULT_RULE)
}

// PUT — upsert 該帳號加價規則
export async function PUT(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { account_id, multiplier, add_amount, rounding, round_to } = body
  if (!account_id) return NextResponse.json({ error: '請選擇蝦皮帳號' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('shopee_pricing_rules').upsert({
    account_id,
    multiplier: Number(multiplier) || 1,
    add_amount: Number(add_amount) || 0,
    rounding: ['ceil', 'round', 'floor', 'none'].includes(rounding) ? rounding : 'ceil',
    round_to: Number(round_to) || 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
