import { buildOptionCode } from './option-code'

export interface OptionIndexItem {
  code: string
  bc_sku_id: string
  copies: string
  sell_price: number | null
  package_name: string
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

  const { data: plans } = await supabase.from('package_plans')
    .select('id, package_id, bc_sku_id, is_unlimited').in('package_id', pkgs.map((p: { id: string }) => p.id))
  if (!plans || plans.length === 0) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planMap = new Map<string, any>(plans.map((p: any) => [p.id, p]))

  const { data: prices } = await supabase.from('package_plan_prices')
    .select('package_plan_id, copies, sell_price').in('package_plan_id', plans.map((p: { id: string }) => p.id))

  const skuIds = [...new Set(plans.map((p: { bc_sku_id: string }) => p.bc_sku_id).filter(Boolean))] as string[]
  const { data: bcs } = skuIds.length
    ? await supabase.from('bc_products')
        .select('sku_id, days, capacity, high_flow_size, limit_flow_speed, plan_type').in('sku_id', skuIds)
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bcMap = new Map<string, any>((bcs || []).map((b: any) => [b.sku_id, b]))

  const items: OptionIndexItem[] = []
  for (const pr of prices || []) {
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
