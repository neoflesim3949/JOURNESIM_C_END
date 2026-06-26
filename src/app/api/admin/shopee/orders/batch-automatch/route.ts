import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { costCnyFromPrices } from '@/lib/shopee-pricing'

// POST — 批量依 V2 對應，自動把多筆訂單的明細帶入 BC + 自設名稱（依 蝦皮帳號+選項ID）
// body: { order_ids: string[] }
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 400 })
  const { order_ids } = await request.json().catch(() => ({}))
  if (!Array.isArray(order_ids) || order_ids.length === 0) return NextResponse.json({ error: '缺少 order_ids' }, { status: 400 })
  const supabase = createAdminClient()

  // 訂單 → 帳號
  const { data: orders } = await supabase.from('shopee_orders').select('id, shopee_account_id').in('id', order_ids)
  const accByOrder = new Map((orders || []).map(o => [o.id, o.shopee_account_id]))

  // 明細
  const { data: items } = await supabase.from('shopee_order_items')
    .select('id, shopee_order_id, shopee_variation_id, bc_sku_id, delivery_type, iccid, custom_product_name, custom_variation_name')
    .in('shopee_order_id', order_ids)
  if (!items || items.length === 0) return NextResponse.json({ ok: true, matched: 0 })

  const accounts = [...new Set([...accByOrder.values()].filter(Boolean))] as string[]
  const vids = [...new Set(items.map(i => i.shopee_variation_id).filter(Boolean))] as string[]
  if (accounts.length === 0 || vids.length === 0) return NextResponse.json({ ok: true, matched: 0 })

  // V2 對應（帳號 + 選項ID）
  const { data: v2 } = await supabase.from('shopee_product_options_v2')
    .select('account_id, shopee_variation_id, bc_sku_id, copies, custom_product_name, custom_variation_name')
    .in('account_id', accounts).in('shopee_variation_id', vids)
  const v2Map = new Map((v2 || []).map(o => [`${o.account_id}__${o.shopee_variation_id}`, o]))

  // BC 結算價 + 匯率
  const skuIds = [...new Set((v2 || []).map(o => o.bc_sku_id).filter(Boolean))] as string[]
  const { data: bcs } = skuIds.length
    ? await supabase.from('bc_products').select('sku_id, prices').in('sku_id', skuIds)
    : { data: [] }
  const bcMap = new Map((bcs || []).map(b => [b.sku_id, b]))
  const { data: rateRow } = await supabase.from('exchange_rates').select('rate').eq('currency', 'CNY').single()
  const cnyRate = rateRow ? Number(rateRow.rate) : 0.2128

  let matched = 0
  for (const it of items) {
    const acc = accByOrder.get(it.shopee_order_id)
    if (!acc || !it.shopee_variation_id) continue
    const m = v2Map.get(`${acc}__${it.shopee_variation_id}`)
    if (!m) continue
    const updates: Record<string, unknown> = {}
    // 自設名稱：V2 有就帶入
    if (m.custom_product_name) updates.custom_product_name = m.custom_product_name
    if (m.custom_variation_name) updates.custom_variation_name = m.custom_variation_name
    // BC 對應：尚未對應才帶（避免覆蓋已對應/已送出）
    if (m.bc_sku_id && !it.bc_sku_id) {
      updates.bc_sku_id = m.bc_sku_id
      updates.matched_copies = m.copies || null
      updates.status = (Array.isArray(it.iccid) && it.iccid.length > 0) ? 'iccid_filled' : 'matched'
      const bc = bcMap.get(m.bc_sku_id)
      const baseCny = bc ? costCnyFromPrices(bc.prices as { copies: string; settlementPrice: string }[] | null, m.copies ?? null) : 0
      if (baseCny > 0) {
        const costCny = (it.delivery_type || 'sim') === 'sim' ? baseCny + 3 : baseCny
        updates.cost_cny = costCny
        updates.cost_twd = Math.ceil(costCny / cnyRate)
      }
    }
    if (Object.keys(updates).length === 0) continue
    await supabase.from('shopee_order_items').update(updates).eq('id', it.id)
    matched++
  }

  return NextResponse.json({ ok: true, matched })
}
