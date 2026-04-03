import { SupabaseClient } from '@supabase/supabase-js'

/**
 * 計算指定產品清單（或國家 MCC 清單）的最低起價
 * 透過 products -> product_packages -> packages -> package_plans -> package_plan_prices
 */
export async function getLowestPricesByMcc(supabase: SupabaseClient, countryMccs: string[]): Promise<Map<string, number>> {
  const lowestByMcc = new Map<string, number>()
  if (!countryMccs || countryMccs.length === 0) return lowestByMcc

  // 1. 取得對應 MCC 的已啟用產品
  const { data: products } = await supabase
    .from('products')
    .select('id, country_code')
    .in('country_code', countryMccs)
    .not('is_active', 'eq', false)

  if (!products || products.length === 0) return lowestByMcc

  const productIds = products.map((p) => p.id)
  const pidToMcc = new Map(products.map((p) => [p.id, p.country_code]))

  // 2. 取得產品關聯的套餐 ID
  const { data: links } = await supabase
    .from('product_packages')
    .select('product_id, package_id')
    .in('product_id', productIds)

  if (!links || links.length === 0) return lowestByMcc

  const packageIds = [...new Set(links.map((l) => l.package_id))]
  const pkgToMccs = new Map<string, Set<string>>()
  for (const l of links) {
    const mcc = pidToMcc.get(l.product_id)
    if (!mcc) continue
    if (!pkgToMccs.has(l.package_id)) pkgToMccs.set(l.package_id, new Set())
    pkgToMccs.get(l.package_id)!.add(mcc)
  }

  // 3. 取得套餐對應的方案與價格
  const { data: plans } = await supabase
    .from('package_plans')
    .select('id, package_id')
    .in('package_id', packageIds)

  if (!plans || plans.length === 0) return lowestByMcc

  const planIds = plans.map((p) => p.id)
  const planToPkg = new Map(plans.map((p) => [p.id, p.package_id]))

  const { data: prices } = await supabase
    .from('package_plan_prices')
    .select('package_plan_id, sell_price')
    .in('package_plan_id', planIds)
    .gt('sell_price', 0)

  // 4. 統計各產品 (MCC) 的最低價
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

  return lowestByMcc
}
