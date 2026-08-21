import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLegacyIccids } from '@/lib/legacy-cards'

// 出行地 × 出行日期：每張卡在某國的「首次用量日期」= 出行日期（抵達），依月份彙總
//   形成 國家 × 月份 的矩陣（格子 = 該月出行到該國的卡數）
// GET ?from=&to=（用量日期區間）&search=（國家）&limit=
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const search = (sp.get('search') || '').trim().toLowerCase()
  const limit = Math.min(Number(sp.get('limit')) || 50, 300)
  const supabase = createAdminClient()
  const legacy = sp.get('exclude_legacy') === '1' ? await getLegacyIccids(supabase) : new Set<string>()

  // 每張卡在每個國家的最早用量日期（抵達）
  const arrival = new Map<string, { name: string; date: string }>()  // key: iccid|code
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('card_usage_daily').select('iccid, used_date, country, country_region_code, used_amount')
    if (from) q = q.gte('used_date', from)
    if (to) q = q.lte('used_date', to)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      if (!r.iccid || !r.used_date || (Number(r.used_amount) || 0) <= 0 || legacy.has(r.iccid)) continue
      const code = r.country_region_code || r.country || '—'
      const key = `${r.iccid}|${code}`
      const d = (r.used_date as string).slice(0, 10)
      const prev = arrival.get(key)
      if (!prev || d < prev.date) arrival.set(key, { name: r.country || code, date: d })
    }
    if (data.length < 1000) break
  }

  // 依國家 × 月份彙總（抵達卡數）
  const byCountry = new Map<string, { name: string; total: Set<string>; byMonth: Map<string, Set<string>> }>()
  const monthSet = new Set<string>()
  const monthTotals = new Map<string, Set<string>>()
  for (const [key, v] of arrival) {
    const iccid = key.slice(0, key.lastIndexOf('|'))
    const code = key.slice(key.lastIndexOf('|') + 1)
    const month = v.date.slice(0, 7)
    monthSet.add(month)
    let c = byCountry.get(code)
    if (!c) { c = { name: v.name, total: new Set(), byMonth: new Map() }; byCountry.set(code, c) }
    c.total.add(iccid)
    let m = c.byMonth.get(month); if (!m) { m = new Set(); c.byMonth.set(month, m) }
    m.add(iccid)
    let mt = monthTotals.get(month); if (!mt) { mt = new Set(); monthTotals.set(month, mt) }
    mt.add(iccid)
  }

  const months = [...monthSet].sort()
  let rows = [...byCountry].map(([code, c]) => ({
    code, name: c.name, total: c.total.size,
    by_month: Object.fromEntries(months.map(m => [m, c.byMonth.get(m)?.size || 0])),
  })).sort((a, b) => b.total - a.total)
  const totalMatched = rows.length
  if (search) rows = rows.filter(r => r.name.toLowerCase().includes(search) || r.code.toLowerCase().includes(search))
  rows = rows.slice(0, limit)

  return NextResponse.json({
    months,
    month_totals: Object.fromEntries(months.map(m => [m, monthTotals.get(m)?.size || 0])),
    rows,
    total_countries: totalMatched,
    total_cards: new Set([...arrival.keys()].map(k => k.slice(0, k.lastIndexOf('|')))).size,
  })
}
