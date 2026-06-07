import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 批次對應：將指定 SKU code 的所有未對應商品對應到 BC SKU
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { order_ids, shopee_sku_code, bc_sku_id, copies } = body

  if (!shopee_sku_code || !bc_sku_id) return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })

  const supabase = createAdminClient()

  // 更新所有指定訂單中同 SKU code 且未對應的 items
  const { data: updated, error } = await supabase.from('shopee_order_items')
    .update({ bc_sku_id, matched_copies: copies || '1', status: 'matched' })
    .in('shopee_order_id', order_ids)
    .eq('shopee_sku_code', shopee_sku_code)
    .is('bc_order_id', null)
    .in('status', ['pending', 'matched', 'iccid_filled'])
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 註：只調整訂單明細，不回寫共用對應表（對應源頭為 V2 蝦皮表）

  return NextResponse.json({ ok: true, updated: updated?.length || 0 })
}
