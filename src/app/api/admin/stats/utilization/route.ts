import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 用量分佈 / 利用率
//  - 用量分佈：每方案在啟用期間的總用量落在哪個級距（找買了沒用 / 超用）
//  - 天數利用率：單日型「買的天數 vs 實際有用量的天數」
// GET ?from=&to=（啟用時間區間）&plan_type=&today=
const GB = 1048576 // KB

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const planType = sp.get('plan_type') || ''
  const excludeLegacy = sp.get('exclude_legacy') === '1'   // 排除舊 SIMPOMATION（無逐日資料）
  const todayISO = sp.get('today') || ''
  const supabase = createAdminClient()

  // 舊 SIMPOMATION 卡集合（要排除時用）
  const legacy = new Set<string>()
  if (excludeLegacy) {
    for (let f = 0; ; f += 1000) {
      const { data } = await supabase.from('manual_iccids').select('iccid').ilike('note', '%舊SIMPOMATION%').range(f, f + 999)
      if (!data || data.length === 0) break
      for (const r of data) legacy.add(r.iccid)
      if (data.length < 1000) break
    }
  }

  interface Plan { iccid: string; sub_order_id: string; total_days: number | null; plan_type: string | null; plan_start_time: string | null; plan_end_time: string | null }
  const plans: Plan[] = []
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('card_plans').select('iccid, sub_order_id, total_days, plan_type, plan_start_time, plan_end_time')
    if (from) q = q.gte('plan_start_time', from)
    if (to) q = q.lte('plan_start_time', to + 'T23:59:59')
    if (planType) q = q.eq('plan_type', planType)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    plans.push(...(data as Plan[]))
    if (data.length < 1000) break
  }
  const active = plans.filter(p => p.plan_start_time && !legacy.has(p.iccid))
  const iccids = [...new Set(active.map(p => p.iccid))]

  // 每卡每日用量（依 iccid 分組，含日期以算利用天數）
  const byIccid = new Map<string, { date: string; amt: number }[]>()
  for (let i = 0; i < iccids.length; i += 300) {
    const chunk = iccids.slice(i, i + 300)
    for (let f = 0; ; f += 1000) {
      const { data } = await supabase.from('card_usage_daily').select('iccid, used_date, used_amount').in('iccid', chunk).range(f, f + 999)
      if (!data || data.length === 0) break
      for (const r of data) {
        const arr = byIccid.get(r.iccid) || []
        arr.push({ date: r.used_date as string, amt: Number(r.used_amount) || 0 })
        byIccid.set(r.iccid, arr)
      }
      if (data.length < 1000) break
    }
  }
  const dateOf = (ts: string | null) => (ts ? ts.slice(0, 10) : '')
  const addDays = (d: string, n: number) => { const dt = new Date(d + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10) }
  const minDate = (a: string, b: string) => (a < b ? a : b)

  // 用量級距
  const usageBuckets = [
    { key: 'zero', label: '完全沒用 (0)', test: (u: number) => u <= 0 },
    { key: 'lt1', label: '0–1 GB', test: (u: number) => u > 0 && u < GB },
    { key: '1-5', label: '1–5 GB', test: (u: number) => u >= GB && u < 5 * GB },
    { key: '5-20', label: '5–20 GB', test: (u: number) => u >= 5 * GB && u < 20 * GB },
    { key: '20-50', label: '20–50 GB', test: (u: number) => u >= 20 * GB && u < 50 * GB },
    { key: 'gt50', label: '> 50 GB', test: (u: number) => u >= 50 * GB },
  ].map(b => ({ ...b, plans: 0, cards: new Set<string>(), usage: 0 }))

  // 天數利用率級距（單日型；窗口鎖在 plan_start + total_days，比率上限 100%）；每 10% 一格
  const dayBuckets = [
    { key: '0', label: '0%（沒用）', lo: -1, hi: 0 },
    { key: '10', label: '1–10%', lo: 0, hi: 0.10 },
    { key: '20', label: '11–20%', lo: 0.10, hi: 0.20 },
    { key: '30', label: '21–30%', lo: 0.20, hi: 0.30 },
    { key: '40', label: '31–40%', lo: 0.30, hi: 0.40 },
    { key: '50', label: '41–50%', lo: 0.40, hi: 0.50 },
    { key: '60', label: '51–60%', lo: 0.50, hi: 0.60 },
    { key: '70', label: '61–70%', lo: 0.60, hi: 0.70 },
    { key: '80', label: '71–80%', lo: 0.70, hi: 0.80 },
    { key: '90', label: '81–90%', lo: 0.80, hi: 0.90 },
    { key: '100', label: '91–100%', lo: 0.90, hi: 1.0001 },
  ].map(b => ({ ...b, plans: 0 }))

  let zeroPlans = 0
  let dailyPlans = 0, wastedDays = 0, utilSum = 0
  const totalCards = new Set<string>()

  for (const p of active) {
    const startD = dateOf(p.plan_start_time)
    const endD = dateOf(p.plan_end_time) || todayISO || '9999-12-31'
    const usage = byIccid.get(p.iccid) || []
    // 單日型：天數利用率窗口鎖在 plan_start + total_days（不用 plan_end / 今天），避免續期/降速的天數灌大
    const isDaily = p.plan_type === '1' && !!p.total_days && p.total_days > 0
    const capEnd = isDaily ? minDate(endD, addDays(startD, p.total_days! - 1)) : endD
    let total = 0
    const usedDaysCapped = new Set<string>()
    for (const u of usage) {
      if (u.date < startD || u.date > endD) continue
      total += u.amt
      if (isDaily && u.amt > 0 && u.date <= capEnd) usedDaysCapped.add(u.date)
    }
    totalCards.add(p.iccid)
    if (total <= 0) zeroPlans++
    for (const b of usageBuckets) if (b.test(total)) { b.plans++; b.cards.add(p.iccid); b.usage += total; break }

    // 天數利用率：單日型且有 total_days（比率上限 100%）
    if (isDaily) {
      dailyPlans++
      const used = usedDaysCapped.size
      const ratio = Math.min(1, used / p.total_days!)
      utilSum += ratio
      wastedDays += Math.max(0, p.total_days! - used)
      for (const b of dayBuckets) if (ratio > b.lo && ratio <= b.hi) { b.plans++; break }
    }
  }

  const totalPlans = active.length
  return NextResponse.json({
    total_plans: totalPlans,
    total_cards: totalCards.size,
    zero_plans: zeroPlans,
    zero_pct: totalPlans > 0 ? Math.round((zeroPlans / totalPlans) * 1000) / 10 : 0,
    usage_buckets: usageBuckets.map(b => ({ key: b.key, label: b.label, plans: b.plans, cards: b.cards.size, usage: b.usage,
      pct: totalPlans > 0 ? Math.round((b.plans / totalPlans) * 1000) / 10 : 0 })),
    daily_plans: dailyPlans,
    avg_day_util: dailyPlans > 0 ? Math.round((utilSum / dailyPlans) * 1000) / 10 : 0,
    wasted_days: wastedDays,
    day_buckets: dayBuckets.map(b => ({ key: b.key, label: b.label, plans: b.plans,
      pct: dailyPlans > 0 ? Math.round((b.plans / dailyPlans) * 1000) / 10 : 0 })),
  })
}
