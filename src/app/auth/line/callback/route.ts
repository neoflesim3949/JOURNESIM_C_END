import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSettings } from '@/lib/settings'

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

  // 暫存到 cookie，跳轉到綁定頁面
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
