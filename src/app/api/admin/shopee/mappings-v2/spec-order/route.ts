import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// PUT — 儲存某商品某規格軸的選項順序
// body: { account_id, product_id, spec_type?, order: string[] }
export async function PUT(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { account_id, product_id, order } = body
  const spec_type = body.spec_type || 'data'
  if (!account_id || !product_id || !Array.isArray(order)) {
    return NextResponse.json({ error: '參數不足' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const rows = order.map((spec_value: string, i: number) => ({
    account_id, product_id, spec_type, spec_value: String(spec_value), sort_index: i,
  }))
  if (rows.length === 0) return NextResponse.json({ ok: true })
  const { error } = await supabase.from('shopee_spec_order')
    .upsert(rows, { onConflict: 'account_id,product_id,spec_type,spec_value' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
