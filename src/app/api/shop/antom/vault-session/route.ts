import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { antomRequest, getAntomConfig } from '@/lib/antom'

// POST — 建立 Antom 綁卡（vaulting）session，回傳 vaultingSessionData 供前端 SDK 掛載
// 需登入會員；記下 vaultingRequestId ↔ member，之後 notifyVaulting 回填卡片
export async function POST(request: Request) {
  const serverSupabase = await createClient()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const cfg = await getAntomConfig()
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
  // vaultingRequestId：可追、可對照會員（前段放 member 短碼避免碰撞）
  const vaultingRequestId = `VAULT${user.id.replace(/-/g, '').slice(0, 8)}${Date.now().toString().slice(-10)}`
  // 綁卡完成後導回頁（結帳流程帶回 checkout 續跑扣款；預設回卡片管理）
  const rawPath = typeof body.redirect_path === 'string' && body.redirect_path.startsWith('/') ? body.redirect_path : '/account/cards?vaulted=1'
  const sep = rawPath.includes('?') ? '&' : '?'
  const redirectUrl = `${origin}${rawPath}${sep}rid=${encodeURIComponent(vaultingRequestId)}`

  const supabase = createAdminClient()
  await supabase.from('antom_vaulting_requests').insert({
    vaulting_request_id: vaultingRequestId, member_id: user.id, status: 'pending',
  })

  const payload: Record<string, unknown> = {
    paymentMethodType: 'CARD',
    vaultingRequestId,
    vaultingNotificationUrl: `${origin}/api/webhooks/antom/vaulting`,
    redirectUrl,
    merchantRegion: cfg.merchantRegion,
  }

  try {
    const res = await antomRequest('/ams/api/v1/vaults/createVaultingSession', payload)
    const result = (res.data.result || {}) as Record<string, string>
    const vaultingSessionData = res.data.vaultingSessionData as string
    if (vaultingSessionData) {
      return NextResponse.json({
        ok: true,
        vaultingSessionData,
        vaultingRequestId,
        environment: cfg.env === 'production' ? 'prod' : 'sandbox',
      })
    }
    return NextResponse.json({ error: result.resultMessage || '建立綁卡工作階段失敗', raw: res.data }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
