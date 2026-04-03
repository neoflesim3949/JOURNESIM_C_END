import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdminAuth, getUnauthorizedResponse } from '@/lib/admin'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mcc: string }> }
) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const { mcc } = await params
  const supabase = createAdminClient()
  const code = mcc.toUpperCase()

  // 1. 找覆蓋此 MCC 的 BC SKU
  const { data: allBc } = await supabase.from('bc_products').select('sku_id, country_data')
  const matchingSkus = new Set<string>()
  for (const p of allBc || []) {
    const countries = p.country_data as { mcc: string }[] | null
    if (countries?.some((c) => c.mcc.toUpperCase() === code)) matchingSkus.add(p.sku_id)
  }
  if (matchingSkus.size === 0) return NextResponse.json({ added: 0 })

  // 2. 找包含這些 SKU 的套餐
  const { data: plans } = await supabase.from('package_plans').select('package_id, bc_sku_id')
  const matchingPkgs = new Set<string>()
  for (const pp of plans || []) { if (matchingSkus.has(pp.bc_sku_id)) matchingPkgs.add(pp.package_id) }
  if (matchingPkgs.size === 0) return NextResponse.json({ added: 0 })

  // 3. 排除已加入的
  const { data: existing } = await supabase.from('country_packages').select('package_id').eq('mcc', mcc)
  const existingIds = new Set((existing || []).map((e) => e.package_id))
  const toAdd = Array.from(matchingPkgs).filter((id) => !existingIds.has(id))
  if (toAdd.length === 0) return NextResponse.json({ added: 0 })

  // 4. 加入
  const records = toAdd.map((package_id) => ({ mcc, package_id }))
  const { error } = await supabase.from('country_packages').upsert(records, { onConflict: 'mcc,package_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ added: toAdd.length })
}
