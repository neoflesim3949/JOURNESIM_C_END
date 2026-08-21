import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLegacyIccids } from '@/lib/legacy-cards'

// 日均量分佈：每張卡的「平均每日用量」＝總用量 ÷ 有流量天數，落在哪個 100MB 級距（未滿往上進位：70→100、120→200）
//   依 sku_meta.is_unlimited 分：匯總 / 一般 / 吃到飽
// GET ?from=&to=（用量日期）&exclude_legacy=1
const MB = 1024 // KB

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const step = [100, 200, 500, 1000].includes(Number(sp.get('step'))) ? Number(sp.get('step')) : 100
  const supabase = createAdminClient()
  const legacy = sp.get('exclude_legacy') === '1' ? await getLegacyIccids(supabase) : new Set<string>()

  // iccid → 主要 sku_id
  const combo = new Map<string, Map<string, number>>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('card_plans').select('iccid, sku_id').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const p of data) {
      if (!p.sku_id || legacy.has(p.iccid)) continue
      if (!combo.has(p.iccid)) combo.set(p.iccid, new Map())
      const m = combo.get(p.iccid)!; m.set(p.sku_id, (m.get(p.sku_id) || 0) + 1)
    }
    if (data.length < 1000) break
  }
  const iccidToSku = new Map<string, string>()
  for (const [ic, m] of combo) { let b = '', n = -1; for (const [k, v] of m) if (v > n) { b = k; n = v } if (b) iccidToSku.set(ic, b) }

  // 吃到飽 SKU 集合
  const unlimited = new Set<string>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('sku_meta').select('sku_id, is_unlimited').eq('is_unlimited', true).range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) unlimited.add(r.sku_id)
    if (data.length < 1000) break
  }

  // 每卡：總用量 + 有流量天數
  const byIccid = new Map<string, { kb: number; days: Set<string> }>()
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('card_usage_daily').select('iccid, used_date, used_amount')
    if (from) q = q.gte('used_date', from)
    if (to) q = q.lte('used_date', to)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const amt = Number(r.used_amount) || 0
      if (!r.iccid || amt <= 0 || legacy.has(r.iccid)) continue
      let g = byIccid.get(r.iccid); if (!g) { g = { kb: 0, days: new Set() }; byIccid.set(r.iccid, g) }
      g.kb += amt; g.days.add(r.used_date as string)
    }
    if (data.length < 1000) break
  }

  // 日均量 → 級距（ceil）：≤3G 用選定的 step、>3G 每 1G
  const bucketOf = (mb: number) => mb <= 3000 ? Math.max(step, Math.ceil(mb / step) * step)
    : Math.ceil(mb / 1000) * 1000
  const buckets = new Map<number, { all: number; general: number; unlimited: number }>()
  const dayBuckets = new Map<number, { all: number; general: number; unlimited: number }>()  // 1..30，31=>30+
  let cardsAll = 0, cardsUnl = 0, sumAvgAll = 0, sumAvgUnl = 0, sumAvgGen = 0
  let sumDaysAll = 0, sumDaysUnl = 0, sumDaysGen = 0
  for (const [ic, g] of byIccid) {
    if (g.days.size === 0) continue
    const mbPerDay = g.kb / g.days.size / MB
    if (mbPerDay <= 0) continue
    const b = bucketOf(mbPerDay)
    const isUnl = unlimited.has(iccidToSku.get(ic) || '')
    const cell = buckets.get(b) || { all: 0, general: 0, unlimited: 0 }
    cell.all++; if (isUnl) cell.unlimited++; else cell.general++
    buckets.set(b, cell)
    // 使用天數分佈
    const dk = Math.min(g.days.size, 31)
    const dc = dayBuckets.get(dk) || { all: 0, general: 0, unlimited: 0 }
    dc.all++; if (isUnl) dc.unlimited++; else dc.general++
    dayBuckets.set(dk, dc)
    cardsAll++; sumAvgAll += mbPerDay; sumDaysAll += g.days.size
    if (isUnl) { cardsUnl++; sumAvgUnl += mbPerDay; sumDaysUnl += g.days.size } else { sumAvgGen += mbPerDay; sumDaysGen += g.days.size }
  }

  const maxB = buckets.size ? Math.max(...buckets.keys()) : 100
  // 產生對應的級距序列（與 bucketOf 一致）
  const seq: number[] = []
  for (let b = step; b <= 3000 && b <= maxB; b += step) seq.push(b)
  for (let b = 4000; b <= maxB; b += 1000) seq.push(b)
  const rows = seq.map(b => ({ mb: b, ...(buckets.get(b) || { all: 0, general: 0, unlimited: 0 }) }))
  // 使用天數分佈 1..30 + 30+
  const dayRows = Array.from({ length: 31 }, (_, i) => {
    const day = i + 1
    return { day, label: day <= 30 ? String(day) : '30+', ...(dayBuckets.get(day) || { all: 0, general: 0, unlimited: 0 }) }
  })

  return NextResponse.json({
    rows,
    day_rows: dayRows,
    avg_days_all: cardsAll > 0 ? Math.round((sumDaysAll / cardsAll) * 10) / 10 : 0,
    avg_days_general: (cardsAll - cardsUnl) > 0 ? Math.round((sumDaysGen / (cardsAll - cardsUnl)) * 10) / 10 : 0,
    avg_days_unlimited: cardsUnl > 0 ? Math.round((sumDaysUnl / cardsUnl) * 10) / 10 : 0,
    total_cards: cardsAll,
    unlimited_cards: cardsUnl,
    general_cards: cardsAll - cardsUnl,
    avg_all_mb: cardsAll > 0 ? Math.round(sumAvgAll / cardsAll) : 0,
    avg_general_mb: (cardsAll - cardsUnl) > 0 ? Math.round(sumAvgGen / (cardsAll - cardsUnl)) : 0,
    avg_unlimited_mb: cardsUnl > 0 ? Math.round(sumAvgUnl / cardsUnl) : 0,
  })
}
