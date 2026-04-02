import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
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

  // 取得 email
  let lineEmail = ''
  if (tokenData.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString())
      if (payload.email) lineEmail = payload.email
    } catch {}
  }

  const supabase = createAdminClient()

  // 查詢此 LINE ID 是否已綁定過帳號
  const { data: existingMember } = await supabase
    .from('members')
    .select('id, email')
    .eq('line_user_id', profile.userId)
    .single()

  if (existingMember) {
    // 已綁定 → 更新頭像/名稱，直接登入
    await supabase.from('members').update({
      display_name: profile.displayName || undefined,
      avatar_url: profile.pictureUrl || undefined,
    }).eq('id', existingMember.id)

    // 用 magic link 登入
    const { data: link } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: existingMember.email,
    })

    if (link?.properties?.hashed_token) {
      return NextResponse.redirect(
        `${origin}/auth/line/verify?token=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`
      )
    }

    return NextResponse.redirect(`${origin}${next}`)
  }

  // 未綁定 → 暫存資料，跳轉到綁定頁面
  const socialData = {
    provider: 'line',
    provider_id: profile.userId,
    display_name: profile.displayName || '',
    avatar_url: profile.pictureUrl || '',
    email: lineEmail,
    next,
  }

  const cookieStore = await cookies()
  cookieStore.set('social_auth_data', JSON.stringify(socialData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })

  return NextResponse.redirect(`${origin}/auth/bind`)
}
