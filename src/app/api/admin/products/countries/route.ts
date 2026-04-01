import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  if (token !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // 取得所有 BC 國家
  const { data: countries } = await supabase
    .from('bc_countries')
    .select('mcc, name, continent, flag_url')
    .order('name')

  // 取得每個國家的商品數量
  const { data: products } = await supabase
    .from('products')
    .select('country_code')

  const countMap = new Map<string, number>()
  for (const p of products || []) {
    countMap.set(p.country_code, (countMap.get(p.country_code) || 0) + 1)
  }

  const result = (countries || []).map((c) => ({
    ...c,
    product_count: countMap.get(c.mcc) || 0,
  }))

  return NextResponse.json(result)
}
