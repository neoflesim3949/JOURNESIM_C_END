import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { ESIM_TYPES, SIM_TYPES, ESIM_SIM_ALL_TYPES } from '@/lib/bc-enums'

// SKU 目錄分析（bc_products 商品主檔，不打 BC）
//   類型分法「完全沿用套餐列表」＝各類獨立條件、可重疊：
//     - eSIM：rechargeable_product='1' 或 type ∈ ESIM_TYPES
//     - SIM ：type ∈ SIM_TYPES
//     - 加速包：type 空或不在 eSIM+SIM，且非複充
//   ※ 可複充的實體 SIM 會同時計入 SIM 與 eSIM（與套餐列表一致），故三類加總可能 > unique 總數
//   維度：類型 / 洲別（可展開國家）/ 國家 / productId（F002 產品層）
// GET ?scope=all|used
//   all  → 全部上架 SKU（is_active≠false）
//   used → 只算「有被使用到」的 SKU（出現在 card_plans 的 sku_id）

type Cat = 'esim' | 'sim' | 'accel'
// 一個 SKU 可同時屬多類（與套餐列表相同）
function catsOf(type: string | null, rech: string | null): Cat[] {
  const cats: Cat[] = []
  if (rech === '1' || (type && ESIM_TYPES.includes(type))) cats.push('esim')
  if (type && SIM_TYPES.includes(type)) cats.push('sim')
  if (rech !== '1' && (!type || !ESIM_SIM_ALL_TYPES.includes(type))) cats.push('accel')
  return cats
}

