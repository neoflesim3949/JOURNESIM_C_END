import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { snapshotFor } from '@/lib/bc-snapshot'
import { costCnyFromPrices } from '@/lib/shopee-pricing'

// POST — 批次對應：將指定 SKU code 的所有未對應商品對應到 BC SKU
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { order_ids, shopee_sku_code, bc_sku_id, copies, shopee_variation_id, shopee_product_id, shopee_product_name, shopee_variation_name, custom_product_name, custom_variation_name } = body

  const hasNames = custom_product_name !== undefined || custom_variation_name !== undefined
  if (!shopee_sku_code || (!bc_sku_id && !hasNames)) return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })

  const supabase = createAdminClient()

  // 更新指定訂單中同 SKU code 的 items：有 bc 就設對應，名稱則寫快照（本地）
  // 注意：不在這裡動 status，避免把「已回填(iccid_filled)」的商品因重新對應降回 matched(待處理)
  const itemUpdate: Record<string, unknown> = {}
  if (bc_sku_id) { itemUpdate.bc_sku_id = bc_sku_id; itemUpdate.matched_copies = copies || '1' }
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

  if (bc_sku_id && updated && updated.length > 0) {
    const ids = updated.map(u => u.id)
    const { data: its } = await supabase.from('shopee_order_items').select('id, delivery_type, iccid, status').in('id', ids)
    const rows = its || []
    const hasIccid = (it: { iccid: unknown }) => Array.isArray(it.iccid) && it.iccid.length > 0

    // status：有卡號(iccid)的維持原狀（已回填），沒卡號的設為 matched
    const toMatched = rows.filter(it => !hasIccid(it) && (it.status === 'pending' || it.status === 'matched')).map(it => it.id)
    if (toMatched.length) await supabase.from('shopee_order_items').update({ status: 'matched' }).in('id', toMatched)

    // 對應 BC 時立即帶入成本（依 copies 結算價換算；SIM 實體卡 +¥3 運費，存單張價）
    const { data: bc } = await supabase.from('bc_products').select('prices').eq('sku_id', bc_sku_id).maybeSingle()
    const baseCny = bc ? costCnyFromPrices(bc.prices as { copies: string; settlementPrice: string }[] | null, copies || '1') : 0
    if (baseCny > 0) {
      const { data: rateRow } = await supabase.from('exchange_rates').select('rate').eq('currency', 'CNY').single()
      const cnyRate = rateRow ? Number(rateRow.rate) : 0.2128
      const simIds = rows.filter(it => (it.delivery_type || 'sim') === 'sim').map(it => it.id)
      const esimIds = rows.filter(it => (it.delivery_type || 'sim') !== 'sim').map(it => it.id)
      if (simIds.length) { const cc = baseCny + 3; await supabase.from('shopee_order_items').update({ cost_cny: cc, cost_twd: Math.ceil(cc / cnyRate) }).in('id', simIds) }
      if (esimIds.length) { const cc = baseCny; await supabase.from('shopee_order_items').update({ cost_cny: cc, cost_twd: Math.ceil(cc / cnyRate) }).in('id', esimIds) }
    }
  }

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
