import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLegacyIccids } from '@/lib/legacy-cards'

// 出行地 × 月份（依每日）：國家 × 月份 矩陣，格子＝該月該國的「卡·日數」
//   每筆每日用量＝一個卡日；同一天在多國各計一次（例：6/30 日+韓 → 日本+1、韓國+1）
//   與「依首日」差別：那張每卡每國只記抵達月一次；這張是待幾天算幾天
// GET ?from=&to=（用量日期區間）&search=（國家）&limit=（列數，預設 50）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const search = (sp.get('search') || '').trim().toLowerCase()
  const limit = Math.min(Number(sp.get('limit')) || 50, 300)
  const supabase = createAdminClient()
  const legacy = sp.get('exclude_legacy') === '1' ? await getLegacyIccids(supabase) : new Set<string>()

  const byCountry = new Map<string, { name: string; total: number; byMonth: Map<string, number> }>()
  const monthSet = new Set<string>()
  const monthTotals = new Map<string, number>()   // 每月卡日合計
  const allCards = new Set<string>()               // 不重複卡數（摘要用）
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('card_usage_daily').select('iccid, used_date, country, country_region_code, used_amount')
    if (from) q = q.gte('used_date', from)
    if (to) q = q.lte('used_date', to)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      if (!r.iccid || (Number(r.used_amount) || 0) <= 0 || legacy.has(r.iccid)) continue
      const month = (r.used_date as string).slice(0, 7)
      const code = r.country_region_code || r.country || '—'
      monthSet.add(month)
      allCards.add(r.iccid)
      let c = byCountry.get(code); if (!c) { c = { name: r.country || code, total: 0, byMonth: new Map() }; byCountry.set(code, c) }
      c.total++                                     // 一筆用量 = 一個卡日
      c.byMonth.set(month, (c.byMonth.get(month) || 0) + 1)
      monthTotals.set(month, (monthTotals.get(month) || 0) + 1)
    }
    if (data.length < 1000) break
  }

  const months = [...monthSet].sort()
  let rows = [...byCountry].map(([code, c]) => ({
    code, name: c.name, total: c.total,
    by_month: Object.fromEntries(months.map(m => [m, c.byMonth.get(m) || 0])),
  })).sort((a, b) => b.total - a.total)
  const totalCountries = rows.length
  if (search) rows = rows.filter(r => r.name.toLowerCase().includes(search) || r.code.toLowerCase().includes(search))
  rows = rows.slice(0, limit)

  return NextResponse.json({
    months,
    month_totals: Object.fromEntries(months.map(m => [m, monthTotals.get(m) || 0])),
    rows,
    total_countries: totalCountries,
    total_cards: allCards.size,
    total_card_days: [...monthTotals.values()].reduce((s, n) => s + n, 0),
  })
}
