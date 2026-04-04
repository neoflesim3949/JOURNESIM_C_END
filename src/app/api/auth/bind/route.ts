import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReferralCode, bindReferrer } from '@/lib/referral'

// GET — 取得暫存的第三方登入資料
export async function GET() {
  const cookieStore = await cookies()
  const raw = cookieStore.get('social_auth_data')?.value
  if (!raw) return NextResponse.json({ error: '登入資料已過期' }, { status: 400 })

  try {
    const data = JSON.parse(raw)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: '資料格式錯誤' }, { status: 400 })
  }
}

// POST — 檢查 Email 是否存在
export async function POST(request: Request) {
  const { email, action } = await request.json()
  const cookieStore = await cookies()
  const raw = cookieStore.get('social_auth_data')?.value

  if (!raw) return NextResponse.json({ error: '登入資料已過期，請重新登入' }, { status: 400 })

  const socialData = JSON.parse(raw)
  const supabase = createAdminClient()

  if (action === 'check') {
    // 檢查 email 是否已存在
    const { data: existing } = await supabase
      .from('members')
      .select('id, email, display_name, auth_provider')
      .eq('email', email)
      .single()

    return NextResponse.json({ exists: !!existing, member: existing || null })
  }

  if (action === 'bind') {
    // 綁定到現有帳號
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('email', email)
      .single()

    if (!existing) return NextResponse.json({ error: '帳號不存在' }, { status: 404 })

    // 更新現有帳號的第三方資訊
    const updateData: Record<string, string> = {
      auth_provider: socialData.provider,
    }
    if (socialData.avatar_url) updateData.avatar_url = socialData.avatar_url
    if (socialData.provider === 'line') updateData.line_user_id = socialData.provider_id
    if (socialData.provider === 'google') updateData.google_user_id = socialData.provider_id
    if (socialData.provider === 'apple') updateData.apple_user_id = socialData.provider_id
    if (socialData.provider === 'facebook') updateData.facebook_user_id = socialData.provider_id

    await supabase.from('members').update(updateData).eq('id', existing.id)

    // 用 magic link 登入
    const { data: link } = await supabase.auth.admin.generateLink({ type: 'magiclink', email })

    cookieStore.delete('social_auth_data')

    return NextResponse.json({
      success: true,
      token: link?.properties?.hashed_token,
      next: socialData.next || '/account',
    })
  }

  if (action === 'create') {
    // 建立新帳號
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        display_name: socialData.display_name,
        avatar_url: socialData.avatar_url,
        [`${socialData.provider}_user_id`]: socialData.provider_id,
      },
    })

    if (authError) {
      // 如果 email 已被 auth 系統使用
      if (authError.message?.includes('already been registered')) {
        return NextResponse.json({ error: '此 Email 已被註冊，請選擇「綁定到現有帳號」' }, { status: 400 })
      }
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    if (!authUser.user) return NextResponse.json({ error: '建立帳號失敗' }, { status: 500 })

    // 建立 members 記錄
    const memberData: Record<string, unknown> = {
      id: authUser.user.id,
      email,
      display_name: socialData.display_name || null,
      avatar_url: socialData.avatar_url || null,
      auth_provider: socialData.provider,
      referral_code: generateReferralCode(), // 生成唯一推薦碼
    }
    if (socialData.provider === 'line') memberData.line_user_id = socialData.provider_id
    if (socialData.provider === 'google') memberData.google_user_id = socialData.provider_id
    if (socialData.provider === 'apple') memberData.apple_user_id = socialData.provider_id
    if (socialData.provider === 'facebook') memberData.facebook_user_id = socialData.provider_id

    await supabase.from('members').upsert(memberData, { onConflict: 'id' })

    // 處理推薦綁定
    const referralCode = cookieStore.get('flesim_ref')?.value
    if (referralCode) {
      await bindReferrer(supabase, authUser.user.id, referralCode)
      cookieStore.delete('flesim_ref') // 綁定後刪除推薦 Cookie
    }

    // 用 magic link 登入
    const { data: link } = await supabase.auth.admin.generateLink({ type: 'magiclink', email })

    cookieStore.delete('social_auth_data')

    return NextResponse.json({
      success: true,
      token: link?.properties?.hashed_token,
      next: socialData.next || '/account',
    })
  }

  return NextResponse.json({ error: '無效的操作' }, { status: 400 })
}
