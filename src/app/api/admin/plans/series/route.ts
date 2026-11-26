import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 复充商品系列列表：把 bc_products 依 rechargeable_product_series_id 分組
// GET ?search=   以系列名稱/系列ID/商品名稱/SKU 過濾
//     ?includeInactive=1  一併列入已下架（預設只列上架中）

interface SeriesProduct {
  sku_id: string
  name: string
  plan_type: string | null
  days: number | null
  capacity: string | null
  high_flow_size: string | null
  limit_flow_speed: string | null
  sales_method: string | null
  is_active: boolean | null
  rechargeable_product: string | null
}

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = (searchParams.get('search') || '').trim().toLowerCase()
  const includeInactive = searchParams.get('includeInactive') === '1'

  const supabase = createAdminClient()

  // 掃出所有「有系列 id」的商品（分頁，避免 1000 上限漏列）
  const rows: (SeriesProduct & { rechargeable_product_series_id: string; rechargeable_product_series_name: string | null })[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from('bc_products')
      .select('sku_id, name, plan_type, days, capacity, high_flow_size, limit_flow_speed, sales_method, is_active, rechargeable_product, rechargeable_product_series_id, rechargeable_product_series_name')
      .not('rechargeable_product_series_id', 'is', null)
      .order('sku_id')
      .range(from, from + 999)
    if (!includeInactive) q = q.or('is_active.is.null,is_active.eq.true')
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    rows.push(...(data as typeof rows))
    if (data.length < 1000) break
  }

  // 分組
  const map = new Map<string, { seriesId: string; seriesName: string; products: SeriesProduct[] }>()
  for (const r of rows) {
    const id = r.rechargeable_product_series_id
    if (!map.has(id)) map.set(id, { seriesId: id, seriesName: r.rechargeable_product_series_name || '', products: [] })
    const g = map.get(id)!
    if (!g.seriesName && r.rechargeable_product_series_name) g.seriesName = r.rechargeable_product_series_name
    g.products.push({
      sku_id: r.sku_id, name: r.name, plan_type: r.plan_type, days: r.days,
      capacity: r.capacity, high_flow_size: r.high_flow_size, limit_flow_speed: r.limit_flow_speed,
      sales_method: r.sales_method, is_active: r.is_active, rechargeable_product: r.rechargeable_product,
    })
  }

  let series = [...map.values()].map(g => ({
    ...g,
    products: g.products.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant')),
    count: g.products.length,
  }))

  // 搜尋：系列名/系列ID，或系列內任一商品名/SKU 命中
  if (search) {
    series = series.filter(s =>
      s.seriesId.toLowerCase().includes(search) ||
      s.seriesName.toLowerCase().includes(search) ||
      s.products.some(p => String(p.name || '').toLowerCase().includes(search) || String(p.sku_id).toLowerCase().includes(search))
    )
  }

  series.sort((a, b) => String(a.seriesName || a.seriesId).localeCompare(String(b.seriesName || b.seriesId), 'zh-Hant'))

  const totalProducts = series.reduce((n, s) => n + s.count, 0)
  return NextResponse.json({ series, totalSeries: series.length, totalProducts })
}
