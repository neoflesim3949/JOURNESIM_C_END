import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { antomRequest, getAntomConfig, toAntomAmountValue } from '@/lib/antom'

// POST { order_number, payment_method? } — 建立 Antom 支付並回傳跳轉網址
// 使用 pay（Cashier Payment 跳轉流）；詳見 docs/Antom_API.md
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const orderNumber = String(body.order_number || '').trim()
  if (!orderNumber) return NextResponse.json({ error: '缺少訂單編號' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: order } = await supabase.from('orders')
    .select('id, order_number, total_amount, email, status').eq('order_number', orderNumber).single()
  if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })

  const cfg = await getAntomConfig()
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
  // 交易金額用訂單計價幣別（預設 TWD）；結算幣別另設，Antom 自動換匯
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
    paymentMethod: { paymentMethodType: String(body.payment_method || cfg.defaultMethod) },
    settlementStrategy: { settlementCurrency: cfg.currency },
    paymentRedirectUrl: `${origin}/payment/result?provider=antom&order_number=${encodeURIComponent(order.order_number)}`,
    paymentNotifyUrl: `${origin}/api/webhooks/antom`,
    env: { terminalType: 'WEB' },
  }
  if (cfg.merchantRegion) payload.merchantRegion = cfg.merchantRegion

  try {
    const res = await antomRequest('/ams/api/v1/payments/pay', payload)
    const result = (res.data.result || {}) as Record<string, string>
    // 取跳轉網址：normalUrl 或 redirectActionForm.redirectUrl
    const actionForm = (res.data.redirectActionForm || res.data.paymentActionForm || {}) as Record<string, string>
    const redirectUrl = actionForm.redirectUrl || actionForm.normalUrl || (res.data.normalUrl as string) || ''
    if (result.resultStatus === 'S' || redirectUrl) {
      return NextResponse.json({ ok: true, redirectUrl, paymentId: res.data.paymentId, raw: res.data })
    }
    return NextResponse.json({ error: result.resultMessage || '建立支付失敗', raw: res.data }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
