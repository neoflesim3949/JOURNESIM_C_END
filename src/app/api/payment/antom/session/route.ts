import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
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

  // 付款方式：後台預設或前端指定（CARD / JKOPAY / ALIPAY_HK…）
  const method = String(body.payment_method || cfg.defaultMethod || 'CARD').toUpperCase()
  // 部分方式只收特定幣別（AlipayHK 僅 HKD）；其餘用後台交易幣別（預設 TWD，卡片與街口皆可）
  const METHOD_CURRENCY: Record<string, string> = { ALIPAY_HK: 'HKD' }
  const payCurrency = (METHOD_CURRENCY[method] || cfg.paymentCurrency).toUpperCase()

  // 訂單以 TWD 計價；若交易幣別非 TWD，用匯率換算（exchange_rates: 每 1 TWD 兌多少外幣）
  let payAmount = Number(order.total_amount)
  if (payCurrency !== 'TWD') {
    const { data: r } = await supabase.from('exchange_rates').select('rate').eq('currency', payCurrency).maybeSingle()
    const rate = r?.rate ? Number(r.rate) : 0
    if (rate > 0) payAmount = Number(order.total_amount) * rate
  }
  const value = toAntomAmountValue(payAmount, payCurrency)

  // 登入會員（供已綁卡付款 / 付款即綁卡判斷）
  const serverSupabase = await createClient()
  const { data: { user } } = await serverSupabase.auth.getUser()
  const cardId = String(body.card_id || '').trim()

  const paymentMethod: Record<string, unknown> = { paymentMethodType: method }
  if (method === 'CARD' && cardId && user) {
    // 用已綁定卡片付款：帶 paymentMethodId（cardToken），收銀台直接帶出該卡（免重打卡號）
    const { data: card } = await supabase.from('member_cards')
      .select('card_token').eq('id', cardId).eq('member_id', user.id).eq('provider', 'antom').single()
    if (!card?.card_token) return NextResponse.json({ error: '找不到綁定卡片' }, { status: 404 })
    paymentMethod.paymentMethodId = card.card_token
  } else if (method === 'CARD' && body.save_card !== false && user) {
    // 付款即綁卡（tokenizeMode）：收銀台顯示 Antom 原生「儲存卡片」勾選；付款後 webhook 存卡
    paymentMethod.paymentMethodMetaData = { tokenizeMode: 'ASKFORCONSENT' }
  } else if (method === 'APPLEPAY') {
    // Apple Pay：buttonsBundled 讓新版 Payment Element 自動內嵌渲染 Apple Pay 按鈕
    paymentMethod.paymentMethodMetaData = { applePayConfiguration: { buttonsBundled: 'true' } }
  }

  const payload: Record<string, unknown> = {
    productCode: 'CASHIER_PAYMENT',
    productScene: 'ELEMENT_PAYMENT',   // 新版 Payment Element（錢包按鈕自動渲染）
    paymentRequestId: order.order_number,
    order: {
      referenceOrderId: order.order_number,
      orderDescription: `FLESIM 訂單 ${order.order_number}`,
      orderAmount: { currency: payCurrency, value },
      buyer: { referenceBuyerId: String(order.email || order.order_number) },
    },
    paymentAmount: { currency: payCurrency, value },
    paymentMethod,
    paymentRedirectUrl: `${origin}/payment/result?provider=antom&order_number=${encodeURIComponent(order.order_number)}`,
    paymentNotifyUrl: `${origin}/api/webhooks/antom`,
  }
  // 多結算幣別合約：需明確指定結算幣別（settlementCurrency，取自後台 antom_currency）
  // 否則 Antom 無法推斷 → PROCESS_FAIL。顧客仍付 paymentAmount 幣別，此為撥款幣別。
  if (cfg.currency) payload.settlementStrategy = { settlementCurrency: cfg.currency.toUpperCase() }
  // 網頁整合須指定終端類型；Apple Pay 缺此欄會 PROCESS_FAIL（實測），卡片/其他方式帶著也正常
  payload.env = { terminalType: 'WEB' }
  // isAuthorization 為卡片授權專用；APM（Alipay 等）不帶
  if (method === 'CARD') payload.paymentFactor = { isAuthorization: true }

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
