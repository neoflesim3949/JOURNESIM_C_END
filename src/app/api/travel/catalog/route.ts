import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkTravelAuth } from '@/lib/travel-auth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pageAll(query: (from: number) => any): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from)
    if (error || !data || data.length === 0) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

// GET ?group_id= — 可拉進團的套餐（依團的途經國家精準匹配；帶建議售價與旅行社成本）
export async function GET(request: Request) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const groupId = searchParams.get('group_id')
  const supabase = createAdminClient()

  let groupCountries: string[] = []
  if (groupId) {
    const { data: g } = await supabase.from('tour_groups').select('countries, agency_id').eq('id', groupId).single()
    if (!g || g.agency_id !== sess.agency_id) return NextResponse.json({ error: '找不到團' }, { status: 404 })
    groupCountries = Array.isArray(g.countries) ? g.countries : []
  }

  const packages = await pageAll(from => supabase.from('packages').select('id, name, product_type, is_active').eq('is_active', true).range(from, from + 999))
  const plans = await pageAll(from => supabase.from('package_plans').select('id, package_id, bc_sku_id, display_name, bc_name_snapshot').eq('is_active', true).range(from, from + 999))
  const prices = await pageAll(from => supabase.from('package_plan_prices').select('package_plan_id, copies, sell_price, cost_price').range(from, from + 999))
  const cps = await pageAll(from => supabase.from('country_packages').select('mcc, package_id').range(from, from + 999))
  const countries = await pageAll(from => supabase.from('bc_countries').select('mcc, name').range(from, from + 999))
  // BC 品名（方案＋流量）：sku_id → name
  const bcProducts = await pageAll(from => supabase.from('bc_products').select('sku_id, name').range(from, from + 999))
  const skuName = new Map<string, string>()
  for (const p of bcProducts) skuName.set(p.sku_id, p.name)

  const mccName = new Map<string, string>()
  for (const c of countries) mccName.set(c.mcc, c.name)
  const pkgCountries = new Map<string, Set<string>>()
  for (const cp of cps) {
    const name = mccName.get(cp.mcc)
    if (!name) continue
    if (!pkgCountries.has(cp.package_id)) pkgCountries.set(cp.package_id, new Set())
    pkgCountries.get(cp.package_id)!.add(name)
  }

  const pkgById = new Map(packages.map(p => [p.id, p]))
  const planById = new Map(plans.map(p => [p.id, p]))

  const items: unknown[] = []
  for (const pr of prices) {
    const plan = planById.get(pr.package_plan_id)
    if (!plan) continue
    const pkg = pkgById.get(plan.package_id)
    if (!pkg) continue
    const cset = pkgCountries.get(pkg.id) || new Set<string>()
    if (groupCountries.length > 0 && !groupCountries.every(c => cset.has(c))) continue
    const copies = String(pr.copies ?? '')
    // 名稱以「方案＋流量」為主：BC 品名 > 品名快照 > 顯示名 > 套餐名
    const name = skuName.get(plan.bc_sku_id) || plan.bc_name_snapshot || plan.display_name || pkg.name
    items.push({
      key: `${plan.id}:${copies}`,
      package_id: pkg.id,
      package_plan_id: plan.id,
      bc_sku_id: plan.bc_sku_id || null,
      copies,
      name,
      plan_type: pkg.product_type === 'sim' ? 'sim' : 'esim',
      countries: [...cset],
      suggested_price: pr.sell_price != null ? Number(pr.sell_price) : null,
      our_cost: pr.cost_price != null ? Number(pr.cost_price) : 0,
    })
  }

  return NextResponse.json({ items })
}
