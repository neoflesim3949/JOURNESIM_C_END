import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { ESIM_TYPES, SIM_TYPES } from '@/lib/bc-enums'


// POST — 匯入 BC 商品到套餐（按名稱/MCC 搜尋或指定 SKU）
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { sku_ids, country_code, product_type } = body as {
    sku_ids?: string[]
    country_code?: string
    product_type?: string
  }

  const supabase = createAdminClient()

  // 確認套餐存在
  const { data: pkg } = await supabase.from('packages').select('id, product_type').eq('id', id).single()
  if (!pkg) return NextResponse.json({ error: '套餐不存在' }, { status: 404 })

  const isSim = (product_type || pkg.product_type) === 'sim'

  let matched: { sku_id: string; plan_type: string | null; prices: unknown }[]

  if (sku_ids && sku_ids.length > 0) {
    const { data } = await supabase.from('bc_products').select('sku_id, plan_type, prices').in('sku_id', sku_ids)
    matched = data || []
  } else if (country_code) {
    const { data: country } = await supabase.from('bc_countries').select('name').eq('mcc', country_code).single()
    const countryName = (country?.name || '').toLowerCase()
    const code = country_code.toUpperCase()

    // 掃描該類型「上架中」商品，JS 過濾：名稱含國名 或 country_data 含該 MCC（含多國/區域方案）
    // 不用 country_data::text ILIKE，因 JSONB 序列化會在冒號後加空白，pattern 容易對不上
    const skuMap = new Map<string, { sku_id: string; plan_type: string | null; prices: unknown }>()
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('bc_products')
        .select('sku_id, name, plan_type, prices, country_data, type, rechargeable_product')
        .or('is_active.is.null,is_active.eq.true')
      q = isSim
        ? q.in('type', SIM_TYPES)
        : q.or(`type.in.(${ESIM_TYPES.join(',')}),rechargeable_product.eq.1`)
      const { data } = await q.range(from, from + 999)
      if (!data || data.length === 0) break
      for (const p of data) {
        const n = (p.name || '').toLowerCase()
        if (n.includes('加速') || n.includes('accel')) continue
        const cs = p.country_data as { mcc?: string }[] | null
        const hasMcc = Array.isArray(cs) && cs.some((c) => (c.mcc || '').toUpperCase() === code)
        const nameMatch = countryName.length > 0 && n.includes(countryName)
        if (hasMcc || nameMatch) skuMap.set(p.sku_id, { sku_id: p.sku_id, plan_type: p.plan_type, prices: p.prices })
      }
      if (data.length < 1000) break
    }
    matched = Array.from(skuMap.values())
  } else {
    return NextResponse.json({ error: '缺少 sku_ids 或 country_code' }, { status: 400 })
  }

  if (matched.length === 0) return NextResponse.json({ error: '沒有找到 BC 商品' }, { status: 404 })

  // Upsert package_plans
  const BATCH = 30
  const planRecords = matched.map((p) => ({
    package_id: id,
    bc_sku_id: p.sku_id,
    plan_category: p.plan_type === '1' ? 'daily' : 'fixed',
  }))

  for (let i = 0; i < planRecords.length; i += BATCH) {
    const batch = planRecords.slice(i, i + BATCH)
    const { error } = await supabase.from('package_plans').upsert(batch, { onConflict: 'package_id,bc_sku_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 取回 plan IDs
  const { data: createdPlans } = await supabase.from('package_plans').select('id, bc_sku_id').eq('package_id', id)
  const planIdMap = new Map((createdPlans || []).map((p) => [p.bc_sku_id, p.id]))

  // 取得現有價格（用於偵測異動）
  const existingPlanIds = Array.from(planIdMap.values())
  const { data: existingPrices } = existingPlanIds.length > 0
    ? await supabase.from('package_plan_prices').select('package_plan_id, copies, cost_price').in('package_plan_id', existingPlanIds)
    : { data: [] }

  const existingPriceMap = new Map<string, number>()
  for (const ep of existingPrices || []) {
    existingPriceMap.set(`${ep.package_plan_id}_${ep.copies}`, ep.cost_price)
  }

  // 建立 copies 價格（偵測異動）
  const priceRecords: { package_plan_id: string; copies: string; cost_price: number; original_cost_price?: number; price_changed?: boolean; changed_at?: string }[] = []
  for (const bc of matched) {
    const planId = planIdMap.get(bc.sku_id)
    if (!planId) continue
    const prices = bc.prices as { copies: string; settlementPrice: string }[] | null
    if (!prices) continue
    for (const p of prices) {
      const newCost = Number(p.settlementPrice) || 0
      const key = `${planId}_${p.copies}`
      const oldCost = existingPriceMap.get(key)

      const record: typeof priceRecords[0] = { package_plan_id: planId, copies: p.copies, cost_price: newCost }

      if (oldCost !== undefined && oldCost !== newCost) {
        // 價格異動：舊價放 original_cost_price
        record.original_cost_price = oldCost
        record.price_changed = true
        record.changed_at = new Date().toISOString()
      }

      priceRecords.push(record)
    }
  }

  for (let i = 0; i < priceRecords.length; i += BATCH) {
    const batch = priceRecords.slice(i, i + BATCH)
    await supabase.from('package_plan_prices').upsert(batch, { onConflict: 'package_plan_id,copies' })
  }

  return NextResponse.json({ imported: matched.length, prices: priceRecords.length })
}
