import { buildOptionCode } from './option-code'

export interface OptionIndexItem {
  code: string
  bc_sku_id: string
  copies: string
  sell_price: number | null
  package_name: string
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// 分頁撈全（PostgREST 單次預設上限 1000 筆）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pageAll(build: () => any): Promise<any[]> {
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

// 建立套餐選項貨號索引：code → { bc_sku_id, copies, sell_price, package_name }
// 供商品對應 V2 解析「填入的套餐選項貨號」對應的 BC 與售價
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildOptionIndex(supabase: any): Promise<OptionIndexItem[]> {
  const { data: pkgs } = await supabase.from('packages')
    .select('id, name, main_option_code').not('main_option_code', 'is', null)
  if (!pkgs || pkgs.length === 0) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkgMap = new Map<string, any>(pkgs.map((p: any) => [p.id, p]))

  const pkgIds = pkgs.map((p: { id: string }) => p.id) as string[]
  // package_plans（依 package_id 分批，每批分頁）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plans: any[] = []
  for (const ids of chunk(pkgIds, 200)) {
    plans.push(...await pageAll(() => supabase.from('package_plans').select('id, package_id, bc_sku_id, is_unlimited').in('package_id', ids)))
  }
  if (plans.length === 0) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planMap = new Map<string, any>(plans.map((p: any) => [p.id, p]))

  // package_plan_prices（依 plan_id 分批，每批分頁；總筆數可能上萬，務必分頁避免 1000 筆截斷）
  const planIds = plans.map((p) => p.id) as string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prices: any[] = []
  for (const ids of chunk(planIds, 200)) {
    prices.push(...await pageAll(() => supabase.from('package_plan_prices').select('package_plan_id, copies, sell_price').in('package_plan_id', ids)))
  }

  const skuIds = [...new Set(plans.map((p) => p.bc_sku_id).filter(Boolean))] as string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bcs: any[] = []
  for (const ids of chunk(skuIds, 200)) {
    bcs.push(...await pageAll(() => supabase.from('bc_products').select('sku_id, days, capacity, high_flow_size, limit_flow_speed, plan_type').in('sku_id', ids)))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bcMap = new Map<string, any>(bcs.map((b: any) => [b.sku_id, b]))

  const items: OptionIndexItem[] = []
  for (const pr of prices) {
    const plan = planMap.get(pr.package_plan_id)
    if (!plan) continue
    const pkg = pkgMap.get(plan.package_id)
    const bc = bcMap.get(plan.bc_sku_id)
    if (!pkg?.main_option_code || !bc) continue
    const unitDays = Number(bc.days) || 1
    const days = unitDays * (parseInt(pr.copies) || 1)
    const code = buildOptionCode(pkg.main_option_code, bc, days, !!plan.is_unlimited)
    if (!code) continue
    items.push({
      code,
      bc_sku_id: plan.bc_sku_id,
      copies: pr.copies,
      sell_price: pr.sell_price != null ? Number(pr.sell_price) : null,
      package_name: pkg.name,
    })
  }
  return items
}
