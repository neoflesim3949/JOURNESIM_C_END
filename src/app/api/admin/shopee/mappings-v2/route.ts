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

  // 分頁撈全部（PostgREST 單次預設上限 1000 筆）
  const options: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('shopee_product_options_v2')
      .select('*').eq('account_id', accountId)
      .order('shopee_product_name').order('shopee_variation_name')
      .range(from, from + 999)
    if (!data || data.length === 0) break
    options.push(...data)
    if (data.length < 1000) break
  }

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

  // V1 自設名稱（商品名稱 / 規格名稱）— chunked .in 避免單次 1000 筆上限
  // V1「商品名稱」key 是完整編碼 商品ID_規格ID（也相容只用商品ID 的舊資料）
  const prodKeySet = new Set<string>()
  for (const o of options) {
    if (o.shopee_product_id) prodKeySet.add(String(o.shopee_product_id))
    if (o.shopee_product_id && o.shopee_variation_id) prodKeySet.add(`${o.shopee_product_id}_${o.shopee_variation_id}`)
  }
  const prodKeys = [...prodKeySet]
  const variationIds = [...new Set(options.map(o => o.shopee_variation_id).filter(Boolean))] as string[]
  const prodNameMap = new Map<string, string>()
  const varNameMap = new Map<string, string>()
  for (let i = 0; i < prodKeys.length; i += 300) {
    const { data } = await supabase.from('shopee_product_id_mappings')
      .select('shopee_product_id, display_name').in('shopee_product_id', prodKeys.slice(i, i + 300))
    for (const r of data || []) prodNameMap.set(r.shopee_product_id, r.display_name)
  }
  for (let i = 0; i < variationIds.length; i += 300) {
    const { data } = await supabase.from('shopee_variation_id_mappings')
      .select('shopee_variation_id, display_name').in('shopee_variation_id', variationIds.slice(i, i + 300))
    for (const r of data || []) varNameMap.set(r.shopee_variation_id, r.display_name)
  }

  const result = (options || []).map(o => {
    const bc = o.bc_sku_id ? bcMap.get(o.bc_sku_id) : null
    const costCny = bc ? costCnyFromPrices(bc.prices as { copies: string; settlementPrice: string }[] | null, o.copies) : 0
    const costTwd = computeCostTwd(costCny, cnyRate)
    const calcPrice = costTwd ? computePrice(costTwd, rule) : 0
    // 售價：覆蓋值 > 原蝦皮價 > 加價規則計算價
    const finalPrice = o.price_override != null ? Number(o.price_override)
      : (o.original_price != null ? Number(o.original_price) : calcPrice)
    const margin = finalPrice && costTwd ? finalPrice - costTwd : null
    return {
      ...o,
      custom_product_name: prodNameMap.get(o.shopee_product_id) || prodNameMap.get(`${o.shopee_product_id}_${o.shopee_variation_id}`) || null,
      custom_variation_name: varNameMap.get(o.shopee_variation_id) || null,
      bc_name: bc?.name || null,
      cost_cny: costCny || null,
      cost_twd: costTwd || null,
      calc_price: calcPrice || null,
      final_price: finalPrice || null,
      margin,
      margin_pct: margin != null && finalPrice ? Math.round((margin / finalPrice) * 1000) / 10 : null,
    }
  })

  // 規格自訂排序
  const specOrders: { product_id: string; spec_type: string; spec_value: string; sort_index: number }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('shopee_spec_order')
      .select('product_id, spec_type, spec_value, sort_index').eq('account_id', accountId).range(from, from + 999)
    if (!data || data.length === 0) break
    specOrders.push(...data)
    if (data.length < 1000) break
  }

  return NextResponse.json({ options: result, rule, spec_orders: specOrders })
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
