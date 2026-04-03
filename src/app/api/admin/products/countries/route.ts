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
    .select('mcc, name, name_zh, continent, continent_zh, flag_url')
    .order('name')

  // 取得每個國家實際綁定的套餐數量（product_packages count）
  const { data: products } = await supabase
    .from('products')
    .select('id, country_code')

  const productIdToCountry = new Map<string, string>()
  for (const p of products || []) {
    productIdToCountry.set(p.id, p.country_code)
  }

  const { data: links } = await supabase
    .from('product_packages')
    .select('product_id')

  const countMap = new Map<string, number>()
  for (const l of links || []) {
    const cc = productIdToCountry.get(l.product_id)
    if (cc) countMap.set(cc, (countMap.get(cc) || 0) + 1)
  }

  const result = (countries || []).map((c) => ({
    mcc: c.mcc,
    name: c.name_zh || c.name,
    continent: c.continent_zh || c.continent,
    flag_url: c.flag_url,
    product_count: countMap.get(c.mcc) || 0,
  }))

  return NextResponse.json(result)
}
