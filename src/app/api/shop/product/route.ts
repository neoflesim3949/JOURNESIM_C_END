import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const packageId = searchParams.get('id')
  const countryCode = searchParams.get('country')

  if (!packageId) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = createAdminClient()

  // 取得套餐資訊
  const { data: pkg } = await supabase
    .from('packages')
    .select('*')
    .eq('id', packageId)
    .eq('is_active', true)
    .single()

  if (!pkg) return NextResponse.json({ error: '套餐不存在' }, { status: 404 })

  // 取得國家資訊（如果有提供 country code）
  let countryName = ''
  let countryFlag: string | null = null
  if (countryCode) {
    const { data: country } = await supabase
      .from('bc_countries')
      .select('name, name_zh, flag_url')
      .eq('mcc', countryCode)
      .single()
    if (country) {
      countryName = country.name_zh || country.name
      countryFlag = country.flag_url
    }
  }

  // 取得套餐下的所有 BC 商品
  const { data: packagePlans } = await supabase
    .from('package_plans')
    .select('id, bc_sku_id, plan_category, package_id, display_name, sort_order')
    .eq('package_id', packageId)
    .order('sort_order')
    .order('created_at')

  if (!packagePlans || packagePlans.length === 0) {
    return NextResponse.json({
      package: { ...pkg, country_name: countryName, country_flag: countryFlag },
      plans: [],
    })
  }

  // BC 商品資訊
  const skuIds = packagePlans.map((p) => p.bc_sku_id)
  const { data: bcProducts } = await supabase
    .from('bc_products')
    .select('sku_id, name, plan_type, days, capacity, high_flow_size, limit_flow_speed')
    .in('sku_id', skuIds)
  const bcMap = new Map((bcProducts || []).map((p) => [p.sku_id, p]))

  // 價格（只取 sell_price > 0 的）
  const planIds = packagePlans.map((p) => p.id)
  const { data: prices } = await supabase
    .from('package_plan_prices')
    .select('package_plan_id, copies, sell_price')
    .in('package_plan_id', planIds)
    .gt('sell_price', 0)

  const priceMap = new Map<string, { copies: string; sell_price: number }[]>()
  for (const p of prices || []) {
    if (!priceMap.has(p.package_plan_id)) priceMap.set(p.package_plan_id, [])
    priceMap.get(p.package_plan_id)!.push({ copies: p.copies, sell_price: p.sell_price })
  }

  // 排序 copies
  for (const [, arr] of priceMap) {
    arr.sort((a, b) => parseInt(a.copies) - parseInt(b.copies))
  }

  const result = packagePlans
    .filter((p) => priceMap.has(p.id))
    .map((p) => {
      const bc = bcMap.get(p.bc_sku_id)
      return {
        plan_id: p.id,
        bc_sku_id: p.bc_sku_id,
        bc_name: bc?.name || '',
        display_name: p.display_name || null,
        sort_order: p.sort_order || 0,
        plan_category: p.plan_category,
        plan_type: bc?.plan_type || null,
        days: bc?.days ? Number(bc.days) : null,
        capacity: bc?.capacity || null,
        high_flow_size: bc?.high_flow_size || null,
        limit_flow_speed: bc?.limit_flow_speed || null,
        copy_prices: priceMap.get(p.id) || [],
      }
    })

  return NextResponse.json({
    package: {
      ...pkg,
      country_name: countryName,
      country_flag: countryFlag,
    },
    plans: result,
  })
}
