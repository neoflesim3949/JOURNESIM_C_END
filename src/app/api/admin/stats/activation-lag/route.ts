import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLegacyIccids } from '@/lib/legacy-cards'

// 下單 → 開通 間隔：card_plans.order_time（優先蝦皮，其次 BC 建單）到 plan_start_time（開通/啟用）
// GET ?from=&to=（下單日期區間）&source=shopee|bc
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const source = sp.get('source') || ''
  const supabase = createAdminClient()
  const legacy = sp.get('exclude_legacy') === '1' ? await getLegacyIccids(supabase) : new Set<string>()

  interface Row { iccid: string; sku_name: string | null; order_time: string; plan_start_time: string; order_time_source: string | null }
  const data: Row[] = []
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('card_plans').select('iccid, sku_name, order_time, plan_start_time, order_time_source')
      .not('order_time', 'is', null).not('plan_start_time', 'is', null)
    if (from) q = q.gte('order_time', from)
    if (to) q = q.lte('order_time', to + 'T23:59:59')
    if (source) q = q.eq('order_time_source', source)
    const { data: page } = await q.range(f, f + 999)
    if (!page || page.length === 0) break
    data.push(...(page as Row[]))
    if (page.length < 1000) break
  }

  // 以「天」為單位（floor 到整數天做分桶）
  const buckets = [
    { key: 'neg', label: '開通早於下單（異常）', plans: 0 },
    { key: 'd0', label: '當日（0 天）', plans: 0 },
    { key: 'd1', label: '1 天', plans: 0 },
    { key: 'd2', label: '2 天', plans: 0 },
    { key: 'd3', label: '3–6 天', plans: 0 },
    { key: 'd7', label: '7–13 天', plans: 0 },
    { key: 'd14', label: '14–29 天', plans: 0 },
    { key: 'd30', label: '30–59 天', plans: 0 },
    { key: 'd60', label: '60–89 天', plans: 0 },
    { key: 'd90', label: '≥ 90 天', plans: 0 },
  ]
  const daysArr: number[] = []
  const srcCount = { shopee: 0, bc: 0 }
  const rows: { iccid: string; sku_name: string; order_time: string; plan_start_time: string; days: number; source: string | null }[] = []
  const dayCount = new Array(31).fill(0)   // 0~30 天逐日

  for (const r of data) {
    if (legacy.has(r.iccid)) continue
    const d = (new Date(r.plan_start_time).getTime() - new Date(r.order_time).getTime()) / 86400000  // 天
    daysArr.push(d)
    if (r.order_time_source === 'shopee') srcCount.shopee++
    else if (r.order_time_source === 'bc') srcCount.bc++
    const wholeDays = Math.floor(d)
    if (wholeDays >= 0 && wholeDays <= 30) dayCount[wholeDays]++
    rows.push({ iccid: r.iccid, sku_name: r.sku_name || '—', order_time: r.order_time.slice(0, 10), plan_start_time: r.plan_start_time.slice(0, 10), days: wholeDays, source: r.order_time_source })
    const b = d < 0 ? buckets[0] : wholeDays === 0 ? buckets[1] : wholeDays === 1 ? buckets[2] : wholeDays === 2 ? buckets[3]
      : wholeDays < 7 ? buckets[4] : wholeDays < 14 ? buckets[5] : wholeDays < 30 ? buckets[6]
      : wholeDays < 60 ? buckets[7] : wholeDays < 90 ? buckets[8] : buckets[9]
    b.plans++
  }

  const valid = daysArr.filter(x => x >= 0).sort((a, b) => a - b)
  const avg = valid.length ? valid.reduce((s, x) => s + x, 0) / valid.length : 0
  const median = valid.length ? valid[Math.floor(valid.length / 2)] : 0
  const matched = data.length
  rows.sort((a, b) => b.days - a.days)

  return NextResponse.json({
    matched,
    src_count: srcCount,
    avg_days: Math.round(avg * 10) / 10,
    median_days: Math.round(median * 10) / 10,
    buckets: buckets.map(b => ({ ...b, pct: matched > 0 ? Math.round((b.plans / matched) * 1000) / 10 : 0 })),
    by_day: dayCount.map((plans, day) => ({ day, plans, pct: matched > 0 ? Math.round((plans / matched) * 1000) / 10 : 0 })),
    longest: rows.slice(0, 50),
  })
}
