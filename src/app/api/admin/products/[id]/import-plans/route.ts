import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { country_code, sku_ids } = body as { country_code?: string; sku_ids?: string[] }
  const supabase = createAdminClient()

  // 確認方案存在，取得 product_type
  const { data: product } = await supabase.from('products').select('id, product_type').eq('id', id).single()
  if (!product) return NextResponse.json({ error: '方案不存在' }, { status: 404 })

  // 根據方案類型決定 BC type 過濾
  const ESIM_TYPES = ['110', '111', '3105', '3106']
  const SIM_TYPES = ['110', '111', '210', '211', '212', '220', '221', '311', '3101', '3102', '3103', '3104', '3201', '3202', '3211', '3212']
  const allowedTypes = product.product_type === 'sim' ? SIM_TYPES : ESIM_TYPES

  let matched: { sku_id: string; plan_type: string | null; cost_price: number | null; prices: unknown }[]

  if (sku_ids && sku_ids.length > 0) {
    // 手動選擇：按指定 SKU 匯入
    const { data } = await supabase
      .from('bc_products')
      .select('sku_id, plan_type, cost_price, prices')
      .in('sku_id', sku_ids)
    matched = data || []
  } else if (country_code) {
    // 自動匯入：從本地 bc_products 查詢
    // 先查國家名稱
    const { data: country } = await supabase
      .from('bc_countries')
      .select('name')
      .eq('mcc', country_code)
      .single()

    const countryName = country?.name || ''
    const code = country_code.toUpperCase()

    // 用商品名稱模糊匹配 + type 過濾
    const { data: byName } = await supabase
      .from('bc_products')
      .select('sku_id, name, plan_type, cost_price, prices')
      .ilike('name', `%${countryName}%`)
      .in('type', allowedTypes)

    // 也查 country_data 文字中包含 country_code 的
    const { data: byCountryData } = await supabase
      .from('bc_products')
      .select('sku_id, name, plan_type, cost_price, prices')
      .ilike('country_data::text', `%"mcc":"${code}"%`)
      .in('type', allowedTypes)

    // 合併去重 + 排除加速包（名稱含「加速」或「acceleration」）
    const skuMap = new Map<string, typeof matched[0]>()
    for (const p of [...(byName || []), ...(byCountryData || [])]) {
      const n = (p.name || '').toLowerCase()
      if (n.includes('加速') || n.includes('accel') || n.includes('boost')) continue
      skuMap.set(p.sku_id, p)
    }
    matched = Array.from(skuMap.values())
  } else {
    return NextResponse.json({ error: '缺少 country_code 或 sku_ids' }, { status: 400 })
  }

  if (matched.length === 0) {
    return NextResponse.json({ error: '沒有找到 BC 商品' }, { status: 404 })
  }

  // 1. Upsert product_plans
  const planRecords = matched.map((p) => ({
    product_id: id,
    bc_sku_id: p.sku_id,
    plan_category: p.plan_type === '1' ? 'daily' : 'fixed',
    sell_price: 0,
  }))

  const BATCH = 30
  for (let i = 0; i < planRecords.length; i += BATCH) {
    const batch = planRecords.slice(i, i + BATCH)
    const { error } = await supabase.from('product_plans').upsert(batch, { onConflict: 'product_id,bc_sku_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 2. 取回剛建立的 product_plans ID
  const { data: createdPlans } = await supabase
    .from('product_plans')
    .select('id, bc_sku_id')
    .eq('product_id', id)

  const planIdMap = new Map((createdPlans || []).map((p) => [p.bc_sku_id, p.id]))

  // 3. 為每個 copies 建立價格行
  const priceRecords: { product_plan_id: string; copies: string; cost_price: number }[] = []

  for (const bc of matched) {
    const planId = planIdMap.get(bc.sku_id)
    if (!planId) continue
    const prices = bc.prices as { copies: string; settlementPrice: string }[] | null
    if (!prices) continue

    for (const p of prices) {
      priceRecords.push({
        product_plan_id: planId,
        copies: p.copies,
        cost_price: Number(p.settlementPrice) || 0,
      })
    }
  }

  for (let i = 0; i < priceRecords.length; i += BATCH) {
    const batch = priceRecords.slice(i, i + BATCH)
    const { error } = await supabase
      .from('product_plan_prices')
      .upsert(batch, { onConflict: 'product_plan_id,copies' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ imported: matched.length, prices: priceRecords.length })
}
