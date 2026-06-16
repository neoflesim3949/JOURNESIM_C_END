import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { ESIM_TYPES, SIM_TYPES } from '@/lib/bc-enums'

export async function GET(request: Request) {
  
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '50')
  const search = searchParams.get('search') || ''
  const filterType = searchParams.get('filterType') || ''

  const supabase = createAdminClient()

  // 取得所有已加入套餐的 SKU
  const existingSkus = new Set<string>()
  let from = 0
  while (true) {
    const { data } = await supabase.from('package_plans').select('bc_sku_id').range(from, from + 999)
    if (!data || data.length === 0) break
    for (const p of data) existingSkus.add(p.bc_sku_id)
    if (data.length < 1000) break
    from += 1000
  }

  // 先查 bc_countries 看搜尋詞是否匹配任何國家
  let matchedMccs: string[] = []
  if (search) {
    const { data: matchedCountries } = await supabase.from('bc_countries')
      .select('mcc')
      .or(`mcc.ilike.${search},name.ilike.%${search}%,name_zh.ilike.%${search}%,name_en.ilike.%${search}%`)
    matchedMccs = (matchedCountries || []).map((c) => c.mcc.toUpperCase())
  }
  const isCountrySearch = matchedMccs.length > 0

  // 分批拉取 BC 商品
  type Row = { sku_id: string; name: string; type: string | null; plan_type: string | null; high_flow_size: string | null; rechargeable_product: string | null; country_data: { mcc: string }[] | null }
  const allUnassigned: Omit<Row, 'country_data'>[] = []
  from = 0

  while (true) {
    let query = supabase.from('bc_products')
      .select('sku_id, name, type, plan_type, high_flow_size, rechargeable_product, country_data')
      .or('is_active.is.null,is_active.eq.true') // 只取上架中
      .order('name')
      .range(from, from + 999)

    // 類型過濾
    if (filterType === 'sim') {
      query = query.in('type', SIM_TYPES)
    } else if (filterType === 'esim') {
      query = query.or(`type.in.(${ESIM_TYPES.join(',')}),rechargeable_product.eq.1`)
    }

    // 文字搜尋（非國家搜尋時用 DB 過濾）
    if (search && !isCountrySearch) {
      query = query.or(`name.ilike.%${search}%,sku_id.ilike.%${search}%`)
    }

    const { data } = await query
    if (!data || data.length === 0) break

    for (const p of data as Row[]) {
      if (existingSkus.has(p.sku_id)) continue

      // 國家搜尋：在應用層用 matchedMccs 過濾 country_data
      if (isCountrySearch) {
        const mccMatch = p.country_data?.some((c) => matchedMccs.includes(c.mcc.toUpperCase())) || false
        if (!mccMatch) continue
      }

      allUnassigned.push({
        sku_id: p.sku_id, name: p.name, type: p.type,
        plan_type: p.plan_type, high_flow_size: p.high_flow_size,
        rechargeable_product: p.rechargeable_product,
      })
    }

    if ((data as Row[]).length < 1000) break
    from += 1000
  }

  // 分頁
  const total = allUnassigned.length
  const start = (page - 1) * pageSize
  const paged = allUnassigned.slice(start, start + pageSize)

  return NextResponse.json({ data: paged, total })
}
