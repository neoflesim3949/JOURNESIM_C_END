import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 方案覆蓋國家：每支 SKU 實際被使用（有流量）在幾個國家
// GET ?from=&to=（使用日期區間）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const supabase = createAdminClient()

  // iccid → SKU（取出現最多次的）
  const combo = new Map<string, Map<string, number>>()
  const skuName = new Map<string, string>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('card_plans').select('iccid, sku_id, sku_name').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const p of data) {
      if (!p.sku_id) continue
      skuName.set(p.sku_id, p.sku_name || p.sku_id)
      if (!combo.has(p.iccid)) combo.set(p.iccid, new Map())
      const m = combo.get(p.iccid)!
      m.set(p.sku_id, (m.get(p.sku_id) || 0) + 1)
    }
    if (data.length < 1000) break
  }
  const iccidToSku = new Map<string, string>()
  for (const [ic, m] of combo) {
    let best = '', bestN = -1
    for (const [s, n] of m) if (n > bestN) { best = s; bestN = n }
    if (best) iccidToSku.set(ic, best)
  }

  // 掃 card_usage_daily：每 SKU → 各國用量（含卡數、卡×日數以算平均）
  const bySku = new Map<string, { usage: number; cards: Set<string>; cardDays: Set<string>; countries: Map<string, { name: string; usage: number; cards: Set<string>; cardDays: Set<string> }> }>()
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('card_usage_daily').select('iccid, used_date, country, country_region_code, used_amount')
    if (from) q = q.gte('used_date', from)
    if (to) q = q.lte('used_date', to)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const sku = iccidToSku.get(r.iccid) || '(無方案對照)'
      const amt = Number(r.used_amount) || 0
      const cKey = r.country_region_code || r.country || '—'
      const cdKey = `${r.iccid}|${r.used_date}`
      let a = bySku.get(sku)
      if (!a) { a = { usage: 0, cards: new Set(), cardDays: new Set(), countries: new Map() }; bySku.set(sku, a) }
      a.usage += amt
      if (r.iccid) { a.cards.add(r.iccid); a.cardDays.add(cdKey) }
      let c = a.countries.get(cKey)
      if (!c) { c = { name: r.country || cKey, usage: 0, cards: new Set(), cardDays: new Set() }; a.countries.set(cKey, c) }
      c.usage += amt
      if (r.iccid) { c.cards.add(r.iccid); c.cardDays.add(cdKey) }
    }
    if (data.length < 1000) break
  }

  const rows = [...bySku].map(([sku_id, a]) => ({
    sku_id,
    sku_name: skuName.get(sku_id) || sku_id,
    country_count: a.countries.size,
    usage: a.usage,
    cards: a.cards.size,
    avg: a.cards.size > 0 ? Math.round(a.usage / a.cards.size) : 0,
    avg_card_day: a.cardDays.size > 0 ? Math.round(a.usage / a.cardDays.size) : 0,
    countries: [...a.countries].map(([code, c]) => ({
      code, name: c.name, usage: c.usage, cards: c.cards.size,
      avg: c.cards.size > 0 ? Math.round(c.usage / c.cards.size) : 0,
      avg_card_day: c.cardDays.size > 0 ? Math.round(c.usage / c.cardDays.size) : 0,
    })).sort((m, n) => n.usage - m.usage),
  })).sort((x, y) => y.country_count - x.country_count || y.usage - x.usage)

  return NextResponse.json({ rows, total_skus: rows.length })
}
