import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 團員專屬連結（公開，憑 token）：回傳旅行社/團/方案/團員選擇
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createAdminClient()

  const { data: member } = await supabase.from('tour_members')
    .select('id, group_id, name, chosen_plan_id, online_charge, pay_status, email, is_member, issued, iccid, esim_qr')
    .eq('token', token).maybeSingle()
  if (!member) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: group } = await supabase.from('tour_groups')
    .select('id, agency_id, name, code, depart_date, return_date, base_is_free, base_sim_plan_id, base_esim_plan_id')
    .eq('id', member.group_id).single()
  if (!group) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: plans } = await supabase.from('tour_group_plans')
    .select('id, name, plan_type, agency_price').eq('group_id', group.id).order('sort_index')
  const { data: agency } = await supabase.from('travel_agencies').select('name, logo_url').eq('id', group.agency_id).single()

  return NextResponse.json({
    agency: { name: agency?.name || '旅行社', logo_url: agency?.logo_url || null },
    group: {
      name: group.name, code: group.code, depart_date: group.depart_date, return_date: group.return_date,
      base_is_free: group.base_is_free, base_sim_plan_id: group.base_sim_plan_id, base_esim_plan_id: group.base_esim_plan_id,
    },
    plans: plans || [],
    member: {
      name: member.name, chosen_plan_id: member.chosen_plan_id, online_charge: member.online_charge,
      pay_status: member.pay_status, email: member.email, is_member: member.is_member,
    },
  })
}
