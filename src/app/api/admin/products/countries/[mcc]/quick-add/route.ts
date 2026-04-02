import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mcc: string }> }
) {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { mcc } = await params
  const { product_id } = await request.json()
  const supabase = createAdminClient()
  const code = mcc.toUpperCase()

  // 1. 找出所有 BC 商品中覆蓋此 MCC 的 SKU
  const { data: allBcProducts } = await supabase
    .from('bc_products')
    .select('sku_id, country_data')

  const matchingSkuIds = new Set<string>()
  for (const p of allBcProducts || []) {
    const countries = p.country_data as { mcc: string }[] | null
    if (countries?.some((c) => c.mcc.toUpperCase() === code)) {
      matchingSkuIds.add(p.sku_id)
    }
  }

  if (matchingSkuIds.size === 0) {
    return NextResponse.json({ added: 0 })
  }

  // 2. 找出哪些套餐包含這些 SKU
  const { data: packagePlans } = await supabase
    .from('package_plans')
    .select('package_id, bc_sku_id')

  const matchingPackageIds = new Set<string>()
  for (const pp of packagePlans || []) {
    if (matchingSkuIds.has(pp.bc_sku_id)) {
      matchingPackageIds.add(pp.package_id)
    }
  }

  if (matchingPackageIds.size === 0) {
    return NextResponse.json({ added: 0 })
  }

  // 3. 排除已加入的
  const { data: existing } = await supabase
    .from('product_packages')
    .select('package_id')
    .eq('product_id', product_id)

  const existingIds = new Set((existing || []).map((e) => e.package_id))
  const toAdd = Array.from(matchingPackageIds).filter((id) => !existingIds.has(id))

  if (toAdd.length === 0) {
    return NextResponse.json({ added: 0 })
  }

  // 4. 加入
  const records = toAdd.map((package_id) => ({ product_id, package_id }))
  const { error } = await supabase
    .from('product_packages')
    .upsert(records, { onConflict: 'product_id,package_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ added: toAdd.length })
}
