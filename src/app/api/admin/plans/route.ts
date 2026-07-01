import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { ESIM_TYPES, SIM_TYPES, ESIM_SIM_ALL_TYPES } from '@/lib/bc-enums'
import { formatCapacity } from '@/lib/format'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyTypeFilter(query: any, type: string) {
  // 只顯示上架中（排除已下架 is_active=false；true/null 視為上架）
  query = query.or('is_active.is.null,is_active.eq.true')
  // rechargeable_product='1' → eSIM 複充商品（不管 type）；同商品可能同時在 SIM 與 eSIM
  if (type === 'sim') return query.in('type', SIM_TYPES)
  if (type === 'acceleration') {
    // 加速包：(type 不在 eSIM+SIM 或 IS NULL) 且 非複充商品
    return query.or(`type.is.null,type.not.in.(${ESIM_SIM_ALL_TYPES.join(',')})`)
      .or('rechargeable_product.is.null,rechargeable_product.neq.1')
  }
  // eSIM：type 在 eSIM 列表 或 rechargeable_product='1'
  return query.or(`type.in.(${ESIM_TYPES.join(',')}),rechargeable_product.eq.1`)
}

// 掃出 country_data 含「任一」指定 MCC 的 sku_id 清單（JSONB 陣列，需 JS 過濾）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function skusWithCountries(supabase: any, mccs: string[]): Promise<string[]> {
  const targets = new Set(mccs.map(m => m.toUpperCase()))
  const skus: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('bc_products').select('sku_id, country_data').range(from, from + 999)
    if (!data || data.length === 0) break
    for (const p of data) {
      const cs = p.country_data as { mcc: string }[] | null
      if (cs?.some((c) => targets.has((c.mcc || '').toUpperCase()))) skus.push(p.sku_id)
    }
    if (data.length < 1000) break
  }
  return skus
}

