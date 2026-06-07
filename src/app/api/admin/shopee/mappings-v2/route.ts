import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeCostTwd, computePrice, costCnyFromPrices, DEFAULT_RULE, PricingRule } from '@/lib/shopee-pricing'

// GET ?account_id= — 列表，即時算成本/計算售價/最終售價/毛利
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = new URL(request.url).searchParams.get('account_id')
  if (!accountId) return NextResponse.json({ error: '請選擇蝦皮帳號' }, { status: 400 })
  const supabase = createAdminClient()

  const { data: options } = await supabase.from('shopee_product_options_v2')
    .select('*').eq('account_id', accountId).order('shopee_product_name').order('shopee_variation_name')

  const { data: ruleRow } = await supabase.from('shopee_pricing_rules')
    .select('multiplier, add_amount, rounding, round_to').eq('account_id', accountId).maybeSingle()
  const rule: PricingRule = ruleRow ? {
    multiplier: Number(ruleRow.multiplier), add_amount: Number(ruleRow.add_amount),
    rounding: ruleRow.rounding, round_to: Number(ruleRow.round_to),
  } : DEFAULT_RULE

  const { data: rateRow } = await supabase.from('exchange_rates').select('rate').eq('currency', 'CNY').single()
  const cnyRate = rateRow ? Number(rateRow.rate) : 0.2128

  // 對應到的 BC 商品（價格 + 名稱）
  const skuIds = [...new Set((options || []).map(o => o.bc_sku_id).filter(Boolean))] as string[]
  const { data: bcProducts } = skuIds.length
    ? await supabase.from('bc_products').select('sku_id, name, prices').in('sku_id', skuIds)
    : { data: [] }
  const bcMap = new Map((bcProducts || []).map(p => [p.sku_id, p]))

  const result = (options || []).map(o => {
    const bc = o.bc_sku_id ? bcMap.get(o.bc_sku_id) : null
    const costCny = bc ? costCnyFromPrices(bc.prices as { copies: string; settlementPrice: string }[] | null, o.copies) : 0
    const costTwd = computeCostTwd(costCny, cnyRate)
    const calcPrice = costTwd ? computePrice(costTwd, rule) : 0
    const finalPrice = o.price_override != null ? Number(o.price_override) : calcPrice
    const margin = finalPrice && costTwd ? finalPrice - costTwd : null
    return {
      ...o,
      bc_name: bc?.name || null,
      cost_cny: costCny || null,
      cost_twd: costTwd || null,
      calc_price: calcPrice || null,
      final_price: finalPrice || null,
      margin,
      margin_pct: margin != null && finalPrice ? Math.round((margin / finalPrice) * 1000) / 10 : null,
    }
  })

  return NextResponse.json({ options: result, rule })
}

// PATCH — 更新對應(bc_sku_id+copies) 或 覆蓋售價(price_override，null=清除)
export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('bc_sku_id' in body) updates.bc_sku_id = body.bc_sku_id || null
  if ('copies' in body) updates.copies = body.copies || null
  if ('price_override' in body) {
    const v = body.price_override
    updates.price_override = v === null || v === '' ? null : Number(v)
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('shopee_product_options_v2').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= — 刪除選項
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('shopee_product_options_v2').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
