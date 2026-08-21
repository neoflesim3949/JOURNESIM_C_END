import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLegacyIccids } from '@/lib/legacy-cards'

// 出行路徑分析：一張卡在一個方案期間，去過的國家「依首次出現日期」排成路徑（日本→韓國→香港）
//   兩層：外層＝國家集合（不分順序），展開＝該集合內各種順序的路徑
// GET ?from=&to=（啟用時間區間）&search=（國家）&min_stops=（最少站數，預設 2）&limit=&today=
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const search = (sp.get('search') || '').trim().toLowerCase()
  const minStops = Math.max(1, Number(sp.get('min_stops')) || 2)
  const limit = Math.min(Number(sp.get('limit')) || 100, 500)
  const todayISO = sp.get('today') || new Date().toISOString().slice(0, 10)
  const supabase = createAdminClient()
  const legacy = sp.get('exclude_legacy') === '1' ? await getLegacyIccids(supabase) : new Set<string>()

  interface Plan { iccid: string; sub_order_id: string; sku_name: string | null; plan_start_time: string | null; plan_end_time: string | null }
  const plans: Plan[] = []
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('card_plans').select('iccid, sub_order_id, sku_name, plan_start_time, plan_end_time').not('plan_start_time', 'is', null)
    if (from) q = q.gte('plan_start_time', from)
    if (to) q = q.lte('plan_start_time', to + 'T23:59:59')
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    plans.push(...(data as Plan[]))
    if (data.length < 1000) break
  }
  const iccids = [...new Set(plans.map(p => p.iccid))]

  const byIccid = new Map<string, { date: string; name: string; code: string; amt: number }[]>()
  for (let i = 0; i < iccids.length; i += 300) {
    const chunk = iccids.slice(i, i + 300)
    for (let f = 0; ; f += 1000) {
      const { data } = await supabase.from('card_usage_daily').select('iccid, used_date, country, country_region_code, used_amount').in('iccid', chunk).range(f, f + 999)
      if (!data || data.length === 0) break
      for (const r of data) {
        const arr = byIccid.get(r.iccid) || []
        arr.push({ date: (r.used_date as string).slice(0, 10), name: r.country || '', code: r.country_region_code || r.country || '—', amt: Number(r.used_amount) || 0 })
        byIccid.set(r.iccid, arr)
      }
      if (data.length < 1000) break
    }
  }
  const dateOf = (ts: string | null) => (ts ? ts.slice(0, 10) : '')

  interface Path { label: string; plans: number; cards: Set<string>; sku: Map<string, number> }
  interface Combo { label: string; stops: number; plans: number; cards: Set<string>; paths: Map<string, Path> }
  const byCombo = new Map<string, Combo>()
  let totalPlans = 0
  const stopsDist = new Map<number, number>()

  for (const p of plans) {
    if (legacy.has(p.iccid)) continue
    const start = dateOf(p.plan_start_time)
    const endRaw = dateOf(p.plan_end_time) || todayISO
    const end = endRaw > todayISO ? todayISO : endRaw
    const usage = byIccid.get(p.iccid) || []
    const country = new Map<string, { name: string; first: string; usage: number }>()
    for (const u of usage) {
      if (u.date < start || u.date > end || u.amt <= 0) continue
      const c = country.get(u.code)
      if (!c) country.set(u.code, { name: u.name || u.code, first: u.date, usage: u.amt })
      else { if (u.date < c.first) c.first = u.date; c.usage += u.amt; if (u.name) c.name = u.name }
    }
    if (country.size === 0) continue
    // 路徑：依 首次出現日期 → 用量 排序
    const ordered = [...country].sort((a, b) => a[1].first.localeCompare(b[1].first) || b[1].usage - a[1].usage)
    const stops = ordered.length
    stopsDist.set(stops, (stopsDist.get(stops) || 0) + 1)
    totalPlans++
    if (stops < minStops) continue
    const pathKey = ordered.map(e => e[0]).join('>')
    const pathLabel = ordered.map(e => e[1].name).join(' → ')
    // 國家集合（不分順序）：依國碼排序
    const setEntries = [...country].sort((a, b) => a[0].localeCompare(b[0]))
    const comboKey = setEntries.map(e => e[0]).join('|')
    const comboLabel = setEntries.map(e => e[1].name).join('、')

    let g = byCombo.get(comboKey)
    if (!g) { g = { label: comboLabel, stops, plans: 0, cards: new Set(), paths: new Map() }; byCombo.set(comboKey, g) }
    g.plans++
    g.cards.add(p.iccid)
    let pt = g.paths.get(pathKey)
    if (!pt) { pt = { label: pathLabel, plans: 0, cards: new Set(), sku: new Map() }; g.paths.set(pathKey, pt) }
    pt.plans++
    pt.cards.add(p.iccid)
    const sk = p.sku_name || '—'
    pt.sku.set(sk, (pt.sku.get(sk) || 0) + 1)
  }

  const denom = [...byCombo.values()].reduce((s, g) => s + g.plans, 0)
  let rows = [...byCombo.values()].map(g => ({
    label: g.label, stops: g.stops, plans: g.plans, cards: g.cards.size,
    pct: denom > 0 ? Math.round((g.plans / denom) * 1000) / 10 : 0,
    path_count: g.paths.size,
    paths: [...g.paths.values()].map(pt => ({
      label: pt.label, plans: pt.plans, cards: pt.cards.size,
      pct: g.plans > 0 ? Math.round((pt.plans / g.plans) * 1000) / 10 : 0,
      top_sku: [...pt.sku].sort((a, b) => b[1] - a[1])[0]?.[0] || '—',
    })).sort((a, b) => b.plans - a.plans),
  })).sort((a, b) => b.plans - a.plans)
  const totalCombos = rows.length
  if (search) rows = rows.filter(r => r.label.toLowerCase().includes(search))
  rows = rows.slice(0, limit)

  return NextResponse.json({
    rows,
    total_combos: totalCombos,
    matched_plans: denom,
    total_plans: totalPlans,
    min_stops: minStops,
    stops_dist: [...stopsDist].map(([stops, plans]) => ({ stops, plans })).sort((a, b) => a.stops - b.stops),
  })
}
