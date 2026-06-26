import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReferralCode } from '@/lib/referral'

// POST — 後台新增會員（建立 Email 登入帳號 + members 列）
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const display_name = String(body.display_name || '').trim() || null

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: '請輸入有效 Email' }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: '密碼至少 6 碼' }, { status: 400 })

  const supabase = createAdminClient()

  // 建立 Auth 帳號（直接設為已驗證，可立即用 Email+密碼登入）
  const { data: created, error: cErr } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name },
  })
  if (cErr || !created?.user) {
    const msg = cErr?.message || '建立失敗'
    return NextResponse.json({ error: /already|exist|registered/i.test(msg) ? '此 Email 已註冊' : msg }, { status: 400 })
  }

  // 建立 members 列
  const { error: mErr } = await supabase.from('members').upsert({
    id: created.user.id, email, display_name, auth_provider: 'email', referral_code: generateReferralCode(),
  }, { onConflict: 'id' })
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: created.user.id })
}
