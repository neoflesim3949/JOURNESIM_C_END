import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mcc = searchParams.get('mcc')

  if (!mcc) return NextResponse.json([])

  const supabase = createAdminClient()

  // 找出此國家關聯的 product_ids
  const { data: products } = await supabase
    .from('products')
    .select('id')
    .eq('country_code', mcc)
    .eq('is_active', true)

  if (!products || products.length === 0) return NextResponse.json([])

  const productIds = products.map((p) => p.id)

  // 取得關聯的套餐 IDs
  const { data: links } = await supabase
    .from('product_packages')
    .select('package_id')
    .in('product_id', productIds)

  const packageIds = [...new Set((links || []).map((l) => l.package_id))]
  if (packageIds.length === 0) return NextResponse.json([])

  // 取得套餐資訊
  const { data: packages } = await supabase
    .from('packages')
    .select('id, name, description, product_type, is_active')
    .in('id', packageIds)
    .eq('is_active', true)

  if (!packages || packages.length === 0) return NextResponse.json([])

  // 取得每個套餐的最低售價
  const { data: allPlans } = await supabase
    .from('package_plans')
    .select('id, package_id')
    .in('package_id', packageIds)

  const planIds = (allPlans || []).map((p) => p.id)
  const planToPkg = new Map((allPlans || []).map((p) => [p.id, p.package_id]))

  const lowestPrices = new Map<string, number>()
  if (planIds.length > 0) {
    const { data: prices } = await supabase
      .from('package_plan_prices')
      .select('package_plan_id, sell_price')
      .in('package_plan_id', planIds)
      .gt('sell_price', 0)

    for (const p of prices || []) {
      const pkgId = planToPkg.get(p.package_plan_id)
      if (!pkgId) continue
      const current = lowestPrices.get(pkgId)
      if (!current || p.sell_price < current) lowestPrices.set(pkgId, p.sell_price)
    }
  }

  // 回傳套餐列表（前台主要實體是套餐）
  const result = packages.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    product_type: pkg.product_type,
    lowest_price: lowestPrices.get(pkg.id) || null,
  }))

  return NextResponse.json(result)
}
