import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { antomRequest, getAntomConfig, toAntomAmountValue } from '@/lib/antom'

// POST { order_number, card_id? } — 建立 Antom 託管收銀頁（Hosted Checkout Page）
// 回 redirect_url（normalUrl），前端跳轉；顧客在 Antom 頁面選卡片/街口/Apple Pay 完成付款
// 詳見 docs/Antom_API.md（Hosted mode）
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
  const payCurrency = cfg.paymentCurrency.toUpperCase()  // 顧客付款幣別（預設 TWD）

  // 訂單以 TWD 計價；若付款幣別非 TWD，用匯率換算
  let payAmount = Number(order.total_amount)
  if (payCurrency !== 'TWD') {
    const { data: r } = await supabase.from('exchange_rates').select('rate').eq('currency', payCurrency).maybeSingle()
    const rate = r?.rate ? Number(r.rate) : 0
    if (rate > 0) payAmount = Number(order.total_amount) * rate
  }
  const value = toAntomAmountValue(payAmount, payCurrency)

  const payload: Record<string, unknown> = {
    productCode: 'CASHIER_PAYMENT',
    productScene: 'CHECKOUT_PAYMENT',   // 託管收銀頁：顯示所有已啟用付款方式
    paymentRequestId: order.order_number,
    order: {
      referenceOrderId: order.order_number,
      orderDescription: `FLESIM 訂單 ${order.order_number}`,
      orderAmount: { currency: payCurrency, value },
      buyer: { referenceBuyerId: String(order.email || order.order_number) },
    },
    paymentAmount: { currency: payCurrency, value },
    paymentRedirectUrl: `${origin}/payment/result?provider=antom&order_number=${encodeURIComponent(order.order_number)}`,
    paymentNotifyUrl: `${origin}/api/webhooks/antom`,
    env: { terminalType: 'WEB' },
  }
  // 多結算幣別合約：明確指定結算幣別（撥款幣別，取自後台 antom_currency，如 USD）
  if (cfg.currency) payload.settlementStrategy = { settlementCurrency: cfg.currency.toUpperCase() }

  // 已綁卡快速付款：指定該卡 token（託管頁直接帶出該卡；需為本人卡片）
  const cardId = String(body.card_id || '').trim()
  if (cardId) {
    const serverSupabase = await createClient()
    const { data: { user } } = await serverSupabase.auth.getUser()
    if (user) {
      const { data: card } = await supabase.from('member_cards')
        .select('card_token').eq('id', cardId).eq('member_id', user.id).eq('provider', 'antom').single()
      if (card?.card_token) {
        payload.paymentMethod = { paymentMethodType: 'CARD', paymentMethodId: card.card_token }
        payload.paymentFactor = { isAuthorization: true }
      }
    }
  }

  try {
    const res = await antomRequest('/ams/api/v1/payments/createPaymentSession', payload)
    const result = (res.data.result || {}) as Record<string, string>
    const redirectUrl = res.data.normalUrl as string
    if (redirectUrl) return NextResponse.json({ ok: true, redirect_url: redirectUrl })
    return NextResponse.json({ error: result.resultMessage || '建立收銀頁失敗', raw: res.data }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
