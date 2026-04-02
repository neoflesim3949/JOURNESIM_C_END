import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'

// LINE OAuth 授權跳轉
export async function GET(request: Request) {
  const settings = await getSettings()
  const channelId = settings.get('line_channel_id')

  if (!channelId) {
    return NextResponse.json({ error: 'LINE Login 尚未設定' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const next = searchParams.get('next') || '/account'

  // 用 request URL 推導 callback URL
  const origin = new URL(request.url).origin
  const redirectUri = `${origin}/auth/line/callback`

  const state = Buffer.from(JSON.stringify({ next })).toString('base64url')

  // bot_prompt: normal=顯示加好友勾選框, aggressive=強制顯示, off=關閉
  // 需在 LINE Developers Console 將 LINE Login channel 連結到官方帳號
  const botPrompt = settings.get('line_bot_prompt') || 'normal'

  const authUrl = new URL('https://access.line.me/oauth2/v2.1/authorize')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', channelId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('scope', 'openid profile email')

  // 加好友功能（需要 LINE Login channel 連結到官方帳號）
  if (botPrompt && botPrompt !== 'off') {
    authUrl.searchParams.set('bot_prompt', botPrompt)
  }

  return NextResponse.redirect(authUrl.toString())
}
