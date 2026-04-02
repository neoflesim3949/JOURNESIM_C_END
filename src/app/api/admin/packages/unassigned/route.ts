import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // 取得所有已加入套餐的 SKU
  const { data: existingPlans } = await supabase.from('package_plans').select('bc_sku_id')
  const existingSkus = new Set((existingPlans || []).map((p) => p.bc_sku_id))

  // 取得所有 BC 商品，過濾掉已加入的
  const { data: allProducts } = await supabase
    .from('bc_products')
    .select('sku_id, name, type, plan_type, high_flow_size, country_data')
    .order('name')

  const unassigned = (allProducts || []).filter((p) => !existingSkus.has(p.sku_id))

  return NextResponse.json(unassigned)
}
