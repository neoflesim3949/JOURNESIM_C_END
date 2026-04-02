import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') || 'regional'

  const supabase = createAdminClient()
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('scope', scope)
    .order('created_at', { ascending: false })

  // 計算每個方案的套餐數
  const productIds = (products || []).map((p) => p.id)
  let pkgCounts = new Map<string, number>()

  if (productIds.length > 0) {
    const { data: links } = await supabase
      .from('product_packages')
      .select('product_id')
      .in('product_id', productIds)

    for (const l of links || []) {
      pkgCounts.set(l.product_id, (pkgCounts.get(l.product_id) || 0) + 1)
    }
  }

  const result = (products || []).map((p) => ({
    ...p,
    _package_count: pkgCounts.get(p.id) || 0,
  }))

  return NextResponse.json(result)
}