interface Cell { total: number; esim: number; sim: number; accel: number }
const newCell = (): Cell => ({ total: 0, esim: 0, sim: 0, accel: 0 })
const bump = (c: Cell, cats: Cat[]) => { c.total++; for (const cat of cats) c[cat]++ }   // total 算 unique 一次；各類獨立計

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  const scope = new URL(request.url).searchParams.get('scope') === 'used' ? 'used' : 'all'

  // scope=used：先撈 card_plans 有用到的 sku_id
  let usedSkus: Set<string> | null = null
  if (scope === 'used') {
    usedSkus = new Set<string>()
    for (let f = 0; ; f += 1000) {
      const { data } = await supabase.from('card_plans').select('sku_id').range(f, f + 999)
      if (!data || data.length === 0) break
      for (const r of data) if (r.sku_id) usedSkus.add(r.sku_id as string)
      if (data.length < 1000) break
    }
  }

  // ?mcc=XX → 該國涵蓋的 SKU 清單（依國家展開用；懶載）
  const mccParam = new URL(request.url).searchParams.get('mcc')
  if (mccParam) {
    const skus: { sku_id: string; name: string; product_name: string | null; cats: Cat[]; orders: number }[] = []
    for (let f = 0; ; f += 1000) {
      const { data } = await supabase.from('bc_products')
        .select('sku_id, name, type, rechargeable_product, product_name, country_data, is_active').range(f, f + 999)
      if (!data || data.length === 0) break
      for (const p of data) {
        if (p.is_active === false) continue
        if (usedSkus && !usedSkus.has(p.sku_id as string)) continue
        const cd = Array.isArray(p.country_data) ? p.country_data as { mcc?: string }[] : []
        if (!cd.some(c => String(c.mcc || '') === mccParam)) continue
        skus.push({
          sku_id: p.sku_id as string, name: (p.name as string) || (p.sku_id as string),
          product_name: (p.product_name as string) || null,
          cats: catsOf((p.type as string) || null, (p.rechargeable_product as string) || null),
          orders: 0,
        })
      }
      if (data.length < 1000) break
    }
    // 「有用在這個國家」的卡：card_usage_daily 在該國(country_region_code)有用量的 iccid
    const usedIccids = new Set<string>()
    for (let f = 0; ; f += 1000) {
      const { data } = await supabase.from('card_usage_daily').select('iccid').eq('country_region_code', mccParam).range(f, f + 999)
      if (!data || data.length === 0) break
      for (const r of data) if (r.iccid) usedIccids.add(r.iccid as string)
      if (data.length < 1000) break
    }
    // 每個 SKU：有用在這國的「卡數」＝ 該 SKU 的 card_plans 卡 ∩ usedIccids（去重）
    const cardSetBySku = new Map<string, Set<string>>()
    const ids = skus.map(s => s.sku_id)
    for (let i = 0; i < ids.length; i += 300) {
      const chunk = ids.slice(i, i + 300)
      for (let f = 0; ; f += 1000) {
        const { data } = await supabase.from('card_plans').select('iccid, sku_id').in('sku_id', chunk).range(f, f + 999)
        if (!data || data.length === 0) break
        for (const r of data) {
          const ic = r.iccid as string, sk = r.sku_id as string
          if (!ic || !sk || !usedIccids.has(ic)) continue
          let set = cardSetBySku.get(sk); if (!set) { set = new Set(); cardSetBySku.set(sk, set) }
          set.add(ic)
        }
        if (data.length < 1000) break
      }
    }
    for (const s of skus) s.orders = cardSetBySku.get(s.sku_id)?.size || 0
    skus.sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name))   // 依「有用在這國的卡數」多→少
    return NextResponse.json({ mcc: mccParam, skus })
  }

  // mcc → { 洲別, 國名 }
  const mccInfo = new Map<string, { continent: string; name: string }>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('bc_countries').select('mcc, name, name_zh, continent, continent_zh').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const c of data) {
      if (!c.mcc) continue
      mccInfo.set(String(c.mcc), { continent: (c.continent_zh || c.continent || '未歸類') as string, name: (c.name_zh || c.name || String(c.mcc)) as string })
    }
    if (data.length < 1000) break
  }

  const byCategory = newCell()
  const byContinent = new Map<string, Cell>()                                       // 每洲：SKU 去重計一次
  const byCountry = new Map<string, Cell & { name: string; continent: string }>()   // 每國：SKU 計一次
  const byProduct = new Map<string, Cell & { product_name: string; countries: Set<string> }>()
  const allCountries = new Set<string>()

  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('bc_products')
      .select('sku_id, name, type, rechargeable_product, product_id, product_name, country_data, is_active')
      .range(f, f + 999)
    if (!data || data.length === 0) break
    for (const p of data) {
      if (p.is_active === false) continue                       // 只算上架
      if (usedSkus && !usedSkus.has(p.sku_id as string)) continue   // scope=used：只算用到的
      const cat = catsOf((p.type as string) || null, (p.rechargeable_product as string) || null)
      bump(byCategory, cat)

      // productId 維度（沒有 product_id 的歸「未分類」）
      const pid = (p.product_id as string) || '（未分類）'
      let pg = byProduct.get(pid)
      if (!pg) { pg = { ...newCell(), product_name: (p.product_name as string) || (p.name as string) || pid, countries: new Set() }; byProduct.set(pid, pg) }
      bump(pg, cat)

      // 該 SKU 涵蓋的國家 / 洲別（各只計一次）
      const cd = Array.isArray(p.country_data) ? p.country_data as { mcc?: string }[] : []
      const mccs = [...new Set(cd.map(c => String(c.mcc || '')).filter(Boolean))]
      const continents = new Set<string>()
      for (const mcc of mccs) {
        allCountries.add(mcc)
        pg.countries.add(mcc)
        const info = mccInfo.get(mcc)
        const cont = info?.continent || '未歸類'
        let cc = byCountry.get(mcc)
        if (!cc) { cc = { ...newCell(), name: info?.name || mcc, continent: cont }; byCountry.set(mcc, cc) }
        bump(cc, cat)
        continents.add(cont)
      }
      for (const cont of continents) {
        let ce = byContinent.get(cont)
        if (!ce) { ce = newCell(); byContinent.set(cont, ce) }
        bump(ce, cat)
      }
    }
    if (data.length < 1000) break
  }

  const cellOut = (v: Cell) => ({ total: v.total, esim: v.esim, sim: v.sim, accel: v.accel })

  // 每洲底下的國家（供展開）
  const childrenByCont = new Map<string, ({ mcc: string; name: string } & Cell)[]>()
  for (const [mcc, v] of byCountry) {
    const arr = childrenByCont.get(v.continent) || []
    arr.push({ mcc, name: v.name, ...cellOut(v) })
    childrenByCont.set(v.continent, arr)
  }
  for (const arr of childrenByCont.values()) arr.sort((a, b) => b.total - a.total)

  const continents = [...byContinent].map(([name, v]) => ({
    name, ...cellOut(v), countries: childrenByCont.get(name) || [],
  })).sort((a, b) => b.total - a.total)

  const countries = [...byCountry].map(([mcc, v]) => ({ mcc, name: v.name, ...cellOut(v) })).sort((a, b) => b.total - a.total)

  const products = [...byProduct].map(([pid, v]) => ({
    product_id: pid, product_name: v.product_name, versions: v.total,
    esim: v.esim, sim: v.sim, accel: v.accel, countries: v.countries.size,
  })).sort((a, b) => b.versions - a.versions)

  return NextResponse.json({
    scope,
    summary: {
      total: byCategory.total, esim: byCategory.esim, sim: byCategory.sim, accel: byCategory.accel,
      products: byProduct.size, countries: allCountries.size, continents: byContinent.size,
    },
    continents, countries, products,
  })
}
