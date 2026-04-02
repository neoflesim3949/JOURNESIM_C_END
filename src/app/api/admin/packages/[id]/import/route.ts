import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

// POST — 匯入 BC 商品到套餐（按名稱/MCC 搜尋或指定 SKU）
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const ESIM_TYPES = ['110', '111', '3105', '3106']
  const SIM_TYPES = ['110', '111', '210', '211', '212', '220', '221', '311', '3101', '3102', '3103', '3104', '3201', '3202', '3211', '3212']
  const allowedTypes = (product_type || pkg.product_type) === 'sim' ? SIM_TYPES : ESIM_TYPES

  let matched: { sku_id: string; plan_type: string | null; prices: unknown }[]

  if (sku_ids && sku_ids.length > 0) {
    const { data } = await supabase.from('bc_products').select('sku_id, plan_type, prices').in('sku_id', sku_ids)
    matched = data || []
  } else if (country_code) {
    const { data: country } = await supabase.from('bc_countries').select('name').eq('mcc', country_code).single()
    const countryName = country?.name || ''
    const code = country_code.toUpperCase()

    const { data: byName } = await supabase.from('bc_products').select('sku_id, name, plan_type, prices')
      .ilike('name', `%${countryName}%`).in('type', allowedTypes)
    const { data: byMcc } = await supabase.from('bc_products').select('sku_id, name, plan_type, prices')
      .ilike('country_data::text', `%"mcc":"${code}"%`).in('type', allowedTypes)

    const skuMap = new Map<string, typeof matched[0]>()
    for (const p of [...(byName || []), ...(byMcc || [])]) {
      const n = (p.name || '').toLowerCase()
      if (!n.includes('加速') && !n.includes('accel')) skuMap.set(p.sku_id, p)
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

  // 建立 copies 價格
  const priceRecords: { package_plan_id: string; copies: string; cost_price: number }[] = []
  for (const bc of matched) {
    const planId = planIdMap.get(bc.sku_id)
    if (!planId) continue
    const prices = bc.prices as { copies: string; settlementPrice: string }[] | null
    if (!prices) continue
    for (const p of prices) {
      priceRecords.push({ package_plan_id: planId, copies: p.copies, cost_price: Number(p.settlementPrice) || 0 })
    }
  }

  for (let i = 0; i < priceRecords.length; i += BATCH) {
    const batch = priceRecords.slice(i, i + BATCH)
    await supabase.from('package_plan_prices').upsert(batch, { onConflict: 'package_plan_id,copies' })
  }

  return NextResponse.json({ imported: matched.length, prices: priceRecords.length })
}
