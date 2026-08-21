import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLegacyIccids } from '@/lib/legacy-cards'

// 方案覆蓋組合：每支 SKU 的各方案，在啟用期間去了哪些地區
//   mode=sku   ：SKU →（幾個國家）→（實際國家組合，各有幾張卡）
//   mode=combo ：不分方案，全體 →（幾個國家）→（實際國家組合）
// GET ?mode=sku|combo &from=&to=（啟用時間區間）&plan_status=&today=
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const mode = sp.get('mode') === 'combo' ? 'combo' : 'sku'
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const planStatus = sp.get('plan_status') || ''
  const todayISO = sp.get('today') || ''
  const supabase = createAdminClient()
  const legacy = sp.get('exclude_legacy') === '1' ? await getLegacyIccids(supabase) : new Set<string>()

  interface Plan {
    iccid: string; sub_order_id: string; sku_id: string | null; sku_name: string | null
    plan_start_time: string | null; plan_end_time: string | null; plan_status: string | null
  }
  const plans: Plan[] = []
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('card_plans')
      .select('iccid, sub_order_id, sku_id, sku_name, plan_start_time, plan_end_time, plan_status')
    if (from) q = q.gte('plan_start_time', from)
    if (to) q = q.lte('plan_start_time', to + 'T23:59:59')
    if (planStatus) q = q.eq('plan_status', planStatus)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    plans.push(...(data as Plan[]))
    if (data.length < 1000) break
  }
  const activePlans = plans.filter(p => p.plan_start_time && !legacy.has(p.iccid))
  const iccids = [...new Set(activePlans.map(p => p.iccid))]

  // 每卡每日用量（依 iccid 分組）
  const byIccid = new Map<string, { date: string; name: string; code: string; amt: number }[]>()
  for (let i = 0; i < iccids.length; i += 300) {
    const chunk = iccids.slice(i, i + 300)
    for (let f = 0; ; f += 1000) {
      const { data } = await supabase.from('card_usage_daily')
        .select('iccid, used_date, country, country_region_code, used_amount')
        .in('iccid', chunk).range(f, f + 999)
      if (!data || data.length === 0) break
      for (const r of data) {
        const arr = byIccid.get(r.iccid) || []
        arr.push({ date: r.used_date as string, name: r.country || '', code: r.country_region_code || r.country || '—', amt: Number(r.used_amount) || 0 })
        byIccid.set(r.iccid, arr)
      }
      if (data.length < 1000) break
    }
  }
  const dateOf = (ts: string | null) => (ts ? ts.slice(0, 10) : '')

  // 每支 SKU → 各國家組合統計（mode=combo 時 bySku 只用一個全體桶）
  //  cardDays：iccid|date 集合，用來算「平均每卡每日」
  interface SkuAgg { name: string; plans: number; cards: Set<string>; cardDays: Set<string>; usage: number }
  interface Combo { label: string; codes: string[]; names: string[]; plans: number; cards: Set<string>; cardDays: Set<string>; usage: number; skuDist: Map<string, SkuAgg> }
  interface Sku { sku_name: string; plans: number; cards: Set<string>; cardDays: Set<string>; usage: number; combos: Map<string, Combo> }
  const bySku = new Map<string, Sku>()
  const ALL = '__ALL__'
  const avg = (u: number, n: number) => (n > 0 ? Math.round(u / n) : 0)

  for (const p of activePlans) {
    const startD = dateOf(p.plan_start_time)
    const endD = dateOf(p.plan_end_time) || todayISO || '9999-12-31'
    const usage = byIccid.get(p.iccid) || []
    // 該方案期間用到的國家（code→name、用量）與卡×日
    const used = new Map<string, { name: string; usage: number }>()
    const cardDayKeys: string[] = []
    let total = 0
    for (const u of usage) {
      if (u.date < startD || u.date > endD) continue
      total += u.amt
      const c = used.get(u.code) || { name: u.name || u.code, usage: 0 }
      c.usage += u.amt
      used.set(u.code, c)
      if (u.amt > 0) cardDayKeys.push(`${p.iccid}|${u.date}`)
    }
    if (used.size === 0) continue   // 期間內沒用到任何地區

    const skuKey = mode === 'combo' ? ALL : (p.sku_id || p.sku_name || '未知')
    let s = bySku.get(skuKey)
    if (!s) { s = { sku_name: mode === 'combo' ? '全部方案' : (p.sku_name || skuKey), plans: 0, cards: new Set(), cardDays: new Set(), usage: 0, combos: new Map() }; bySku.set(skuKey, s) }
    s.plans++
    s.cards.add(p.iccid)
    s.usage += total
    cardDayKeys.forEach(k => s!.cardDays.add(k))

    // 組合鍵：依 code 排序
    const entries = [...used].sort((a, b) => a[0].localeCompare(b[0]))
    const codes = entries.map(e => e[0])
    const names = entries.map(e => e[1].name)
    const comboKey = codes.join('|')
    let combo = s.combos.get(comboKey)
    if (!combo) { combo = { label: names.join('、'), codes, names, plans: 0, cards: new Set(), cardDays: new Set(), usage: 0, skuDist: new Map() }; s.combos.set(comboKey, combo) }
    combo.plans++
    combo.cards.add(p.iccid)
    combo.usage += total
    cardDayKeys.forEach(k => combo!.cardDays.add(k))
    // 此組合是由哪些方案(SKU)貢獻
    const cSkuKey = p.sku_id || p.sku_name || '未知'
    const sa = combo.skuDist.get(cSkuKey) || { name: p.sku_name || cSkuKey, plans: 0, cards: new Set(), cardDays: new Set(), usage: 0 }
    sa.plans++
    sa.cards.add(p.iccid)
    sa.usage += total
    cardDayKeys.forEach(k => sa.cardDays.add(k))
    combo.skuDist.set(cSkuKey, sa)
  }

  const buildSizeGroups = (s: Sku) => {
    const bySize = new Map<number, { size: number; plans: number; cards: Set<string>; cardDays: Set<string>; usage: number; combos: Combo[] }>()
    for (const combo of s.combos.values()) {
      const size = combo.codes.length
      let g = bySize.get(size)
      if (!g) { g = { size, plans: 0, cards: new Set(), cardDays: new Set(), usage: 0, combos: [] }; bySize.set(size, g) }
      g.plans += combo.plans
      combo.cards.forEach(c => g!.cards.add(c))
      combo.cardDays.forEach(c => g!.cardDays.add(c))
      g.usage += combo.usage
      g.combos.push(combo)
    }
    return [...bySize.values()].map(g => ({
      size: g.size, plans: g.plans, cards: g.cards.size, usage: g.usage,
      avg: avg(g.usage, g.cards.size), avg_card_day: avg(g.usage, g.cardDays.size),
      combos: g.combos.map(c => ({
        label: c.label, names: c.names, size: c.codes.length, plans: c.plans, cards: c.cards.size, usage: c.usage,
        avg: avg(c.usage, c.cards.size), avg_card_day: avg(c.usage, c.cardDays.size),
        sku_dist: [...c.skuDist].map(([sku_id, sa]) => ({ sku_id, sku_name: sa.name, plans: sa.plans, cards: sa.cards.size, usage: sa.usage,
          avg: avg(sa.usage, sa.cards.size), avg_card_day: avg(sa.usage, sa.cardDays.size) }))
          .sort((a, b) => b.plans - a.plans || b.usage - a.usage),
      })).sort((a, b) => b.plans - a.plans || b.usage - a.usage),
    })).sort((a, b) => a.size - b.size)
  }

  // mode=combo：不分方案，直接回傳全體的 size 群組
  if (mode === 'combo') {
    const s = bySku.get(ALL)
    if (!s) return NextResponse.json({ mode, size_groups: [], plans: 0, cards: 0, usage: 0, total_usage: 0, size_count: 0, combo_count: 0 })
    return NextResponse.json({
      mode,
      plans: s.plans, cards: s.cards.size, usage: s.usage, total_usage: s.usage,
      avg: avg(s.usage, s.cards.size), avg_card_day: avg(s.usage, s.cardDays.size),
      size_count: new Set([...s.combos.values()].map(c => c.codes.length)).size,
      combo_count: s.combos.size,
      size_groups: buildSizeGroups(s),
    })
  }

  // 組裝：SKU → size 群組 → combos
  const totalUsage = [...bySku.values()].reduce((sum, s) => sum + s.usage, 0)
  const rows = [...bySku].map(([sku_id, s]) => ({
    sku_id,
    sku_name: s.sku_name,
    plans: s.plans,
    cards: s.cards.size,
    usage: s.usage,
    avg: avg(s.usage, s.cards.size),
    avg_card_day: avg(s.usage, s.cardDays.size),
    size_count: new Set([...s.combos.values()].map(c => c.codes.length)).size,  // 幾種「國家數」
    combo_count: s.combos.size,       // 幾種組合
    size_groups: buildSizeGroups(s),
  })).sort((x, y) => y.plans - x.plans)

  return NextResponse.json({ mode, rows, total_skus: rows.length, total_usage: totalUsage })
}
