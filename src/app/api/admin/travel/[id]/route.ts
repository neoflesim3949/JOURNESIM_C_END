import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 旅行社明細（基本資料 + 人員 + 卡片數）
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: agency, error } = await supabase.from('travel_agencies').select('*').eq('id', id).single()
  if (error || !agency) return NextResponse.json({ error: '找不到旅行社' }, { status: 404 })

  const { data: staff } = await supabase.from('travel_staff')
    .select('id, username, display_name, role, active, created_at, last_login_at')
    .eq('agency_id', id).order('created_at')

  const { count: groupCount } = await supabase.from('tour_groups')
    .select('id', { count: 'exact', head: true }).eq('agency_id', id)

  let cardCount = 0
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('manual_iccids').select('iccid').eq('agency_id', id).range(from, from + 999)
    if (!data || data.length === 0) break
    cardCount += data.length
    if (data.length < 1000) break
  }

  // 結算：金流（Phase 2）完成後由訂單彙總，暫回空陣列
  return NextResponse.json({ agency, staff: staff || [], group_count: groupCount || 0, card_count: cardCount, settlements: [] })
}

// PATCH — 更新旅行社狀態 / 人員啟用停用
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const supabase = createAdminClient()

  if (body.status === 'active' || body.status === 'disabled') {
    const { error } = await supabase.from('travel_agencies').update({ status: body.status }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (body.staff_id && typeof body.active === 'boolean') {
    const { error } = await supabase.from('travel_staff').update({ active: body.active }).eq('id', body.staff_id).eq('agency_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
