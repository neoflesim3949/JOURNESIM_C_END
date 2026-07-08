import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { antomRequest, getAntomConfig, toAntomAmountValue } from '@/lib/antom'

// POST { order_number } — 建立 Antom 收銀台 session（多方式，前端 SDK 渲染）
// 用 createPaymentSession（不指定 paymentMethod）；詳見 docs/Antom_API.md
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const orderNumber = String(body.order_number || '').trim()
  if (!orderNumber) return NextResponse.json({ error: '缺少訂單編號' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: order } = await supabase.from('orders')
    .select('id, order_number, total_amount, email').eq('order_number', orderNumber).single()
  if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })

  const cfg = await getAntomConfig()
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
  const value = toAntomAmountValue(Number(order.total_amount), cfg.paymentCurrency)

  const payload: Record<string, unknown> = {
    productCode: 'CASHIER_PAYMENT',
    paymentRequestId: order.order_number,
    order: {
      referenceOrderId: order.order_number,
      orderDescription: `FLESIM 訂單 ${order.order_number}`,
      orderAmount: { currency: cfg.paymentCurrency, value },
      buyer: { referenceBuyerId: String(order.email || order.order_number) },
      env: { terminalType: 'WEB' },
    },
    paymentAmount: { currency: cfg.paymentCurrency, value },
    settlementStrategy: { settlementCurrency: cfg.currency },
    paymentRedirectUrl: `${origin}/payment/result?provider=antom&order_number=${encodeURIComponent(order.order_number)}`,
    paymentNotifyUrl: `${origin}/api/webhooks/antom`,
    env: { terminalType: 'WEB' },
  }
  if (cfg.merchantRegion) payload.merchantRegion = cfg.merchantRegion

  try {
    const res = await antomRequest('/ams/api/v1/payments/createPaymentSession', payload)
    const result = (res.data.result || {}) as Record<string, string>
    const paymentSessionData = res.data.paymentSessionData as string
    if (paymentSessionData) {
      return NextResponse.json({
        ok: true,
        paymentSessionData,
        paymentSessionId: res.data.paymentSessionId,
        environment: cfg.env === 'production' ? 'prod' : 'sandbox',
      })
    }
    return NextResponse.json({ error: result.resultMessage || '建立收銀台失敗', raw: res.data }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
