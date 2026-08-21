import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLegacyIccids } from '@/lib/legacy-cards'

// 通用用量熱力圖：row 維度 × 月份，可展開成 child 維度
//   維度：country（用量國家）/ apn（該卡方案在該國的 apn）/ sku（該卡主方案）
//   每筆每日用量精準歸一個 (row, child)；用量國碼 country_region_code = country_data 的 mcc
// GET ?row=country|apn &child=sku|apn|country &from=&to=&search=&limit=&exclude_legacy=1
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const row = sp.get('row') === 'apn' ? 'apn' : 'country'
  const child = (['sku', 'apn', 'country'].includes(sp.get('child') || '') ? sp.get('child') : 'sku') as 'sku' | 'apn' | 'country'
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const search = (sp.get('search') || '').trim().toLowerCase()
  const limit = Math.min(Number(sp.get('limit')) || 50, 300)
  const supabase = createAdminClient()
  const legacy = sp.get('exclude_legacy') === '1' ? await getLegacyIccids(supabase) : new Set<string>()

  // iccid → 主要 sku
  const combo = new Map<string, Map<string, number>>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('card_plans').select('iccid, sku_id').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const p of data) { if (!p.sku_id || !p.iccid || legacy.has(p.iccid)) continue; if (!combo.has(p.iccid)) combo.set(p.iccid, new Map()); const m = combo.get(p.iccid)!; m.set(p.sku_id, (m.get(p.sku_id) || 0) + 1) }
    if (data.length < 1000) break
  }
  const iccidToSku = new Map<string, string>()
  for (const [ic, m] of combo) { let b = '', n = -1; for (const [k, v] of m) if (v > n) { b = k; n = v } if (b) iccidToSku.set(ic, b) }

  // sku → 名稱、(mcc → apn)
  const skuName = new Map<string, string>()
  const skuMccApn = new Map<string, Map<string, string>>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('bc_products').select('sku_id, name, country_data').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      skuName.set(r.sku_id as string, (r.name as string) || (r.sku_id as string))
      const cd = r.country_data as { apn?: string; mcc?: string }[] | null
      if (!Array.isArray(cd)) continue
      const mm = new Map<string, string>()
      for (const c of cd) { const apn = (c.apn || '').trim(); if (apn && c.mcc) mm.set(String(c.mcc).toUpperCase(), apn) }
      if (mm.size) skuMccApn.set(r.sku_id as string, mm)
    }
    if (data.length < 1000) break
  }

  interface Node { name: string; total: number; byMonth: Map<string, number>; cards: Set<string> }
  const mk = (name: string): Node => ({ name, total: 0, byMonth: new Map(), cards: new Set() })
  const rows = new Map<string, Node & { children: Map<string, Node> }>()
  const monthSet = new Set<string>()
  const monthTotals = new Map<string, number>()
  const allCards = new Set<string>()

  for (let f = 0; ; f += 1000) {
    let q = supabase.from('card_usage_daily').select('iccid, used_date, country, country_region_code, used_amount')
    if (from) q = q.gte('used_date', from)
    if (to) q = q.lte('used_date', to)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const ic = r.iccid as string; const amt = Number(r.used_amount) || 0
      if (!ic || amt <= 0 || legacy.has(ic)) continue
      const sku = iccidToSku.get(ic)
      const cc = String(r.country_region_code || '—').toUpperCase()
      const cname = (r.country as string) || cc
      const apn = (sku && skuMccApn.get(sku)?.get(cc)) || '（無 APN 對應）'
      const skuLabel = sku ? (skuName.get(sku) || sku) : '（無方案）'
      const rk = row === 'apn' ? apn : cc
      const rn = row === 'apn' ? apn : cname
      const ck = child === 'sku' ? (sku || '—') : child === 'apn' ? apn : cc
      const cn = child === 'sku' ? skuLabel : child === 'apn' ? apn : cname
      const month = (r.used_date as string).slice(0, 7)
      monthSet.add(month); allCards.add(ic); monthTotals.set(month, (monthTotals.get(month) || 0) + amt)

      let R = rows.get(rk); if (!R) { R = { ...mk(rn), children: new Map() }; rows.set(rk, R) }
      R.total += amt; R.byMonth.set(month, (R.byMonth.get(month) || 0) + amt); R.cards.add(ic)
      let C = R.children.get(ck); if (!C) { C = mk(cn); R.children.set(ck, C) }
      C.total += amt; C.byMonth.set(month, (C.byMonth.get(month) || 0) + amt); C.cards.add(ic)
    }
    if (data.length < 1000) break
  }

  const months = [...monthSet].sort()
  const bm = (mMap: Map<string, number>) => Object.fromEntries(months.map(m => [m, mMap.get(m) || 0]))
  let out = [...rows].map(([code, R]) => ({
    code, name: R.name, total: R.total, cards: R.cards.size, by_month: bm(R.byMonth),
    children: [...R.children].map(([ck, C]) => ({ code: ck, name: C.name, total: C.total, cards: C.cards.size, by_month: bm(C.byMonth) })).sort((a, b) => b.total - a.total),
  })).sort((a, b) => b.total - a.total)
  const totalRows = out.length
  if (search) out = out.filter(r => r.name.toLowerCase().includes(search) || r.code.toLowerCase().includes(search))
  out = out.slice(0, limit)

  return NextResponse.json({
    months, month_totals: bm(monthTotals), rows: out,
    total_countries: totalRows, total_cards: allCards.size,
    total_usage: [...monthTotals.values()].reduce((s, n) => s + n, 0),
    row, child,
  })
}
