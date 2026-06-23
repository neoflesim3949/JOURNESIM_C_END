import { SupabaseClient } from '@supabase/supabase-js'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// 分頁撈全（PostgREST 單次預設上限 1000 筆）
async function pageAll(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: () => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await build().range(from, from + 999)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

/**
 * 計算指定 MCC 的最低起價
 * bc_countries.mcc → country_packages → packages → package_plans → package_plan_prices
 * 全程分頁 + 分批，避免 1000 筆上限造成部分國家漏算起價
 */
export async function getLowestPricesByMcc(supabase: SupabaseClient, mccs: string[]): Promise<Map<string, number>> {
  const lowestByMcc = new Map<string, number>()
  if (!mccs || mccs.length === 0) return lowestByMcc

  const links = await pageAll(() => supabase.from('country_packages').select('mcc, package_id').in('mcc', mccs))
  if (links.length === 0) return lowestByMcc

  const packageIds = [...new Set(links.map((l) => l.package_id))] as string[]
  const pkgToMccs = new Map<string, Set<string>>()
  for (const l of links) {
    if (!pkgToMccs.has(l.package_id)) pkgToMccs.set(l.package_id, new Set())
    pkgToMccs.get(l.package_id)!.add(l.mcc)
  }

  // package_plans（依 package_id 分批，每批再分頁）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plans: any[] = []
  for (const ids of chunk(packageIds, 200)) {
    plans.push(...await pageAll(() => supabase.from('package_plans').select('id, package_id').in('package_id', ids)))
  }
  if (plans.length === 0) return lowestByMcc

  const planIds = plans.map((p) => p.id) as string[]
  const planToPkg = new Map(plans.map((p) => [p.id, p.package_id]))

  // package_plan_prices（依 plan_id 分批，每批再分頁；只取有售價的）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prices: any[] = []
  for (const ids of chunk(planIds, 200)) {
    prices.push(...await pageAll(() => supabase.from('package_plan_prices').select('package_plan_id, sell_price').in('package_plan_id', ids).gt('sell_price', 0)))
  }

  for (const pr of prices) {
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
