import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkTravelAuth, hashPassword, genPassword } from '@/lib/travel-auth'

// GET — 此旅行社人員列表
export async function GET() {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('travel_staff')
    .select('id, username, display_name, role, active, created_at, last_login_at')
    .eq('agency_id', sess.agency_id).order('created_at')
  return NextResponse.json({ staff: data || [], role: sess.role })
}

// POST — 新增人員（僅管理者）
export async function POST(request: Request) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (sess.role !== 'manager') return NextResponse.json({ error: '僅管理者可新增人員' }, { status: 403 })
  const b = await request.json().catch(() => ({}))
  const username = String(b.username || '').trim()
  const displayName = String(b.display_name || '').trim()
  if (!username || !displayName) return NextResponse.json({ error: '請填寫姓名與帳號' }, { status: 400 })
  const role = b.role === 'manager' ? 'manager' : 'sales'
  const supabase = createAdminClient()

  const { data: exists } = await supabase.from('travel_staff').select('id').eq('username', username).maybeSingle()
  if (exists) return NextResponse.json({ error: '此帳號已存在' }, { status: 400 })

  const password = genPassword()
  const { error } = await supabase.from('travel_staff').insert({
    agency_id: sess.agency_id, username, password_hash: hashPassword(password),
    display_name: displayName, role, active: true,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ username, password })
}

// PATCH — 停用/啟用（僅管理者）
export async function PATCH(request: Request) {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (sess.role !== 'manager') return NextResponse.json({ error: '僅管理者可異動人員' }, { status: 403 })
  const b = await request.json().catch(() => ({}))
  if (!b.staff_id || typeof b.active !== 'boolean') return NextResponse.json({ error: '參數不足' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('travel_staff').update({ active: b.active }).eq('id', b.staff_id).eq('agency_id', sess.agency_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
