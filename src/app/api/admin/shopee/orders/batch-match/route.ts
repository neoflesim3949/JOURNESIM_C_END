import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { snapshotFor } from '@/lib/bc-snapshot'

// POST — 批次對應：將指定 SKU code 的所有未對應商品對應到 BC SKU
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { order_ids, shopee_sku_code, bc_sku_id, copies, shopee_variation_id, shopee_product_id, shopee_product_name, shopee_variation_name, custom_product_name, custom_variation_name } = body

  const hasNames = custom_product_name !== undefined || custom_variation_name !== undefined
  if (!shopee_sku_code || (!bc_sku_id && !hasNames)) return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })

  const supabase = createAdminClient()

  // 更新指定訂單中同 SKU code 的 items：有 bc 就設對應，名稱則寫快照（本地）
  const itemUpdate: Record<string, unknown> = {}
  if (bc_sku_id) { itemUpdate.bc_sku_id = bc_sku_id; itemUpdate.matched_copies = copies || '1'; itemUpdate.status = 'matched' }
  if (custom_product_name !== undefined) itemUpdate.custom_product_name = custom_product_name || null
  if (custom_variation_name !== undefined) itemUpdate.custom_variation_name = custom_variation_name || null
  const { data: updated, error } = await supabase.from('shopee_order_items')
    .update(itemUpdate)
    .in('shopee_order_id', order_ids)
    .eq('shopee_sku_code', shopee_sku_code)
    .is('bc_order_id', null)
    .in('status', ['pending', 'matched', 'iccid_filled'])
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 訂單端對應/命名回寫 V2 蝦皮表（讓 V2 逐步補齊）
  // 帳號只取「實際含此 sku_code 的訂單」所屬帳號，避免跨帳號批次把對應寫到別人的庫
  if (shopee_variation_id && (bc_sku_id || hasNames)) {
    const { data: itemRows } = await supabase.from('shopee_order_items')
      .select('shopee_order_id').eq('shopee_sku_code', shopee_sku_code).in('shopee_order_id', order_ids)
    const relevantOrderIds = [...new Set((itemRows || []).map(r => r.shopee_order_id))]
    const { data: ords } = relevantOrderIds.length
      ? await supabase.from('shopee_orders').select('shopee_account_id').in('id', relevantOrderIds)
      : { data: [] }
    const accts = [...new Set((ords || []).map(o => o.shopee_account_id).filter(Boolean))] as string[]
    if (accts.length) {
      // 只有設定 BC 時才更新 bc 欄位與快照（避免清掉 V2 既有對應）
      const bcPart: Record<string, unknown> = {}
      if (bc_sku_id) {
        const { data: bc } = await supabase.from('bc_products').select('name, prices').eq('sku_id', bc_sku_id).maybeSingle()
        Object.assign(bcPart, { bc_sku_id, copies: copies || null }, snapshotFor(bc || undefined, copies || null))
      }
      const namePart: Record<string, unknown> = {}
      if (custom_product_name !== undefined) namePart.custom_product_name = custom_product_name || null
      if (custom_variation_name !== undefined) namePart.custom_variation_name = custom_variation_name || null
      const rows = accts.map(acc => ({
        account_id: acc,
        shopee_variation_id: String(shopee_variation_id),
        shopee_product_id: shopee_product_id || null,
        shopee_product_name: shopee_product_name || null,
        shopee_variation_name: shopee_variation_name || null,
        ...bcPart,
        ...namePart,
        updated_at: new Date().toISOString(),
      }))
      await supabase.from('shopee_product_options_v2').upsert(rows, { onConflict: 'account_id,shopee_variation_id' })
    }
  }

  return NextResponse.json({ ok: true, updated: updated?.length || 0 })
}
