import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 團員確認方案選擇（公開，憑 token）
// body: { plan_id, email?, is_member?, coupon? }
// 金流：目前為假流程（直接標記付款）；正式版接 TapPay 後改為付款成功回呼才更新。
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createAdminClient()
  const b = await request.json().catch(() => ({}))

  const { data: member } = await supabase.from('tour_members').select('id, group_id').eq('token', token).maybeSingle()
  if (!member) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: group } = await supabase.from('tour_groups')
    .select('base_is_free, base_sim_plan_id, base_esim_plan_id').eq('id', member.group_id).single()
  if (!group) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: plans } = await supabase.from('tour_group_plans')
    .select('id, plan_type, agency_price, our_cost').eq('group_id', member.group_id)
  const chosen = (plans || []).find(p => p.id === b.plan_id)
  if (!chosen) return NextResponse.json({ error: '方案不存在' }, { status: 400 })

  const num = (v: unknown) => (v == null ? 0 : Number(v))
  const baseId = chosen.plan_type === 'sim' ? group.base_sim_plan_id : group.base_esim_plan_id
  const base = (plans || []).find(p => p.id === baseId)

  // 線上金額（依金流公式）
  let baseCharge: number, ourCostDelta: number
  if (group.base_is_free) {
    baseCharge = Math.max(num(chosen.agency_price) - num(base?.agency_price), 0)   // 減少不退
    ourCostDelta = Math.max(num(chosen.our_cost) - num(base?.our_cost), 0)
  } else {
    baseCharge = num(chosen.agency_price)
    ourCostDelta = num(chosen.our_cost)
  }
  const discount = b.coupon ? 50 : 0                                               // 假優惠券
  const onlineCharge = Math.max(baseCharge - discount, 0)
  const agencyProfit = Math.max(baseCharge - ourCostDelta, 0)
  const payStatus = onlineCharge === 0 ? 'free' : 'paid'                            // 假付款

  const { error } = await supabase.from('tour_members').update({
    chosen_plan_id: chosen.id,
    online_charge: onlineCharge,
    our_cost_snapshot: num(chosen.our_cost),
    agency_profit: agencyProfit,
    pay_status: payStatus,
    paid_at: payStatus === 'paid' ? new Date().toISOString() : null,
    email: b.email || null,
    is_member: !!b.is_member,
    coupon_code: b.coupon || null,
    discount,
  }).eq('id', member.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, online_charge: onlineCharge, pay_status: payStatus })
}
