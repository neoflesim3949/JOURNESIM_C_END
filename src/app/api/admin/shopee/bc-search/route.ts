import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 搜尋 BC 商品（支援國家/天數/流量篩選，回傳 TWD 成本）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const countries = searchParams.get('countries') || '' // 逗號分隔的 MCC
  const days = searchParams.get('days') || ''
  const capacity = searchParams.get('capacity') || ''
  const search = searchParams.get('search') || ''

  const supabase = createAdminClient()

  // 匯率
  const { data: rateRow } = await supabase.from('exchange_rates').select('rate').eq('currency', 'CNY').single()
  const cnyRate = rateRow ? Number(rateRow.rate) : 0.2128

  // 查 BC 商品
  let query = supabase.from('bc_products')
    .select('sku_id, name, type, days, capacity, high_flow_size, limit_flow_speed, plan_type, prices, country_data, rechargeable_product')
    .limit(200)

  // 文字搜尋
  if (search) {
    query = query.or(`name.ilike.%${search}%,sku_id.ilike.%${search}%`)
  }

  // 天數篩選
  if (days) {
    query = query.eq('days', days)
  }

  const { data: products } = await query

  if (!products || products.length === 0) return NextResponse.json([])

  // 國家篩選（在應用層過濾 country_data）
  const countryMccs = countries ? countries.split(',').map(c => c.trim().toUpperCase()).filter(Boolean) : []

  // 如果搜尋詞像國家名，先查 bc_countries 找 MCC
  let searchMccs: string[] = []
  if (search && !countries) {
    const { data: matchedCountries } = await supabase.from('bc_countries')
      .select('mcc')
      .or(`mcc.ilike.${search},name.ilike.%${search}%,name_zh.ilike.%${search}%,name_en.ilike.%${search}%`)
    searchMccs = (matchedCountries || []).map(c => c.mcc.toUpperCase())
  }

  const allMccs = [...countryMccs, ...searchMccs]

  let filtered = products

  // 國家篩選
  if (allMccs.length > 0) {
    filtered = filtered.filter(p => {
      const cd = p.country_data as { mcc: string }[] | null
      return cd?.some(c => allMccs.includes(c.mcc.toUpperCase()))
    })
  }

  // 流量篩選（模糊匹配）
  if (capacity) {
    const cap = capacity.toLowerCase()
    filtered = filtered.filter(p => {
      const hfs = p.high_flow_size ? String(p.high_flow_size) : ''
      const c = p.capacity ? String(p.capacity) : ''
      return hfs.includes(cap) || c.includes(cap)
    })
  }

  // 組裝結果，計算 TWD 成本
  const result = filtered.slice(0, 100).map(p => {
    const prices = p.prices as { copies: string; settlementPrice: string }[] | null
    const costCny = prices?.find(pr => pr.copies === '1')?.settlementPrice
    const costTwd = costCny ? Math.ceil(Number(costCny) / cnyRate) : null

    // 所有 copies 選項
    const copiesOptions = (prices || []).map(pr => ({
      copies: pr.copies,
      costCny: Number(pr.settlementPrice) || 0,
      costTwd: Math.ceil((Number(pr.settlementPrice) || 0) / cnyRate),
    })).sort((a, b) => parseInt(a.copies) - parseInt(b.copies))

    return {
      sku_id: p.sku_id,
      name: p.name,
      type: p.type,
      days: p.days,
      capacity: p.capacity,
      high_flow_size: p.high_flow_size,
      plan_type: p.plan_type,
      cost_twd: costTwd,
      copies_options: copiesOptions,
      country_count: (p.country_data as { mcc: string }[] | null)?.length || 0,
    }
  })

  return NextResponse.json(result)
}
