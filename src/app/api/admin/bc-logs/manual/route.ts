import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { checkAdminAuth } from '@/lib/admin'
import { POST as bcWebhookPost } from '@/app/api/webhooks/billionconnect/route'

// POST { payload } — 手動貼入 BC callback 內容（{"tradeType":"N009","tradeData":{...}}），
// 由正式 webhook 處理邏輯解析執行。適用情境：callback 已改指向其他系統，
// 需要把該處收到的通知複製過來補跑（N009 補 QR、N002/N003 補啟用到期…）。
// 作法：自算 MD5 簽章後直接呼叫 webhook handler，與真實回呼走完全相同的程式路徑（含寫入 bc_api_logs）。
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  let payload: unknown = body.payload
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload) } catch {
      return NextResponse.json({ error: 'payload 不是合法 JSON' }, { status: 400 })
    }
  }
  const p = payload as { tradeType?: string; tradeData?: unknown } | null
  if (!p || typeof p !== 'object' || !p.tradeType) {
    return NextResponse.json({ error: 'payload 需為完整 callback 內容（至少含 tradeType）' }, { status: 400 })
  }
  if (p.tradeData === undefined) {
    return NextResponse.json({ error: 'payload 缺少 tradeData' }, { status: 400 })
  }

  const raw = JSON.stringify(p)
  const sign = crypto.createHash('md5')
    .update((process.env.BILLIONCONNECT_APP_SECRET || '') + raw, 'utf8').digest('hex')

  try {
    const res = await bcWebhookPost(new Request('http://internal/api/webhooks/billionconnect', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sign-value': sign },
      body: raw,
    }))
    const data = await res.json().catch(() => ({}))
    const ok = res.ok && data?.tradeCode === '1000'
    return NextResponse.json({ ok, tradeType: p.tradeType, result: data }, { status: ok ? 200 : 502 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
