import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  
  
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'countries'
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '50')
  const search = searchParams.get('search') || ''

  const supabase = createAdminClient()

  if (tab === 'countries') {
    let query = supabase.from('bc_countries').select('*', { count: 'exact' })
    if (search) {
      query = query.or(`name.ilike.%${search}%,mcc.ilike.%${search}%`)
    }
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.order('name').range(from, to)
    const { data, count } = await query

    return NextResponse.json({ data: data || [], total: count || 0 })
  }

  // products / delisted（下架）
  const delisted = searchParams.get('delisted') === '1' || tab === 'delisted'
  let query = supabase.from('bc_products')
    .select('id, sku_id, name, type, sales_method, days, capacity, high_flow_size, limit_flow_speed, plan_type, prices, cost_price, updated_at, delisted_at, is_active', { count: 'exact' })
  // 下架＝is_active=false；上架（現有）＝is_active 為 true 或 null
  if (delisted) query = query.eq('is_active', false)
  else query = query.or('is_active.is.null,is_active.eq.true')
  if (search) {
    query = query.or(`name.ilike.%${search}%,sku_id.ilike.%${search}%`)
  }
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = delisted ? query.order('delisted_at', { ascending: false }) : query.order('name')
  query = query.range(from, to)
  const { data, count } = await query

  // 補「上次價格」：對本頁 sku 撈 bc_price_history（每 sku 取最近兩筆），算前一次價格供漲跌顯示
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data || []) as any[]
  const skuIds = [...new Set(rows.map((r) => r.sku_id).filter(Boolean))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const histBySku = new Map<string, any[]>()
  for (let i = 0; i < skuIds.length; i += 200) {
    const chunk = skuIds.slice(i, i + 200)
    const { data: h } = await supabase.from('bc_price_history')
      .select('sku_id, prices, cost_price, prev_cost_price, synced_at')
      .in('sku_id', chunk).order('synced_at', { ascending: false })
    for (const r of h || []) { const a = histBySku.get(r.sku_id) || []; a.push(r); histBySku.set(r.sku_id, a) }
  }
  const out = rows.map((r) => {
    const hist = histBySku.get(r.sku_id) || []          // 已依 synced_at desc
    return {
      ...r,
      prev_cost_price: hist[0]?.prev_cost_price ?? null, // 最新變動前的結算價
      prev_prices: hist[1]?.prices ?? null,              // 前一次完整價格階
    }
  })

  return NextResponse.json({ data: out, total: count || 0 })
}
