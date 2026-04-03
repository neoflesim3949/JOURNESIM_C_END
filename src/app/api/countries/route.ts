import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()

  const { data: countriesRaw } = await supabase
    .from('bc_countries')
    .select('mcc, name, name_zh, continent, continent_zh, flag_url')
    .order('name')

  // 計算每個國家的起價（透過 products → product_packages → packages → package_plans → package_plan_prices）
  const { data: products } = await supabase
    .from('products')
    .select('id, country_code')
    .not('is_active', 'eq', false)
    .or('scope.eq.local,scope.is.null')

  const productIds = (products || []).map((p) => p.id)
  const pidToMcc = new Map((products || []).map((p) => [p.id, p.country_code]))

  const lowestByMcc = new Map<string, number>()

  if (productIds.length > 0) {
    const { data: links } = await supabase
      .from('product_packages')
      .select('product_id, package_id')
      .in('product_id', productIds)

    const packageIds = [...new Set((links || []).map((l) => l.package_id))]
    const pkgToMccs = new Map<string, Set<string>>()
    for (const l of links || []) {
      const mcc = pidToMcc.get(l.product_id)
      if (!mcc) continue
      if (!pkgToMccs.has(l.package_id)) pkgToMccs.set(l.package_id, new Set())
      pkgToMccs.get(l.package_id)!.add(mcc)
    }

    if (packageIds.length > 0) {
      const { data: plans } = await supabase
        .from('package_plans')
        .select('id, package_id')
        .in('package_id', packageIds)

      const planIds = (plans || []).map((p) => p.id)
      const planToPkg = new Map((plans || []).map((p) => [p.id, p.package_id]))

      if (planIds.length > 0) {
        const { data: prices } = await supabase
          .from('package_plan_prices')
          .select('package_plan_id, sell_price')
          .in('package_plan_id', planIds)
          .gt('sell_price', 0)

        for (const pr of prices || []) {
          const pkgId = planToPkg.get(pr.package_plan_id)
          if (!pkgId) continue
          const mccs = pkgToMccs.get(pkgId)
          if (!mccs) continue
          for (const mcc of mccs) {
            const cur = lowestByMcc.get(mcc)
            if (!cur || pr.sell_price < cur) lowestByMcc.set(mcc, pr.sell_price)
          }
        }
      }
    }
  }

  const result = (countriesRaw || []).map((c) => ({
    mcc: c.mcc,
    name: c.name_zh || c.name,
    continent: c.continent_zh || c.continent,
    flag_url: c.flag_url,
    lowest_price: lowestByMcc.get(c.mcc) || null,
  }))

  return NextResponse.json(result)
}
