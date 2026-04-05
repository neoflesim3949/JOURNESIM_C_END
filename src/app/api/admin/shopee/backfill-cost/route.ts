import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 回填所有已下單商品的成本價
export async function POST() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  // 查所有有 bc_sku_id 但沒有 cost_twd 的 items
  const { data: items } = await supabase.from('shopee_order_items')
    .select('id, bc_sku_id, matched_copies')
    .not('bc_sku_id', 'is', null)
    .is('cost_twd', null)

  if (!items || items.length === 0) return NextResponse.json({ updated: 0, message: '無需回填' })

  // 查 BC 商品價格
  const skuIds = [...new Set(items.map(i => i.bc_sku_id).filter(Boolean))]
  const { data: bcProducts } = await supabase.from('bc_products').select('sku_id, prices').in('sku_id', skuIds)
  const priceMap = new Map((bcProducts || []).map(p => [p.sku_id, p.prices as { copies: string; settlementPrice: string }[] | null]))

  // 查匯率
  const { data: rateRow } = await supabase.from('exchange_rates').select('rate').eq('currency', 'CNY').single()
  const cnyRate = rateRow ? Number(rateRow.rate) : 0.2128

  let updated = 0
  for (const item of items) {
    const prices = priceMap.get(item.bc_sku_id) || []
    const matched = prices?.find(p => p.copies === (item.matched_copies || '1'))
    if (!matched) continue

    const costCny = Number(matched.settlementPrice) || 0
    const costTwd = Math.ceil(costCny / cnyRate)

    await supabase.from('shopee_order_items').update({ cost_cny: costCny, cost_twd: costTwd }).eq('id', item.id)
    updated++
  }

  return NextResponse.json({ updated, total: items.length })
}