export async function GET(request: Request) {


  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'esim'
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '50')
  const search = searchParams.get('search') || ''
  const planType = searchParams.get('planType') || ''
  const productType = searchParams.get('productType') || ''
  const salesMethod = searchParams.get('salesMethod') || ''
  const rechargeable = searchParams.get('rechargeable') || ''
  // 國家篩選：countries=逗號分隔 MCC（多選，OR）；相容舊的單一 country
  const countriesParam = (searchParams.get('countries') || searchParams.get('country') || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const daysParam = searchParams.get('days') || ''           // 天數（實際可選天數 = 單位天數×copies）
  const sortPrice = searchParams.get('sortPrice') || ''      // asc / desc（依選取天數的結算價排序，僅有選天數時有效）
  const capacityParam = searchParams.get('capacity') || ''   // 流量（high_flow_size 或 capacity 的原始 KB 值）
  const countriesOnly = searchParams.get('countriesOnly') === '1'

  const supabase = createAdminClient()

  // 回傳此類型的篩選選項（國家 / 天數 / 流量）給下拉用
  if (countriesOnly) {
    const map = new Map<string, string>()
    const daysSet = new Set<number>()
    const capMap = new Map<string, string>() // 原始KB → 顯示label
    for (let from = 0; ; from += 1000) {
      const { data } = await applyTypeFilter(
        supabase.from('bc_products').select('country_data, days, prices, high_flow_size, capacity, plan_type'), type
      ).range(from, from + 999)
      if (!data || data.length === 0) break
      for (const p of data) {
        for (const c of (p.country_data || []) as { mcc: string; name: string }[]) {
          if (c?.mcc && !map.has(c.mcc)) map.set(c.mcc, c.name)
        }
        // 可選天數 = 單位天數 × copies（每個規格各一個天數）
        const unit = Number(p.days) || 1
        const prices = (p.prices || []) as { copies: string }[]
        if (prices.length) { for (const pr of prices) { const d = unit * (parseInt(pr.copies) || 1); if (d > 0) daysSet.add(d) } }
        else if (p.days != null && !isNaN(Number(p.days))) daysSet.add(Number(p.days))
        // 流量選項拆「每日(單日型 plan_type=1)」與「總量」；value 編碼 kind:KB
        const cap = p.high_flow_size ?? p.capacity
        if (cap != null && String(cap) !== '') {
          const isDaily = p.plan_type === '1'
          const key = `${isDaily ? 'd' : 't'}:${cap}`
          if (!capMap.has(key)) capMap.set(key, `${isDaily ? '每日' : '總量'}${formatCapacity(String(cap), false)}`)
        }
      }
      if (data.length < 1000) break
    }
    const countries = [...map].map(([mcc, name]) => ({ mcc, name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'))
    const days = [...daysSet].sort((a, b) => a - b)
    // 每日群組在前、總量在後，各自依容量大小排序
    const capacities = [...capMap].map(([value, label]) => ({ value, label }))
      .sort((a, b) => {
        const [ka, va] = a.value.split(':'); const [kb2, vb] = b.value.split(':')
        if (ka !== kb2) return ka === 'd' ? -1 : 1
        return Number(va) - Number(vb)
      })
    return NextResponse.json({ countries, days, capacities })
  }

  let query = applyTypeFilter(supabase.from('bc_products').select('*', { count: 'exact' }), type)

  // 篩選：國家（country_data 含任一選取的 MCC）
  if (countriesParam.length > 0) {
    const skus = await skusWithCountries(supabase, countriesParam)
    query = query.in('sku_id', skus.length ? skus : ['__none__'])
  }

  // 天數（實際可選天數=單位天數×copies）改在下方 JS 分支處理（避免巨量 IN 清單導致 URL 過長）

  // 篩選：流量（value 為 kind:KB；kind=d 每日 / t 總量；相容無前綴的純 KB）
  if (capacityParam) {
    const idx = capacityParam.indexOf(':')
    const kind = idx >= 0 ? capacityParam.slice(0, idx) : ''
    const kb = idx >= 0 ? capacityParam.slice(idx + 1) : capacityParam
    query = query.or(`high_flow_size.eq.${kb},and(high_flow_size.is.null,capacity.eq.${kb})`)
    if (kind === 'd') query = query.eq('plan_type', '1')
    else if (kind === 't') query = query.or('plan_type.is.null,plan_type.neq.1')
  }

  // 篩選：套餐類型
  if (planType) {
    query = query.eq('plan_type', planType)
  }

  // 篩選：商品子類型
  if (productType) {
    query = query.eq('type', productType)
  }

  // 篩選：銷售方式
  if (salesMethod) {
    query = query.eq('sales_method', salesMethod)
  }

  // 篩選：複充
  if (rechargeable === '1') {
    query = query.eq('rechargeable_product', '1')
  } else if (rechargeable === '0') {
    query = query.or('rechargeable_product.is.null,rechargeable_product.neq.1')
  }

  // 搜尋
  if (search) {
    // 先查 bc_countries 看搜尋詞是否匹配任何國家（MCC碼、簡繁英名稱）
    const { data: matchedCountries } = await supabase.from('bc_countries')
      .select('mcc')
      .or(`mcc.ilike.${search},name.ilike.%${search}%,name_zh.ilike.%${search}%,name_en.ilike.%${search}%`)

    const matchedMccs = (matchedCountries || []).map((c) => c.mcc.toUpperCase())

    if (matchedMccs.length > 0) {
      // 用 MCC 在 country_data 中搜尋
      const matchingSkus: string[] = []
      let mccFrom = 0
      while (true) {
        const { data: batch } = await supabase.from('bc_products')
          .select('sku_id, country_data')
          .range(mccFrom, mccFrom + 999)
        if (!batch || batch.length === 0) break
        for (const p of batch) {
          const countries = p.country_data as { mcc: string }[] | null
          if (countries?.some((c) => matchedMccs.includes(c.mcc.toUpperCase()))) {
            matchingSkus.push(p.sku_id)
          }
        }
        if (batch.length < 1000) break
        mccFrom += 1000
      }
      if (matchingSkus.length > 0) {
        query = query.in('sku_id', matchingSkus)
      } else {
        // 國家匹配了但沒有商品，也搜名稱
        query = query.or(`name.ilike.%${search}%,sku_id.ilike.%${search}%`)
      }
    } else {
      // 非國家搜尋，用名稱和 SKU
      query = query.or(`name.ilike.%${search}%,sku_id.ilike.%${search}%`)
    }
  }

  // 有選天數：撈出（其餘篩選後的）全部 → JS 過濾「有該天數」+ 算該天數結算價 + 依價格排序 + 分頁
  if (daysParam) {
    const target = Number(daysParam)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = []
    for (let f = 0; ; f += 1000) {
      const { data: chunk, error } = await query.range(f, f + 999)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!chunk || chunk.length === 0) break
      all.push(...chunk)
      if (chunk.length < 1000) break
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withPrice = all.map((p): any => {
      const unit = Number(p.days) || 1
      const pr = ((p.prices || []) as { copies: string; settlementPrice: string }[])
        .find((x) => unit * (parseInt(x.copies) || 1) === target)
      return pr ? { ...p, _day_price: Number(pr.settlementPrice), _day_copies: pr.copies } : null
    }).filter(Boolean)
    if (sortPrice === 'asc' || sortPrice === 'desc') {
      withPrice.sort((a, b) => sortPrice === 'asc' ? a._day_price - b._day_price : b._day_price - a._day_price)
    } else {
      withPrice.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'))
    }
    const start = (page - 1) * pageSize
    return NextResponse.json({ data: withPrice.slice(start, start + pageSize), total: withPrice.length, page, pageSize })
  }

  // 分頁
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.order('name').range(from, to)

  const { data, count, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    pageSize,
  })
}
