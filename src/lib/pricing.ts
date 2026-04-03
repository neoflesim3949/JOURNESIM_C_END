import { SupabaseClient } from '@supabase/supabase-js'

/**
 * 計算指定 MCC 的最低起價
 * bc_countries.mcc → country_packages → packages → package_plans → package_plan_prices
 */
export async function getLowestPricesByMcc(supabase: SupabaseClient, mccs: string[]): Promise<Map<string, number>> {
  const lowestByMcc = new Map<string, number>()
  if (!mccs || mccs.length === 0) return lowestByMcc

  const { data: links } = await supabase
    .from('country_packages')
    .select('mcc, package_id')
    .in('mcc', mccs)

  if (!links || links.length === 0) return lowestByMcc

  const packageIds = [...new Set(links.map((l) => l.package_id))]
  const pkgToMccs = new Map<string, Set<string>>()
  for (const l of links) {
    if (!pkgToMccs.has(l.package_id)) pkgToMccs.set(l.package_id, new Set())
    pkgToMccs.get(l.package_id)!.add(l.mcc)
  }

  const { data: plans } = await supabase
    .from('package_plans').select('id, package_id').in('package_id', packageIds)
  if (!plans || plans.length === 0) return lowestByMcc

  const planIds = plans.map((p) => p.id)
  const planToPkg = new Map(plans.map((p) => [p.id, p.package_id]))

  const { data: prices } = await supabase
    .from('package_plan_prices').select('package_plan_id, sell_price').in('package_plan_id', planIds).gt('sell_price', 0)

  for (const pr of prices || []) {
    const pkgId = planToPkg.get(pr.package_plan_id)
    if (!pkgId) continue
    const mccSet = pkgToMccs.get(pkgId)
    if (!mccSet) continue
    for (const mcc of mccSet) {
      const cur = lowestByMcc.get(mcc)
      if (!cur || pr.sell_price < cur) lowestByMcc.set(mcc, pr.sell_price)
    }
  }

  return lowestByMcc
}
