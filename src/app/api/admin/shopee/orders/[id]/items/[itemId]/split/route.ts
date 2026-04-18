import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 拆單：將單一品項拆成 N 個 quantity=1 的子品項
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, itemId } = await params
  const supabase = createAdminClient()

  const { data: item } = await supabase.from('shopee_order_items').select('*').eq('id', itemId).single()
  if (!item || item.shopee_order_id !== id) {
    return NextResponse.json({ error: '找不到品項' }, { status: 404 })
  }
  if (item.bc_order_id) {
    return NextResponse.json({ error: '已下 BC 訂單，無法拆單' }, { status: 400 })
  }
  if (item.quantity <= 1) {
    return NextResponse.json({ error: '數量需 > 1 才能拆單' }, { status: 400 })
  }

  const n = item.quantity
  const rows = Array.from({ length: n }, () => ({
    shopee_order_id: item.shopee_order_id,
    shopee_product_name: item.shopee_product_name,
    shopee_product_id: item.shopee_product_id,
    shopee_variation_name: item.shopee_variation_name,
    shopee_variation_id: item.shopee_variation_id,
    shopee_sku_code: item.shopee_sku_code,
    original_price: item.original_price,
    sale_price: item.sale_price,
    quantity: 1,
    return_quantity: 0,
    matched_package_id: item.matched_package_id,
    matched_plan_id: item.matched_plan_id,
    matched_copies: item.matched_copies,
    bc_sku_id: item.bc_sku_id,
    status: item.bc_sku_id ? 'matched' : 'pending',
    is_manual: item.is_manual,
  }))

  const { error: insertErr } = await supabase.from('shopee_order_items').insert(rows)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  const { error: deleteErr } = await supabase.from('shopee_order_items').delete().eq('id', itemId)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, count: n })
}
