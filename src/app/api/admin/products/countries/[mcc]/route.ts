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

  // 取得此國家的商品（只取 local scope）
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('country_code', mcc)
    .or('scope.eq.local,scope.is.null')
    .order('sort_order')
    .order('created_at', { ascending: false })

  // 計算每個商品綁定的套餐數
  const productIds = (products || []).map((p) => p.id)

  const pkgCounts = new Map<string, number>()
  if (productIds.length > 0) {
    const { data: links } = await supabase
      .from('product_packages')
      .select('product_id')
      .in('product_id', productIds)

    for (const l of links || []) {
      pkgCounts.set(l.product_id, (pkgCounts.get(l.product_id) || 0) + 1)
    }
  }

  const productsWithCount = (products || []).map((p) => ({
    ...p,
    _plan_count: pkgCounts.get(p.id) || 0,
  }))

  return NextResponse.json({ country, products: productsWithCount })
}
