import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('productId')
  const countryCode = searchParams.get('countryCode')

  const supabase = createAdminClient()

  if (productId) {
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('is_active', true)
      .single()

    if (!product) return NextResponse.json({ error: '商品不存在' }, { status: 404 })

    // 透過 product_packages → packages → package_plans → package_plan_prices
    const { data: links } = await supabase
      .from('product_packages')
      .select('package_id')
      .eq('product_id', productId)

    const packageIds = (links || []).map((l) => l.package_id)

    let plans: unknown[] = []
    if (packageIds.length > 0) {
      const { data: packagePlans } = await supabase
        .from('package_plans')
        .select('id, bc_sku_id, plan_category, package_id')
        .in('package_id', packageIds)

      const planIds = (packagePlans || []).map((p) => p.id)
      const skuIds = (packagePlans || []).map((p) => p.bc_sku_id)

      const [{ data: prices }, { data: bcProducts }] = await Promise.all([
        planIds.length > 0
          ? supabase.from('package_plan_prices').select('package_plan_id, copies, sell_price').in('package_plan_id', planIds).gt('sell_price', 0)
          : { data: [] },
        skuIds.length > 0
          ? supabase.from('bc_products').select('sku_id, name, plan_type, days, capacity, high_flow_size, limit_flow_speed').in('sku_id', skuIds)
          : { data: [] },
      ])

      const bcMap = new Map((bcProducts || []).map((p) => [p.sku_id, p]))
      const priceMap = new Map<string, { copies: string; sell_price: number }[]>()
      for (const p of prices || []) {
        if (!priceMap.has(p.package_plan_id)) priceMap.set(p.package_plan_id, [])
        priceMap.get(p.package_plan_id)!.push({ copies: p.copies, sell_price: p.sell_price })
      }

      plans = (packagePlans || [])
        .filter((p) => priceMap.has(p.id))
        .map((p) => {
          const bc = bcMap.get(p.bc_sku_id)
          return {
            plan_id: p.id,
            bc_sku_id: p.bc_sku_id,
            bc_name: bc?.name || '',
            plan_category: p.plan_category,
            plan_type: bc?.plan_type || null,
            days: bc?.days ? Number(bc.days) : null,
            high_flow_size: bc?.high_flow_size || null,
            limit_flow_speed: bc?.limit_flow_speed || null,
            copy_prices: priceMap.get(p.id) || [],
          }
        })
    }

    return NextResponse.json({ ...product, plans })
  }

  if (countryCode) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('country_code', countryCode)
      .eq('is_active', true)
      .order('sort_order')

    return NextResponse.json(data || [])
  }

  return NextResponse.json({ error: '請提供 productId 或 countryCode' }, { status: 400 })
}
