import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  if (q.length < 1) return NextResponse.json([])

  const supabase = createAdminClient()

  // 1. 搜套餐名稱
  const { data: byName } = await supabase
    .from('packages')
    .select('id, name, description, product_type, is_active')
    .ilike('name', `%${q}%`)
    .limit(20)

  const resultMap = new Map<string, typeof byName extends (infer T)[] | null ? T : never>()
  for (const p of byName || []) resultMap.set(p.id, p)

  // 2. 如果輸入像 MCC（2-3 碼字母），用 MCC 搜 BC 商品再找套餐
  if (/^[A-Za-z]{2,3}$/.test(q)) {
    const code = q.toUpperCase()

    // 找覆蓋此 MCC 的 BC SKU
    const { data: allBc } = await supabase
      .from('bc_products')
      .select('sku_id, country_data')

    const matchingSkus = new Set<string>()
    for (const p of allBc || []) {
      const countries = p.country_data as { mcc: string }[] | null
      if (countries?.some((c) => c.mcc.toUpperCase() === code)) {
        matchingSkus.add(p.sku_id)
      }
    }

    if (matchingSkus.size > 0) {
      // 找包含這些 SKU 的套餐
      const { data: packagePlans } = await supabase
        .from('package_plans')
        .select('package_id, bc_sku_id')

      const matchingPkgIds = new Set<string>()
      for (const pp of packagePlans || []) {
        if (matchingSkus.has(pp.bc_sku_id)) matchingPkgIds.add(pp.package_id)
      }

      if (matchingPkgIds.size > 0) {
        const { data: byMcc } = await supabase
          .from('packages')
          .select('id, name, description, product_type, is_active')
          .in('id', Array.from(matchingPkgIds))

        for (const p of byMcc || []) resultMap.set(p.id, p)
      }
    }

    // 也用國家名搜
    const { data: countries } = await supabase.from('bc_countries').select('name').ilike('mcc', q)
    if (countries && countries.length > 0) {
      for (const c of countries) {
        const { data: byCountryName } = await supabase
          .from('packages')
          .select('id, name, description, product_type, is_active')
          .ilike('name', `%${c.name}%`)
          .limit(10)

        for (const p of byCountryName || []) resultMap.set(p.id, p)
      }
    }
  }

  return NextResponse.json(Array.from(resultMap.values()))
}
