import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkTravelAuth } from '@/lib/travel-auth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ownGroup(supabase: any, id: string, agencyId: string): Promise<boolean> {
  const { data } = await supabase.from('tour_groups').select('agency_id').eq('id', id).single()
  return !!data && data.agency_id === agencyId
}

// POST — 加入方案（帶入 catalog 的快照）
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  if (!(await ownGroup(supabase, id, sess.agency_id))) return NextResponse.json({ error: '找不到團' }, { status: 404 })

  const b = await request.json().catch(() => ({}))
  if (!b.name || !b.plan_type) return NextResponse.json({ error: '方案資料不足' }, { status: 400 })
  const suggested = b.suggested_price != null ? Number(b.suggested_price) : null

  const { count } = await supabase.from('tour_group_plans').select('id', { count: 'exact', head: true }).eq('group_id', id)
  const { data, error } = await supabase.from('tour_group_plans').insert({
    group_id: id,
    package_id: b.package_id || null,
    package_plan_id: b.package_plan_id || null,
    bc_sku_id: b.bc_sku_id || null,
    copies: b.copies != null ? String(b.copies) : null,
    name: b.name,
    plan_type: b.plan_type === 'sim' ? 'sim' : 'esim',
    suggested_price: suggested,
    agency_price: suggested,             // 預設等於建議售價
    our_cost: b.our_cost != null ? Number(b.our_cost) : 0,
    sort_index: count || 0,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}

// PATCH — 設定旅行社售價（擋 > 建議售價）
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  if (!(await ownGroup(supabase, id, sess.agency_id))) return NextResponse.json({ error: '找不到團' }, { status: 404 })

  const b = await request.json().catch(() => ({}))
  if (!b.plan_id) return NextResponse.json({ error: '缺少 plan_id' }, { status: 400 })
  const { data: plan } = await supabase.from('tour_group_plans').select('suggested_price').eq('id', b.plan_id).eq('group_id', id).single()
  if (!plan) return NextResponse.json({ error: '找不到方案' }, { status: 404 })

  let price = Number(b.agency_price)
  if (isNaN(price) || price < 0) price = 0
  if (plan.suggested_price != null && price > Number(plan.suggested_price)) {
    return NextResponse.json({ error: '旅行社售價不得高於建議售價' }, { status: 400 })
  }
  const { error } = await supabase.from('tour_group_plans').update({ agency_price: price }).eq('id', b.plan_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — 移除方案（同步清掉基礎方案指向）
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  if (!(await ownGroup(supabase, id, sess.agency_id))) return NextResponse.json({ error: '找不到團' }, { status: 404 })

  const b = await request.json().catch(() => ({}))
  if (!b.plan_id) return NextResponse.json({ error: '缺少 plan_id' }, { status: 400 })
  await supabase.from('tour_group_plans').delete().eq('id', b.plan_id).eq('group_id', id)
  // 若基礎方案指向被刪的方案 → 清空
  const { data: g } = await supabase.from('tour_groups').select('base_sim_plan_id, base_esim_plan_id').eq('id', id).single()
  const upd: Record<string, unknown> = {}
  if (g?.base_sim_plan_id === b.plan_id) upd.base_sim_plan_id = null
  if (g?.base_esim_plan_id === b.plan_id) upd.base_esim_plan_id = null
  if (Object.keys(upd).length) await supabase.from('tour_groups').update(upd).eq('id', id)
  return NextResponse.json({ ok: true })
}
