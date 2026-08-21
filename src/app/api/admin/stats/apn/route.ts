import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLegacyIccids } from '@/lib/legacy-cards'

// APN 使用統計：card_plans → SKU → bc_products.country_data 的 apn 聚合
//   mode=sku：APN 展開＝使用該 APN 的方案(SKU)；mode=country：APN 展開＝該 APN 覆蓋的國家
//   註：一個 SKU 常跨多國、含多個 APN，故各 APN 的方案數加總可能 > 全部方案數（覆蓋性統計）
// GET ?mode=sku|country &from=&to=（啟用時間）&plan_status=&plan_type=&exclude_legacy=1
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const mode = sp.get('mode') === 'country' ? 'country' : 'sku'
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const planStatus = sp.get('plan_status') || ''
  const planType = sp.get('plan_type') || ''
  const supabase = createAdminClient()
  const legacy = sp.get('exclude_legacy') === '1' ? await getLegacyIccids(supabase) : new Set<string>()

  // 1) card_plans 依 SKU 彙總
  const skuAgg = new Map<string, { name: string; plans: number; cards: Set<string>; copies: number }>()
  let totalPlans = 0
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('card_plans').select('sku_id, sku_name, plan_type, copies, iccid, plan_start_time, plan_status')
    if (from) q = q.gte('plan_start_time', from)
    if (to) q = q.lte('plan_start_time', to + 'T23:59:59')
    if (planStatus) q = q.eq('plan_status', planStatus)
    if (planType) q = q.eq('plan_type', planType)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    for (const p of data) {
      if (legacy.has(p.iccid)) continue
      const key = (p.sku_id as string) || (p.sku_name as string) || '未知'
      let a = skuAgg.get(key)
      if (!a) { a = { name: (p.sku_name as string) || key, plans: 0, cards: new Set(), copies: 0 }; skuAgg.set(key, a) }
      a.plans++; if (p.iccid) a.cards.add(p.iccid as string); a.copies += Number(p.copies) || 0
      totalPlans++
    }
    if (data.length < 1000) break
  }

  // 1b) 每卡用量：iccid → 總用量(KB) + 卡日數（不重複 used_date）
  const usageByIccid = new Map<string, { kb: number; days: Set<string> }>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('card_usage_daily').select('iccid, used_date, used_amount').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const ic = r.iccid as string; const amt = Number(r.used_amount) || 0
      if (!ic || amt <= 0 || legacy.has(ic)) continue
      let u = usageByIccid.get(ic); if (!u) { u = { kb: 0, days: new Set() }; usageByIccid.set(ic, u) }
      u.kb += amt; u.days.add(r.used_date as string)
    }
    if (data.length < 1000) break
  }
  const usageOf = (cards: Set<string>) => {
    let kb = 0, cardDays = 0
    for (const ic of cards) { const u = usageByIccid.get(ic); if (u) { kb += u.kb; cardDays += u.days.size } }
    return { usage: kb, cardDays }
  }

  // 2) sku → country_data 的 (apn, mcc, name)
  const skuCd = new Map<string, { apn: string; mcc: string; cname: string }[]>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('bc_products').select('sku_id, country_data').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const cd = r.country_data as { apn?: string; mcc?: string; name?: string }[] | null
      if (!Array.isArray(cd)) continue
      const list: { apn: string; mcc: string; cname: string }[] = []
      for (const c of cd) { const apn = (c.apn || '').trim(); if (!apn) continue; list.push({ apn, mcc: c.mcc || '—', cname: c.name || c.mcc || '—' }) }
      if (list.length) skuCd.set(r.sku_id as string, list)
    }
    if (data.length < 1000) break
  }

  // 3) 依 APN 聚合
  interface Child { key: string; label: string; plans: number; cards: Set<string>; copies: number }
  interface ApnAgg { plans: number; cards: Set<string>; copies: number; skus: Map<string, Child>; countries: Map<string, Child> }
  const apnAgg = new Map<string, ApnAgg>()
  const ensure = (apn: string): ApnAgg => {
    let a = apnAgg.get(apn); if (!a) { a = { plans: 0, cards: new Set(), copies: 0, skus: new Map(), countries: new Map() }; apnAgg.set(apn, a) }
    return a
  }
  for (const [sku, s] of skuAgg) {
    const cd = skuCd.get(sku) || []
    const apns = [...new Set(cd.map(x => x.apn))]
    const targets = apns.length ? apns : ['（無 APN 資料）']
    for (const apn of targets) {
      const a = ensure(apn)
      a.plans += s.plans; a.copies += s.copies; for (const ic of s.cards) a.cards.add(ic)
      // 子：方案
      let ck = a.skus.get(sku); if (!ck) { ck = { key: sku, label: s.name, plans: 0, cards: new Set(), copies: 0 }; a.skus.set(sku, ck) }
      ck.plans += s.plans; ck.copies += s.copies; for (const ic of s.cards) ck.cards.add(ic)
    }
    // 子：國家（依該 sku 在此 apn 涵蓋的國家）
    for (const { apn, mcc, cname } of cd) {
      const a = ensure(apn)
      let cc = a.countries.get(mcc); if (!cc) { cc = { key: mcc, label: cname, plans: 0, cards: new Set(), copies: 0 }; a.countries.set(mcc, cc) }
      cc.plans += s.plans; cc.copies += s.copies; for (const ic of s.cards) cc.cards.add(ic)
    }
  }

  const childRows = (m: Map<string, Child>, parentPlans: number) => [...m.values()]
    .map(c => {
      const { usage, cardDays } = usageOf(c.cards)
      return {
        key: c.key, label: c.label, plans: c.plans, cards: c.cards.size, copies: c.copies,
        share: parentPlans > 0 ? Math.round((c.plans / parentPlans) * 1000) / 10 : 0,
        usage, avg: c.cards.size > 0 ? Math.round(usage / c.cards.size) : 0, avg_card_day: cardDays > 0 ? Math.round(usage / cardDays) : 0,
      }
    })
    .sort((x, y) => y.plans - x.plans)

  const rows = [...apnAgg].map(([apn, a]) => {
    const { usage, cardDays } = usageOf(a.cards)
    return {
      apn,
      plans: a.plans, cards: a.cards.size, copies: a.copies,
      share: totalPlans > 0 ? Math.round((a.plans / totalPlans) * 1000) / 10 : 0,
      usage, avg: a.cards.size > 0 ? Math.round(usage / a.cards.size) : 0, avg_card_day: cardDays > 0 ? Math.round(usage / cardDays) : 0,
      children: childRows(mode === 'country' ? a.countries : a.skus, a.plans),
    }
  }).sort((x, y) => y.plans - x.plans)

  return NextResponse.json({ rows, total_plans: totalPlans, total_apns: rows.length, mode })
}
