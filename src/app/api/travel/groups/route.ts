import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkTravelAuth } from '@/lib/travel-auth'

// GET — 此旅行社的團列表（含團員/付款/發放進度）
export async function GET() {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const { data: groups, error } = await supabase.from('tour_groups')
    .select('id, name, code, depart_date, return_date, countries, base_is_free, base_sim_plan_id, base_esim_plan_id')
    .eq('agency_id', sess.agency_id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (groups || []).map(g => g.id)
  const memberCount = new Map<string, number>(), paidCount = new Map<string, number>(), issuedCount = new Map<string, number>()
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 100) {
      const slice = ids.slice(i, i + 100)
      const { data: ms } = await supabase.from('tour_members').select('group_id, pay_status, issued').in('group_id', slice)
      for (const m of ms || []) {
        memberCount.set(m.group_id, (memberCount.get(m.group_id) || 0) + 1)
        if (m.pay_status !== 'unpaid') paidCount.set(m.group_id, (paidCount.get(m.group_id) || 0) + 1)
        if (m.issued) issuedCount.set(m.group_id, (issuedCount.get(m.group_id) || 0) + 1)
      }
    }
  }

  const result = (groups || []).map(g => ({
    ...g,
    member_count: memberCount.get(g.id) || 0,
    paid_count: paidCount.get(g.id) || 0,
    issued_count: issuedCount.get(g.id) || 0,
  }))
  return NextResponse.json({ groups: result })
}

// POST — 建團
export async function POST(request: Request) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: '請輸入團名' }, { status: 400 })
  const supabase = createAdminClient()

  const { data, error } = await supabase.from('tour_groups').insert({
    agency_id: sess.agency_id, name,
    code: body.code || null,
    depart_date: body.depart_date || null,
    return_date: body.return_date || null,
    countries: [],
    base_is_free: !!body.base_is_free,
    created_by: sess.staff_id,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
