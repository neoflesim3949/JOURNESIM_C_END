import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCapacity, formatSpeed } from '@/lib/format'

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'search'
  const supabase = createAdminClient()

  // ─── names：根據 sku_ids 查名稱 ──────────────────────────
  if (action === 'names') {
    const skuIds = (searchParams.get('sku_ids') || '').split(',').filter(Boolean)
    if (skuIds.length === 0) return NextResponse.json([])
    const { data } = await supabase.from('bc_products').select('sku_id, name').in('sku_id', skuIds)
    return NextResponse.json(data || [])
  }

  // ─── options：下拉選項 ──────────────────────────────────
  if (action === 'options') {
    const { data: countries } = await supabase.from('bc_countries')
      .select('mcc, name, name_zh').or('scope.eq.local,scope.is.null').order('name')

    // 從 bc_products 取天數和流量選項
    const { data: products } = await supabase.from('bc_products')
      .select('days, high_flow_size, capacity, plan_type, prices, limit_flow_speed')

    const daysSet = new Set<number>()
    const capMap = new Map<string, boolean>()
    const speedSet = new Set<string>()
    for (const p of products || []) {
      const unitDays = Number(p.days) || 1
      const prices = p.prices as { copies: string }[] | null
      if (prices) {
        for (const pr of prices) daysSet.add(unitDays * parseInt(pr.copies))
      } else {
        daysSet.add(unitDays)
      }
      const raw = p.high_flow_size || p.capacity
      if (raw) capMap.set(formatCapacity(raw, p.plan_type === '1'), true)
      const spd = formatSpeed(p.limit_flow_speed)
      if (spd && spd !== '-') speedSet.add(spd)
    }

    return NextResponse.json({
      countries: (countries || []).map(c => ({ mcc: c.mcc, name: c.name_zh || c.name })),
      days: Array.from(daysSet).sort((a, b) => a - b).map(String),
      capacities: Array.from(capMap.keys()).sort(),
      speeds: Array.from(speedSet).sort(),
    })
  }

  // ─── search：搜尋商品（每個 SKU 一行，不展開 copies）────────
  const countries = searchParams.get('countries') || ''
  const selectedDays = searchParams.get('days') || ''
  const capacity = searchParams.get('capacity') || ''
  const speed = searchParams.get('speed') || ''
  const search = searchParams.get('search') || ''

  // 至少要有一個篩選條件
  if (!countries && !selectedDays && !capacity && !speed && !search) {
    return NextResponse.json([])
  }

  const { data: rateRow } = await supabase.from('exchange_rates').select('rate').eq('currency', 'CNY').single()
  const cnyRate = rateRow ? Number(rateRow.rate) : 0.2128

  // 如果 search 像國家名，先找 MCC
  let searchMccs: string[] = []
  if (search && /^[A-Za-z]{2,3}$/.test(search)) {
    searchMccs = [search.toUpperCase()]
  } else if (search) {
    const { data: matched } = await supabase.from('bc_countries')
      .select('mcc').or(`name.ilike.%${search}%,name_zh.ilike.%${search}%,name_en.ilike.%${search}%`)
    searchMccs = (matched || []).map(c => c.mcc.toUpperCase())
  }

  // 查 bc_products
  let allProducts: any[] = []
  let from = 0
  while (true) {
    let query = supabase.from('bc_products')
      .select('sku_id, name, type, days, capacity, high_flow_size, limit_flow_speed, plan_type, prices, country_data')
      .range(from, from + 999)
    // 名稱或 SKU 搜尋（如果不是國家名搜尋）
    if (search && searchMccs.length === 0) {
      query = query.or(`name.ilike.%${search}%,sku_id.ilike.%${search}%`)
    }
    const { data } = await query
    if (!data || data.length === 0) break
    allProducts.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  // 國家篩選
  const allMccs = [
    ...(countries ? countries.split(',').map(c => c.trim().toUpperCase()).filter(Boolean) : []),
    ...searchMccs,
  ]
  let filtered = allProducts
  if (allMccs.length > 0) {
    filtered = filtered.filter(p => {
      const cd = p.country_data as { mcc: string }[] | null
      return cd?.some(c => allMccs.includes(c.mcc.toUpperCase()))
    })
  }

  // 流量篩選
  if (capacity) {
    filtered = filtered.filter(p => formatCapacity(p.high_flow_size || p.capacity, p.plan_type === '1') === capacity)
  }

  // 限速篩選
  if (speed) {
    filtered = filtered.filter(p => formatSpeed(p.limit_flow_speed) === speed)
  }

  // 天數篩選（天數 = unitDays × copies，任一 copies 匹配就保留）
  if (selectedDays) {
    const target = parseInt(selectedDays)
    filtered = filtered.filter(p => {
      const unitDays = Number(p.days) || 1
      const prices = p.prices as { copies: string }[] | null
      if (prices) return prices.some(pr => unitDays * parseInt(pr.copies) === target)
      return unitDays === target
    })
  }

  // 國家繁體名
  const mccSet = new Set<string>()
  for (const p of filtered) (p.country_data as { mcc: string }[] | null)?.forEach(c => mccSet.add(c.mcc))
  const { data: cNames } = mccSet.size > 0
    ? await supabase.from('bc_countries').select('mcc, name_zh, name').in('mcc', Array.from(mccSet))
    : { data: [] }
  const cMap = new Map((cNames || []).map(c => [c.mcc, c.name_zh || c.name]))

  // 組裝結果（每個 SKU 一行）
  const result = filtered.slice(0, 100).map(p => {
    const prices = p.prices as { copies: string; settlementPrice: string }[] | null
    const firstPrice = prices?.[0]
    const costCny = firstPrice ? Number(firstPrice.settlementPrice) || 0 : 0
    const costTwd = Math.ceil(costCny / cnyRate)
    const unitDays = Number(p.days) || 1

    // copies 選項
    const copiesOptions = (prices || []).map(pr => ({
      copies: pr.copies,
      days: unitDays * parseInt(pr.copies),
      costCny: Number(pr.settlementPrice) || 0,
      costTwd: Math.ceil((Number(pr.settlementPrice) || 0) / cnyRate),
    })).sort((a, b) => a.days - b.days)

    const cd = p.country_data as { mcc: string; name?: string; apn?: string; apnUsername?: string; apnPassword?: string; operatorInfo?: string }[] | null
    // 詳細運營商表（用以展開檢視）
    const countryDetails = (cd || []).map(c => ({
      mcc: c.mcc,
      name_zh: cMap.get(c.mcc) || c.name || c.mcc,
      apn: c.apn || null,
      apn_username: c.apnUsername || null,
      apn_password: c.apnPassword || null,
      operator: c.operatorInfo || null,
    }))
    return {
      sku_id: p.sku_id,
      name: p.name,
      capacity: formatCapacity(p.high_flow_size || p.capacity, p.plan_type === '1'),
      speed: formatSpeed(p.limit_flow_speed),
      plan_type: p.plan_type,
      unit_days: unitDays,
      cost_cny: costCny,
      cost_twd: costTwd,
      copies_options: copiesOptions,
      countries: (cd || []).slice(0, 5).map(c => cMap.get(c.mcc) || c.mcc),
      country_total: cd?.length || 0,
      country_details: countryDetails,
    }
  })

  return NextResponse.json(result)
}
