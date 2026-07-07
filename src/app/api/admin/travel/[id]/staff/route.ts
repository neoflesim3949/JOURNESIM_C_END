import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPassword, genPassword } from '@/lib/travel-auth'

// POST — FLESIM 管理端替旅行社建立人員（回一次性初始密碼）
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const b = await request.json().catch(() => ({}))
  const username = String(b.username || '').trim()
  const displayName = String(b.display_name || '').trim()
  if (!username || !displayName) return NextResponse.json({ error: '請填寫姓名與帳號' }, { status: 400 })
  const role = b.role === 'sales' ? 'sales' : 'manager'
  const supabase = createAdminClient()

  const { data: exists } = await supabase.from('travel_staff').select('id').eq('username', username).maybeSingle()
  if (exists) return NextResponse.json({ error: '此帳號已存在' }, { status: 400 })

  const password = genPassword()
  const { error } = await supabase.from('travel_staff').insert({
    agency_id: id, username, password_hash: hashPassword(password), display_name: displayName, role, active: true,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ username, password })
}

// PATCH — 重設某人員密碼 body: { staff_id }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const b = await request.json().catch(() => ({}))
  if (!b.staff_id) return NextResponse.json({ error: '缺少 staff_id' }, { status: 400 })
  const supabase = createAdminClient()
  const { data: staff } = await supabase.from('travel_staff').select('username').eq('id', b.staff_id).eq('agency_id', id).single()
  if (!staff) return NextResponse.json({ error: '找不到人員' }, { status: 404 })
  const password = genPassword()
  const { error } = await supabase.from('travel_staff').update({ password_hash: hashPassword(password) }).eq('id', b.staff_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ username: staff.username, password })
}
