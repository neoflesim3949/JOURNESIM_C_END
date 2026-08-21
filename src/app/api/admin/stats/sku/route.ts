import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLegacyIccids } from '@/lib/legacy-cards'

// SKU 使用統計：card_plans 依 SKU 彙總（方案數 / 卡數 / 份數合計）
// GET ?from=&to=（啟用時間區間）&plan_status=&plan_type=
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const planStatus = sp.get('plan_status') || ''
  const planType = sp.get('plan_type') || ''
  const supabase = createAdminClient()
  const legacy = sp.get('exclude_legacy') === '1' ? await getLegacyIccids(supabase) : new Set<string>()

  const agg = new Map<string, { sku_name: string; plan_type: string | null; plans: number; cards: Set<string>; copies: number; copiesDist: Map<string, number> }>()
  let totalPlans = 0
  for (let fromIdx = 0; ; fromIdx += 1000) {
    let q = supabase.from('card_plans')
      .select('sku_id, sku_name, plan_type, copies, iccid, plan_start_time, plan_status')
    if (from) q = q.gte('plan_start_time', from)
    if (to) q = q.lte('plan_start_time', to + 'T23:59:59')
    if (planStatus) q = q.eq('plan_status', planStatus)
    if (planType) q = q.eq('plan_type', planType)
    const { data } = await q.range(fromIdx, fromIdx + 999)
    if (!data || data.length === 0) break
    for (const p of data) {
      if (legacy.has(p.iccid)) continue
      const key = p.sku_id || p.sku_name || '未知'
      let a = agg.get(key)
      if (!a) { a = { sku_name: p.sku_name || key, plan_type: p.plan_type, plans: 0, cards: new Set(), copies: 0, copiesDist: new Map() }; agg.set(key, a) }
      a.plans++
      if (p.iccid) a.cards.add(p.iccid)
      a.copies += Number(p.copies) || 0
      const cv = p.copies != null && p.copies !== '' ? String(p.copies) : '—'   // 份數分佈
      a.copiesDist.set(cv, (a.copiesDist.get(cv) || 0) + 1)
      totalPlans++
    }
    if (data.length < 1000) break
  }

  const PLAN_TYPE: Record<string, string> = { '0': '總量型', '1': '單日型' }
  const rows = [...agg].map(([sku_id, a]) => ({
    sku_id,
    sku_name: a.sku_name,
    plan_type: a.plan_type,
    plan_type_label: a.plan_type != null ? (PLAN_TYPE[a.plan_type] || a.plan_type) : null,
    plans: a.plans,
    cards: a.cards.size,
    copies: a.copies,
    share: totalPlans > 0 ? Math.round((a.plans / totalPlans) * 1000) / 10 : 0,
    // 份數分佈：[{ copies, count }]，依份數（數值）排序
    copies_dist: [...a.copiesDist].map(([copies, count]) => ({ copies, count }))
      .sort((m, n) => (Number(m.copies) || 0) - (Number(n.copies) || 0)),
  })).sort((x, y) => y.plans - x.plans)

  return NextResponse.json({ rows, total_plans: totalPlans, total_skus: rows.length })
}
