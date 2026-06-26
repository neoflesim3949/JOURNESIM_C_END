import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { costCnyFromPrices } from '@/lib/shopee-pricing'

// POST — 依 V2 商品對應，自動把訂單未對應的明細帶入 BC（依 蝦皮選項ID → V2.bc_sku_id+copies）
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: order } = await supabase.from('shopee_orders').select('shopee_account_id').eq('id', id).single()
  if (!order?.shopee_account_id) return NextResponse.json({ error: '訂單無對應蝦皮帳號' }, { status: 400 })

  // 未對應（無 BC）的明細
  const { data: items } = await supabase.from('shopee_order_items')
    .select('id, shopee_variation_id, bc_sku_id, delivery_type, iccid, status')
    .eq('shopee_order_id', id)
  const pending = (items || []).filter(i => !i.bc_sku_id && i.shopee_variation_id)
  if (pending.length === 0) return NextResponse.json({ ok: true, matched: 0 })

  // V2 對應（該帳號、已對應 BC 的選項）
  const vids = [...new Set(pending.map(i => String(i.shopee_variation_id)))]
  const { data: v2 } = await supabase.from('shopee_product_options_v2')
    .select('shopee_variation_id, bc_sku_id, copies')
    .eq('account_id', order.shopee_account_id).in('shopee_variation_id', vids).not('bc_sku_id', 'is', null)
  const v2Map = new Map((v2 || []).map(o => [String(o.shopee_variation_id), o]))
  if (v2Map.size === 0) return NextResponse.json({ ok: true, matched: 0 })

  // BC 結算價 + 匯率（算成本）
  const skuIds = [...new Set([...v2Map.values()].map(o => o.bc_sku_id).filter(Boolean))] as string[]
  const { data: bcs } = skuIds.length
    ? await supabase.from('bc_products').select('sku_id, prices').in('sku_id', skuIds)
    : { data: [] }
  const bcMap = new Map((bcs || []).map(b => [b.sku_id, b]))
  const { data: rateRow } = await supabase.from('exchange_rates').select('rate').eq('currency', 'CNY').single()
  const cnyRate = rateRow ? Number(rateRow.rate) : 0.2128

  let matched = 0
  for (const it of pending) {
    const m = v2Map.get(String(it.shopee_variation_id))
    if (!m) continue
    const updates: Record<string, unknown> = {
      bc_sku_id: m.bc_sku_id, matched_copies: m.copies || null,
      status: (Array.isArray(it.iccid) && it.iccid.length > 0) ? 'iccid_filled' : 'matched',
    }
    // 成本：依 copies 結算價換算；SIM 實體卡 +¥3 運費（存單張價）
    const bc = bcMap.get(m.bc_sku_id)
    const baseCny = bc ? costCnyFromPrices(bc.prices as { copies: string; settlementPrice: string }[] | null, m.copies ?? null) : 0
    if (baseCny > 0) {
      const costCny = (it.delivery_type || 'sim') === 'sim' ? baseCny + 3 : baseCny
      updates.cost_cny = costCny
      updates.cost_twd = Math.ceil(costCny / cnyRate)
    }
    await supabase.from('shopee_order_items').update(updates).eq('id', it.id)
    matched++
  }

  return NextResponse.json({ ok: true, matched })
}
