import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkTravelAuth } from '@/lib/travel-auth'

function memberToken(): string { return 'tk_' + randomBytes(9).toString('base64url') }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getGroup(supabase: any, id: string, agencyId: string) {
  const { data } = await supabase.from('tour_groups').select('id, agency_id, base_is_free, base_sim_plan_id, base_esim_plan_id').eq('id', id).single()
  return data && data.agency_id === agencyId ? data : null
}

// POST — 新增團員（產生專屬 token）
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  const group = await getGroup(supabase, id, sess.agency_id)
  if (!group) return NextResponse.json({ error: '找不到團' }, { status: 404 })

  const b = await request.json().catch(() => ({}))
  const name = String(b.name || '').trim()
  if (!name) return NextResponse.json({ error: '請輸入姓名' }, { status: 400 })

  const { data, error } = await supabase.from('tour_members').insert({
    group_id: id, name, contact: b.contact || null, token: memberToken(),
    pay_status: group.base_is_free ? 'free' : 'unpaid',
  }).select('id, token').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id, token: data.token })
}

// PATCH — 發卡 / 取消發卡
// body: { member_id, issue: true, iccid? }  |  { member_id, issue: false }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  const group = await getGroup(supabase, id, sess.agency_id)
  if (!group) return NextResponse.json({ error: '找不到團' }, { status: 404 })

  const b = await request.json().catch(() => ({}))
  if (!b.member_id) return NextResponse.json({ error: '缺少 member_id' }, { status: 400 })
  const { data: member } = await supabase.from('tour_members').select('*').eq('id', b.member_id).eq('group_id', id).single()
  if (!member) return NextResponse.json({ error: '找不到團員' }, { status: 404 })

  // 取消發卡
  if (b.issue === false) {
    await supabase.from('tour_members').update({ issued: false, iccid: null, esim_qr: null, issued_by: null, issued_at: null }).eq('id', member.id)
    return NextResponse.json({ ok: true })
  }

  // 發卡：決定方案型別（所選 → 基礎 SIM → 基礎 eSIM）
  const planId = member.chosen_plan_id || group.base_sim_plan_id || group.base_esim_plan_id
  let planType: 'sim' | 'esim' = 'sim'
  if (planId) {
    const { data: plan } = await supabase.from('tour_group_plans').select('plan_type').eq('id', planId).single()
    if (plan?.plan_type === 'esim') planType = 'esim'
  }

  if (planType === 'esim') {
    // 產生 eSIM QR（正式版走 BC F040）
    const qr = 'LPA:1$flesim.bc$' + String(member.token).replace('tk_', '').toUpperCase()
    await supabase.from('tour_members').update({ issued: true, esim_qr: qr, iccid: null, issued_by: sess.staff_id, issued_at: new Date().toISOString() }).eq('id', member.id)
    return NextResponse.json({ ok: true, esim_qr: qr })
  }

  // 實體 SIM：卡號必須在此旅行社庫存、且未被其他團員使用
  const iccid = String(b.iccid || '').trim()
  if (!iccid) return NextResponse.json({ error: '請輸入或掃描卡號' }, { status: 400 })
  const { data: card } = await supabase.from('manual_iccids').select('iccid, agency_id').eq('iccid', iccid).maybeSingle()
  if (!card || card.agency_id !== sess.agency_id) return NextResponse.json({ error: '此卡不在貴社庫存內' }, { status: 400 })
  const { data: used } = await supabase.from('tour_members').select('id').eq('iccid', iccid).eq('issued', true).neq('id', member.id).maybeSingle()
  if (used) return NextResponse.json({ error: '此卡號已被使用' }, { status: 400 })

  await supabase.from('tour_members').update({ issued: true, iccid, esim_qr: null, issued_by: sess.staff_id, issued_at: new Date().toISOString() }).eq('id', member.id)
  return NextResponse.json({ ok: true })
}

// DELETE — 移除團員
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  if (!(await getGroup(supabase, id, sess.agency_id))) return NextResponse.json({ error: '找不到團' }, { status: 404 })
  const b = await request.json().catch(() => ({}))
  if (!b.member_id) return NextResponse.json({ error: '缺少 member_id' }, { status: 400 })
  await supabase.from('tour_members').delete().eq('id', b.member_id).eq('group_id', id)
  return NextResponse.json({ ok: true })
}
