import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

// GET — 套餐詳情 + BC 商品 + 價格
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()

  const { data: pkg } = await supabase.from('packages').select('*').eq('id', id).single()
  if (!pkg) return NextResponse.json({ error: '套餐不存在' }, { status: 404 })

  // 取得綁定的 BC 商品
  const { data: plans } = await supabase
    .from('package_plans')
    .select('*')
    .eq('package_id', id)
    .order('sort_order')
    .order('created_at')

  if (!plans || plans.length === 0) {
    return NextResponse.json({ package: pkg, plans: [] })
  }

  // BC 商品資訊
  const skuIds = plans.map((p) => p.bc_sku_id)
  const { data: bcProducts } = await supabase
    .from('bc_products')
    .select('sku_id, name, type, days, capacity, high_flow_size, limit_flow_speed, plan_type, rechargeable_product')
    .in('sku_id', skuIds)
  const bcMap = new Map((bcProducts || []).map((p) => [p.sku_id, p]))

  // 價格
  const planIds = plans.map((p) => p.id)
  const { data: allPrices } = await supabase
    .from('package_plan_prices')
    .select('*')
    .in('package_plan_id', planIds)
    .order('copies')

  const priceMap = new Map<string, typeof allPrices>()
  for (const p of allPrices || []) {
    if (!priceMap.has(p.package_plan_id)) priceMap.set(p.package_plan_id, [])
    priceMap.get(p.package_plan_id)!.push(p)
  }

  const result = plans.map((p) => {
    const bc = bcMap.get(p.bc_sku_id)
    return {
      id: p.id,
      bc_sku_id: p.bc_sku_id,
      bc_name: bc?.name || '',
      bc_type: bc?.type || '',
      display_name: p.display_name || null,
      sort_order: p.sort_order || 0,
      plan_category: p.plan_category,
      days: bc?.days || null,
      capacity: bc?.capacity || null,
      high_flow_size: bc?.high_flow_size || null,
      limit_flow_speed: bc?.limit_flow_speed || null,
      plan_type: bc?.plan_type || null,
      rechargeable_product: bc?.rechargeable_product || null,
      is_active: p.is_active,
      copy_prices: (priceMap.get(p.id) || [])
        .sort((a, b) => parseInt(a.copies) - parseInt(b.copies))
        .map((pr) => ({
          id: pr.id,
          copies: pr.copies,
          cost_price: pr.cost_price,
          original_cost_price: pr.original_cost_price || null,
          sell_price: pr.sell_price,
          price_changed: pr.price_changed || false,
        })),
    }
  })

  return NextResponse.json({ package: pkg, plans: result })
}
