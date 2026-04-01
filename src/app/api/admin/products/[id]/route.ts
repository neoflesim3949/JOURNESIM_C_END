import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  return token === process.env.ADMIN_PASSWORD
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = createAdminClient()

  const [productRes, dailyRes, fixedRes] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase.from('daily_plans').select('*').eq('product_id', id).order('daily_capacity_mb'),
    supabase.from('fixed_plans').select('*').eq('product_id', id).order('price'),
  ])

  if (!productRes.data) {
    return NextResponse.json({ error: '商品不存在' }, { status: 404 })
  }

  // 取得關聯的 BC 商品名稱
  const skuIds = [
    ...(dailyRes.data || []).map((p) => p.bc_sku_id),
    ...(fixedRes.data || []).map((p) => p.bc_sku_id),
  ]

  const bcNameMap = new Map<string, string>()
  if (skuIds.length > 0) {
    const { data: bcProducts } = await supabase
      .from('bc_products')
      .select('sku_id, name')
      .in('sku_id', skuIds)

    for (const p of bcProducts || []) {
      bcNameMap.set(p.sku_id, p.name)
    }
  }

  // 合併為統一的 bound_plans 列表
  const boundPlans = [
    ...(dailyRes.data || []).map((p) => ({
      ...p,
      plan_type: 'daily' as const,
      bc_name: bcNameMap.get(p.bc_sku_id) || '',
    })),
    ...(fixedRes.data || []).map((p) => ({
      ...p,
      plan_type: 'fixed' as const,
      bc_name: bcNameMap.get(p.bc_sku_id) || '',
    })),
  ]

  return NextResponse.json({
    product: productRes.data,
    bound_plans: boundPlans,
    daily_plans: dailyRes.data || [],
    fixed_plans: fixedRes.data || [],
  })
}
