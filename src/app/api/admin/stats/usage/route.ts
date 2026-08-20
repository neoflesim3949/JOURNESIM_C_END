import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 數據使用量分析（card_usage_daily，用量單位 KB）
// GET ?dim=global|sku|country & from= & to=
//   global  → 依日期彙總（趨勢）
//   sku     → 依方案 SKU 彙總（用 iccid→SKU 對照）
//   country → 依國家彙總
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const dim = sp.get('dim') || 'global'
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  // 每日趨勢：沒指定區間時預設近 30 天
  const effFrom = (dim === 'global' && !from) ? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10) : from
  const supabase = createAdminClient()

  // iccid → 方案對照：一張卡取出現最多次的 (SKU, copies)
  //  - dim=sku：把用量歸到 SKU
  //  - dim=country：展開國家時，要看該國用量來自哪些 SKU（顛倒看）
  let iccidToSku: Map<string, { id: string; name: string; copies: string }> | null = null
  if (dim === 'sku' || dim === 'country') {
    // 每 iccid：(sku|copies) 出現次數
    const comboCount = new Map<string, Map<string, number>>()
    const skuName = new Map<string, string>()
    for (let f = 0; ; f += 1000) {
      const { data } = await supabase.from('card_plans').select('iccid, sku_id, sku_name, copies').range(f, f + 999)
      if (!data || data.length === 0) break
      for (const p of data) {
        if (!p.sku_id) continue
        skuName.set(p.sku_id, p.sku_name || p.sku_id)
        const combo = `${p.sku_id}|${p.copies ?? ''}`
        if (!comboCount.has(p.iccid)) comboCount.set(p.iccid, new Map())
        const m = comboCount.get(p.iccid)!
        m.set(combo, (m.get(combo) || 0) + 1)
      }
      if (data.length < 1000) break
    }
    iccidToSku = new Map()
    for (const [ic, m] of comboCount) {
      let best = '', bestN = -1
      for (const [combo, n] of m) if (n > bestN) { best = combo; bestN = n }
      if (best) {
        const [sku, copies] = best.split('|')
        iccidToSku.set(ic, { id: sku, name: skuName.get(sku) || sku, copies: copies || '—' })
      }
    }
  }

  // 掃 card_usage_daily 彙總（含用到的卡數、卡×日數）；dim=sku 另存每 SKU 的 copies 用量分佈
  const byKey = new Map<string, { label: string; usage: number; cards: Set<string>; cardDays: Set<string>; copiesDist: Map<string, { usage: number; cards: Set<string>; cardDays: Set<string> }>; skuDist: Map<string, { name: string; usage: number; cards: Set<string>; cardDays: Set<string>; copiesDist: Map<string, { usage: number; cards: Set<string>; cardDays: Set<string> }> }> }>()
  const totalCards = new Set<string>()
  const totalCardDays = new Set<string>()
  let total = 0
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('card_usage_daily').select('iccid, used_date, country, country_region_code, used_amount')
    if (effFrom) q = q.gte('used_date', effFrom)
    if (to) q = q.lte('used_date', to)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const amt = Number(r.used_amount) || 0
      total += amt
      const cardDayKey = `${r.iccid}|${r.used_date}`
      if (r.iccid) { totalCards.add(r.iccid); totalCardDays.add(cardDayKey) }
      let key: string, label: string, copies = ''
      if (dim === 'country') { key = r.country_region_code || r.country || '—'; label = r.country || key }
      else if (dim === 'sku') { const s = iccidToSku!.get(r.iccid); key = s?.id || '(無方案對照)'; label = s?.name || '(無方案對照)'; copies = s?.copies || '—' }
      else { key = (r.used_date as string) || '—'; label = key }   // global：依日期
      const a = byKey.get(key) || { label, usage: 0, cards: new Set<string>(), cardDays: new Set<string>(), copiesDist: new Map(), skuDist: new Map() }
      a.usage += amt
      if (r.iccid) { a.cards.add(r.iccid); a.cardDays.add(cardDayKey) }
      if (dim === 'sku') {
        const cd = a.copiesDist.get(copies) || { usage: 0, cards: new Set<string>(), cardDays: new Set<string>() }
        cd.usage += amt
        if (r.iccid) { cd.cards.add(r.iccid); cd.cardDays.add(cardDayKey) }
        a.copiesDist.set(copies, cd)
      } else if (dim === 'country') {
        // 顛倒看：該國用量來自哪些方案 SKU（再往下拆份數）
        const s = iccidToSku!.get(r.iccid)
        const skuKey = s?.id || '(無方案對照)'
        const sd = a.skuDist.get(skuKey) || { name: s?.name || '(無方案對照)', usage: 0, cards: new Set<string>(), cardDays: new Set<string>(), copiesDist: new Map() }
        sd.usage += amt
        if (r.iccid) { sd.cards.add(r.iccid); sd.cardDays.add(cardDayKey) }
        const scv = s?.copies || '—'
        const scd = sd.copiesDist.get(scv) || { usage: 0, cards: new Set<string>(), cardDays: new Set<string>() }
        scd.usage += amt
        if (r.iccid) { scd.cards.add(r.iccid); scd.cardDays.add(cardDayKey) }
        sd.copiesDist.set(scv, scd)
        a.skuDist.set(skuKey, sd)
      }
      byKey.set(key, a)
    }
    if (data.length < 1000) break
  }

  let rows = [...byKey].map(([key, a]) => ({
    key, label: a.label, usage: a.usage, cards: a.cards.size,
    avg: a.cards.size > 0 ? Math.round(a.usage / a.cards.size) : 0,   // 平均每卡用量(KB)
    avg_card_day: a.cardDays.size > 0 ? Math.round(a.usage / a.cardDays.size) : 0,  // 平均每卡每日(KB)
    share: total > 0 ? Math.round((a.usage / total) * 1000) / 10 : 0,
    copies_dist: dim === 'sku'
      ? [...a.copiesDist].map(([copies, c]) => ({
          copies, usage: c.usage, cards: c.cards.size,
          avg: c.cards.size > 0 ? Math.round(c.usage / c.cards.size) : 0,
          avg_card_day: c.cardDays.size > 0 ? Math.round(c.usage / c.cardDays.size) : 0,
        }))
          .sort((m, n) => (Number(m.copies) || 0) - (Number(n.copies) || 0))
      : [],
    // 國家維度顛倒看：該國用量的方案（SKU）分佈
    sku_dist: dim === 'country'
      ? [...a.skuDist].map(([sku_id, c]) => ({
          sku_id, sku_name: c.name, usage: c.usage, cards: c.cards.size,
          avg: c.cards.size > 0 ? Math.round(c.usage / c.cards.size) : 0,
          avg_card_day: c.cardDays.size > 0 ? Math.round(c.usage / c.cardDays.size) : 0,
          copies_dist: [...c.copiesDist].map(([copies, cc]) => ({
            copies, usage: cc.usage, cards: cc.cards.size,
            avg: cc.cards.size > 0 ? Math.round(cc.usage / cc.cards.size) : 0,
            avg_card_day: cc.cardDays.size > 0 ? Math.round(cc.usage / cc.cardDays.size) : 0,
          })).sort((m, n) => (Number(m.copies) || 0) - (Number(n.copies) || 0)),
        })).sort((m, n) => n.usage - m.usage)
      : [],
  }))
  // global 依日期排序（舊到新）；其餘依用量排序
  if (dim === 'global') rows = rows.sort((x, y) => y.key.localeCompare(x.key))   // 新到舊（近的在上面）
  else rows = rows.sort((x, y) => y.usage - x.usage)

  const avgCardDay = totalCardDays.size > 0 ? Math.round(total / totalCardDays.size) : 0
  return NextResponse.json({ dim, rows, total, total_cards: totalCards.size, total_avg_card_day: avgCardDay, count: rows.length })
}
