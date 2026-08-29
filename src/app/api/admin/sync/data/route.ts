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
  const changedOnly = searchParams.get('changed_only') === '1'   // 只顯示有變價的商品
  const syncId = searchParams.get('sync_id') || ''               // 指定某次同步（連動比對時間）
  const META = 'sku_id, name, type, plan_type, sales_method, capacity, high_flow_size, limit_flow_speed, is_active'
  const COLS = `id, ${META}, days, prices, cost_price, updated_at, delisted_at`
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const activeOk = (r: { is_active: boolean | null }) => delisted ? r.is_active === false : (r.is_active === null || r.is_active === true)
  const kw = search.trim().toLowerCase()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = []
  let total = 0
  let augment = true   // 是否要補「上次價格」（快照模式已自帶，不補）

  if (changedOnly && syncId) {
    // 連動：該次同步的「變價」商品（快照 prev_cost_price ≠ cost_price）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snap: any[] = []
    for (let f = 0; ; f += 1000) {
      const { data: h } = await supabase.from('bc_price_history')
        .select('id, sku_id, name, prices, cost_price, prev_cost_price, prev_prices, synced_at')
        .eq('sync_id', syncId).range(f, f + 999)
      if (!h || h.length === 0) break
      snap.push(...h)
      if (h.length < 1000) break
    }
    const changedRows = snap.filter((r) => r.prev_cost_price != null && Number(r.prev_cost_price) !== Number(r.cost_price))
    // 補 metadata（type/plan_type…）
    const skus = [...new Set(changedRows.map((r) => r.sku_id))]
    const meta = new Map<string, Record<string, unknown>>()
    for (let i = 0; i < skus.length; i += 200) {
      const { data: m } = await supabase.from('bc_products').select(META).in('sku_id', skus.slice(i, i + 200))
      for (const r of m || []) meta.set(r.sku_id, r)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let all: any[] = changedRows.map((r) => {
      const mm = (meta.get(r.sku_id) || {}) as Record<string, unknown>
      return {
        id: r.id, sku_id: r.sku_id, name: r.name ?? mm.name ?? r.sku_id,
        type: mm.type ?? null, plan_type: mm.plan_type ?? null, sales_method: mm.sales_method ?? null,
        capacity: mm.capacity ?? null, high_flow_size: mm.high_flow_size ?? null, limit_flow_speed: mm.limit_flow_speed ?? null,
        is_active: mm.is_active ?? null,
        prices: r.prices, cost_price: r.cost_price, prev_cost_price: r.prev_cost_price, prev_prices: r.prev_prices,
        updated_at: r.synced_at,
      }
    })
    all = all.filter(activeOk)
    if (kw) all = all.filter((r) => String(r.name || '').toLowerCase().includes(kw) || String(r.sku_id).includes(kw))
    all.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    total = all.length
    rows = all.slice(from, from + pageSize)
    augment = false
  } else if (changedOnly) {
    // 無指定同步：歷來真正有變過價的商品（某筆歷史 prev_cost_price ≠ cost_price）
    const changed = new Set<string>()
    for (let f = 0; ; f += 1000) {
      const { data: h } = await supabase.from('bc_price_history').select('sku_id, prev_cost_price, cost_price').not('prev_cost_price', 'is', null).range(f, f + 999)
      if (!h || h.length === 0) break
      for (const r of h) if (Number(r.prev_cost_price) !== Number(r.cost_price)) changed.add(r.sku_id)
      if (h.length < 1000) break
    }
    const ids = [...changed]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let all: any[] = []
    for (let i = 0; i < ids.length; i += 200) {
      const { data: pr } = await supabase.from('bc_products').select(COLS).in('sku_id', ids.slice(i, i + 200))
      all.push(...(pr || []))
    }
    all = all.filter(activeOk)
    if (kw) all = all.filter((r) => String(r.name || '').toLowerCase().includes(kw) || String(r.sku_id).includes(kw))
    all.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    total = all.length
    rows = all.slice(from, from + pageSize)
  } else {
    let query = supabase.from('bc_products').select(COLS, { count: 'exact' })
    if (delisted) query = query.eq('is_active', false)
    else query = query.or('is_active.is.null,is_active.eq.true')
    if (search) query = query.or(`name.ilike.%${search}%,sku_id.ilike.%${search}%`)
    query = delisted ? query.order('delisted_at', { ascending: false }) : query.order('name')
    query = query.range(from, to)
    const { data, count } = await query
    rows = data || []
    total = count || 0
  }

  // 補「上次價格」：對本頁 sku 撈最近兩筆歷史（快照模式已自帶，不補）
  if (augment) {
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
    rows = rows.map((r) => {
      const hist = histBySku.get(r.sku_id) || []
      return { ...r, prev_cost_price: hist[0]?.prev_cost_price ?? null, prev_prices: hist[1]?.prices ?? null }
    })
  }

  return NextResponse.json({ data: rows, total })
}
