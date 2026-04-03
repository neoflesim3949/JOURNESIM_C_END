import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 取得區域/全球方案列表（含起價）
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') || 'regional' // regional | global

  const supabase = createAdminClient()

  // 取得該 scope 的 products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('scope', scope)
    .not('is_active', 'eq', false)

  if (!products || products.length === 0) return NextResponse.json([])

  // 取得所有 product 關聯的 packages
  const productIds = products.map((p) => p.id)
  const { data: links } = await supabase
    .from('product_packages')
    .select('product_id, package_id')
    .in('product_id', productIds)

  if (!links || links.length === 0) {
    return NextResponse.json(products.map((p) => ({
      id: p.id,
      name: p.country_name || p.name,
      icon_url: p.icon_url,
      country_code: p.country_code,
      lowest_price: null,
    })))
  }

  const packageIds = [...new Set(links.map((l) => l.package_id))]

  // package → product mapping
  const pkgToProducts = new Map<string, Set<string>>()
  for (const l of links) {
    if (!pkgToProducts.has(l.package_id)) pkgToProducts.set(l.package_id, new Set())
    pkgToProducts.get(l.package_id)!.add(l.product_id)
  }

  // 取得每個 package 的最低售價
  const { data: plans } = await supabase
    .from('package_plans')
    .select('id, package_id')
    .in('package_id', packageIds)

  const planIds = (plans || []).map((p) => p.id)
  const planToPkg = new Map((plans || []).map((p) => [p.id, p.package_id]))

  const lowestByProduct = new Map<string, number>()

  if (planIds.length > 0) {
    const { data: prices } = await supabase
      .from('package_plan_prices')
      .select('package_plan_id, sell_price')
      .in('package_plan_id', planIds)
      .gt('sell_price', 0)

    for (const pr of prices || []) {
      const pkgId = planToPkg.get(pr.package_plan_id)
      if (!pkgId) continue
      const prodIds = pkgToProducts.get(pkgId)
      if (!prodIds) continue
      for (const pid of prodIds) {
        const cur = lowestByProduct.get(pid)
        if (!cur || pr.sell_price < cur) lowestByProduct.set(pid, pr.sell_price)
      }
    }
  }

  // 按 country_code 分組（一個 group 可能有多個 products）
  const groupMap = new Map<string, { name: string; icon_url: string | null; country_code: string; lowest_price: number | null; product_ids: string[] }>()
  for (const p of products) {
    const code = p.country_code
    if (!groupMap.has(code)) {
      groupMap.set(code, {
        name: p.country_name || p.name,
        icon_url: p.icon_url,
        country_code: code,
        lowest_price: null,
        product_ids: [],
      })
    }
    const g = groupMap.get(code)!
    g.product_ids.push(p.id)
    const price = lowestByProduct.get(p.id)
    if (price && (!g.lowest_price || price < g.lowest_price)) {
      g.lowest_price = price
    }
  }

  const result = Array.from(groupMap.values()).map((g) => ({
    name: g.name,
    icon_url: g.icon_url,
    country_code: g.country_code,
    lowest_price: g.lowest_price,
  }))

  return NextResponse.json(result)
}
