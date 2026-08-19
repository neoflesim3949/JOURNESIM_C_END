import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrderInfo } from '@/lib/billionconnect'

// 一次性回填：對「order_time 仍為空、且有 channel_order_id」的方案打 F011，補 BC 建單時間
//   蝦皮來源請先跑 migration 089（純 DB，免打 BC）
// POST — 執行回填；回傳處理統計
function toPlus8Naive(input: string | null | undefined): string | null {
  if (!input) return null
  const s = String(input).trim()
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const utc8 = new Date(new Date(s).getTime() + 8 * 3600000)
    if (isNaN(utc8.getTime())) return null
    return utc8.toISOString().replace('T', ' ').slice(0, 19)
  }
  return s.replace('T', ' ').slice(0, 19)
}

export async function POST() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  // 撈仍缺 order_time 的方案 → 收集 distinct channel_order_id
  const coids = new Set<string>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('card_plans')
      .select('channel_order_id')
      .is('order_time', null).not('channel_order_id', 'is', null).range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) if (r.channel_order_id) coids.add(r.channel_order_id as string)
    if (data.length < 1000) break
  }

  const list = [...coids]
  let fetched = 0, filled = 0, failed = 0, updatedRows = 0
  const concurrency = 5
  let i = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < list.length) {
      const coid = list[i++]
      try {
        const info = await getOrderInfo({ channelOrderId: coid })
        fetched++
        const t = toPlus8Naive(info?.createTime)
        if (!t) { failed++; continue }
        const { data, error } = await supabase.from('card_plans')
          .update({ order_time: t, order_time_source: 'bc' })
          .eq('channel_order_id', coid).is('order_time', null).select('id')
        if (error) { failed++; continue }
        filled++
        updatedRows += (data?.length || 0)
      } catch {
        failed++
      }
    }
  }))

  return NextResponse.json({ distinct_orders: list.length, fetched, filled, failed, updated_rows: updatedRows })
}
