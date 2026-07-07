import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkTravelAuth } from '@/lib/travel-auth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ownedGroup(supabase: any, id: string, agencyId: string) {
  const { data } = await supabase.from('tour_groups').select('id, agency_id').eq('id', id).single()
  return data && data.agency_id === agencyId ? data : null
}

// GET — 團明細（團 + 可選方案 + 團員）
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: group } = await supabase.from('tour_groups').select('*').eq('id', id).single()
  if (!group || group.agency_id !== sess.agency_id) return NextResponse.json({ error: '找不到團' }, { status: 404 })

  const { data: plans } = await supabase.from('tour_group_plans').select('*').eq('group_id', id).order('sort_index')
  const { data: members } = await supabase.from('tour_members').select('*').eq('group_id', id).order('created_at')

  return NextResponse.json({ group, plans: plans || [], members: members || [] })
}

// PATCH — 更新團資訊 / 基礎方案 / 途經國家
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  if (!(await ownedGroup(supabase, id, sess.agency_id))) return NextResponse.json({ error: '找不到團' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  for (const k of ['name', 'code', 'depart_date', 'return_date', 'base_is_free', 'base_sim_plan_id', 'base_esim_plan_id']) {
    if (body[k] !== undefined) updates[k] = body[k] === '' ? null : body[k]
  }
  if (Array.isArray(body.countries)) updates.countries = body.countries

  if (Object.keys(updates).length) {
    const { error } = await supabase.from('tour_groups').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE — 刪除團
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  if (!(await ownedGroup(supabase, id, sess.agency_id))) return NextResponse.json({ error: '找不到團' }, { status: 404 })
  await supabase.from('tour_groups').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
