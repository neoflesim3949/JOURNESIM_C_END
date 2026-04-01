import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mcc: string }> }
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  if (token !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { mcc } = await params
  const supabase = createAdminClient()

  // 取得國家資訊
  const { data: country } = await supabase
    .from('bc_countries')
    .select('mcc, name, continent, flag_url')
    .eq('mcc', mcc)
    .single()

  // 取得此國家的商品
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('country_code', mcc)
    .order('sort_order')
    .order('created_at', { ascending: false })

  // 計算每個商品綁定的套餐數
  const productIds = (products || []).map((p) => p.id)

  let planCounts = new Map<string, number>()
  if (productIds.length > 0) {
    const [{ data: dailyPlans }, { data: fixedPlans }] = await Promise.all([
      supabase.from('daily_plans').select('product_id').in('product_id', productIds),
      supabase.from('fixed_plans').select('product_id').in('product_id', productIds),
    ])

    for (const p of [...(dailyPlans || []), ...(fixedPlans || [])]) {
      planCounts.set(p.product_id, (planCounts.get(p.product_id) || 0) + 1)
    }
  }

  const productsWithCount = (products || []).map((p) => ({
    ...p,
    _plan_count: planCounts.get(p.id) || 0,
  }))

  return NextResponse.json({ country, products: productsWithCount })
}
