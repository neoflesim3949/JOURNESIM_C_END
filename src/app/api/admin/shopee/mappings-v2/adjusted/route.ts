import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 標記某商品「已調整」（記錄時間）
// body: { account_id, product_id }
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { account_id, product_id } = await request.json().catch(() => ({}))
  if (!account_id || !product_id) return NextResponse.json({ error: '參數不足' }, { status: 400 })
  const supabase = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await supabase.from('shopee_product_adjusted')
    .upsert({ account_id, shopee_product_id: String(product_id), adjusted_at: now }, { onConflict: 'account_id,shopee_product_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, adjusted_at: now })
}

// DELETE — 重設「已調整」標記
// body: { account_id, product_id? }  帶 product_id 則只清該商品，否則清該帳號全部
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { account_id, product_id } = await request.json().catch(() => ({}))
  if (!account_id) return NextResponse.json({ error: '參數不足' }, { status: 400 })
  const supabase = createAdminClient()
  let q = supabase.from('shopee_product_adjusted').delete().eq('account_id', account_id)
  if (product_id) q = q.eq('shopee_product_id', String(product_id))
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
