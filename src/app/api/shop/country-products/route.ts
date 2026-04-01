import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mcc = searchParams.get('mcc')

  if (!mcc) return NextResponse.json([])

  const supabase = createAdminClient()

  // 取得該國家的上架方案
  const { data: products } = await supabase
    .from('products')
    .select('id, name, product_type')
    .eq('country_code', mcc)
    .eq('is_active', true)
    .order('sort_order')

  if (!products || products.length === 0) return NextResponse.json([])

  // 取每個方案的最低售價
  const productIds = products.map((p) => p.id)
  const { data: plans } = await supabase
    .from('product_plans')
    .select('product_id, id')
    .in('product_id', productIds)

  const planIds = (plans || []).map((p) => p.id)
  const planProductMap = new Map((plans || []).map((p) => [p.id, p.product_id]))

  let lowestPrices = new Map<string, number>()

  if (planIds.length > 0) {
    const { data: prices } = await supabase
      .from('product_plan_prices')
      .select('product_plan_id, sell_price')
      .in('product_plan_id', planIds)
      .gt('sell_price', 0)

    for (const p of prices || []) {
      const productId = planProductMap.get(p.product_plan_id)
      if (!productId) continue
      const current = lowestPrices.get(productId)
      if (!current || p.sell_price < current) {
        lowestPrices.set(productId, p.sell_price)
      }
    }
  }

  const result = products.map((p) => ({
    id: p.id,
    name: p.name,
    product_type: p.product_type,
    lowest_price: lowestPrices.get(p.id) || null,
  }))

  return NextResponse.json(result)
}
