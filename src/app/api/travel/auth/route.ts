import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyPassword, genSessionToken, sessionExpiry, TRAVEL_COOKIE } from '@/lib/travel-auth'

// POST — 旅行社人員登入
export async function POST(request: Request) {
  const { username, password } = await request.json().catch(() => ({}))
  const u = String(username || '').trim()
  if (!u || !password) return NextResponse.json({ error: '請輸入帳號與密碼' }, { status: 400 })
  const supabase = createAdminClient()

  const { data: staff } = await supabase.from('travel_staff')
    .select('id, agency_id, password_hash, active').eq('username', u).maybeSingle()
  if (!staff || !staff.active || !verifyPassword(String(password), staff.password_hash)) {
    return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 })
  }
  const { data: agency } = await supabase.from('travel_agencies').select('status').eq('id', staff.agency_id).single()
  if (!agency || agency.status !== 'active') return NextResponse.json({ error: '此旅行社已停用' }, { status: 403 })

  const token = genSessionToken()
  await supabase.from('travel_sessions').insert({ token, staff_id: staff.id, agency_id: staff.agency_id, expires_at: sessionExpiry() })
  await supabase.from('travel_staff').update({ last_login_at: new Date().toISOString() }).eq('id', staff.id)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(TRAVEL_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 3600, path: '/',
  })
  return res
}

// DELETE — 登出
export async function DELETE() {
  const store = await cookies()
  const token = store.get(TRAVEL_COOKIE)?.value
  if (token) {
    const supabase = createAdminClient()
    await supabase.from('travel_sessions').delete().eq('token', token)
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(TRAVEL_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
