import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(`${origin}/auth/login?error=line_auth_failed`)
  }

  // 解析 state
  let next = '/account'
  try {
    const parsed = JSON.parse(Buffer.from(state || '', 'base64url').toString())
    next = parsed.next || '/account'
  } catch {}

  const settings = await getSettings()
  const channelId = settings.get('line_channel_id') || ''
  const channelSecret = settings.get('line_channel_secret') || ''
  const redirectUri = `${origin}/auth/line/callback`

  // 用 code 換 access_token
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: channelId,
      client_secret: channelSecret,
    }),
  })

  const tokenData = await tokenRes.json()

  if (!tokenData.access_token) {
    console.error('LINE token exchange failed:', tokenData)
    return NextResponse.redirect(`${origin}/auth/login?error=line_token_failed`)
  }

  // 取得用戶資訊
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })

  const profile = await profileRes.json()

  if (!profile.userId) {
    return NextResponse.redirect(`${origin}/auth/login?error=line_profile_failed`)
  }

  // 在 Supabase 建立或更新會員
  const supabase = createAdminClient()

  // 用 LINE userId 查找會員
  const lineEmail = `line_${profile.userId}@line.flesim.com` // LINE 可能沒有 email，用假的

  // 取得 email（如果 LINE 有提供）
  let userEmail = lineEmail
  if (tokenData.id_token) {
    try {
      // 解碼 JWT 取得 email
      const payload = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString())
      if (payload.email) userEmail = payload.email
    } catch {}
  }

  // 查找現有會員
  const { data: existingMember } = await supabase
    .from('members')
    .select('id')
    .eq('email', userEmail)
    .single()

  let memberId: string

  if (existingMember) {
    memberId = existingMember.id
    // 更新名稱和頭像
    await supabase.from('members').update({
      display_name: profile.displayName || null,
      avatar_url: profile.pictureUrl || null,
    }).eq('id', memberId)
  } else {
    // 建立新會員（用 Supabase Auth 建立用戶）
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: userEmail,
      email_confirm: true,
      user_metadata: {
        display_name: profile.displayName,
        avatar_url: profile.pictureUrl,
        line_user_id: profile.userId,
      },
    })

    if (authError || !authUser.user) {
      console.error('Create user failed:', authError)
      return NextResponse.redirect(`${origin}/auth/login?error=create_user_failed`)
    }

    memberId = authUser.user.id

    // 建立 members 記錄
    await supabase.from('members').upsert({
      id: memberId,
      email: userEmail,
      display_name: profile.displayName || null,
      avatar_url: profile.pictureUrl || null,
      auth_provider: 'line',
    }, { onConflict: 'id' })
  }

  // 產生 Supabase session（用 magic link 方式登入）
  const { data: magicLink } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
  })

  if (magicLink?.properties?.hashed_token) {
    // 直接用 token 登入
    const verifyUrl = `${origin}/auth/line/verify?token=${magicLink.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`
    return NextResponse.redirect(verifyUrl)
  }

  // Fallback: 直接跳轉到首頁
  return NextResponse.redirect(`${origin}${next}`)
}
