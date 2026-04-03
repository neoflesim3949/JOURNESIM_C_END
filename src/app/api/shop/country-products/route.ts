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

  // 取得每個方案關聯的套餐（新架構：product_packages → packages → package_plans → package_plan_prices）
  const productIds = products.map((p) => p.id)

  const { data: productPkgLinks } = await supabase
    .from('product_packages')
    .select('product_id, package_id')
    .in('product_id', productIds)

  if (!productPkgLinks || productPkgLinks.length === 0) {
    // 沒有新架構的資料，fallback 試舊架構
    return NextResponse.json(products.map((p) => ({
      id: p.id, name: p.name, product_type: p.product_type, lowest_price: null,
    })))
  }

  // 取得所有關聯的套餐 ID
  const packageIds = [...new Set(productPkgLinks.map((l) => l.package_id))]

  // 取得套餐下的 plan IDs
  const { data: packagePlans } = await supabase
    .from('package_plans')
    .select('id, package_id')
    .in('package_id', packageIds)

  const planIds = (packagePlans || []).map((p) => p.id)
  // plan_id → package_id
  const planToPkg = new Map((packagePlans || []).map((p) => [p.id, p.package_id]))
  // package_id → product_ids
  const pkgToProducts = new Map<string, Set<string>>()
  for (const link of productPkgLinks) {
    if (!pkgToProducts.has(link.package_id)) pkgToProducts.set(link.package_id, new Set())
    pkgToProducts.get(link.package_id)!.add(link.product_id)
  }

  // 取得最低售價
  let lowestPrices = new Map<string, number>()

  if (planIds.length > 0) {
    const { data: prices } = await supabase
      .from('package_plan_prices')
      .select('package_plan_id, sell_price')
      .in('package_plan_id', planIds)
      .gt('sell_price', 0)

    for (const p of prices || []) {
      const pkgId = planToPkg.get(p.package_plan_id)
      if (!pkgId) continue
      const productIdSet = pkgToProducts.get(pkgId)
      if (!productIdSet) continue

      for (const productId of productIdSet) {
        const current = lowestPrices.get(productId)
        if (!current || p.sell_price < current) {
          lowestPrices.set(productId, p.sell_price)
        }
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
