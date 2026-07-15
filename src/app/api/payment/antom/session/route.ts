import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { antomRequest, getAntomConfig, toAntomAmountValue } from '@/lib/antom'

// 取得買方公網 IP（Apple Pay 需要 env.clientIp，缺失或內網 IP 會靜默失敗）
function getClientIp(request: Request): string {
  const xff = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
  const ip = xff || request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || ''
  // 過濾內網/回環位址（Apple Pay 不接受）
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.')) return ''
  return ip
}

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
  } else if (method === 'CARD') {
    // 新卡（含首次綁卡，非已綁定舊卡）：
    //  - is3DSAuthentication:true 強制 3DS 驗證（正確位置在 paymentMethodMetaData，非 paymentFactor）；
    //    3DS 成功後「未授權」類拒付由發卡行承擔（liability shift）——見 docs/RiskManagementPlan.md。
    //  - save_card 時另加 tokenizeMode 綁卡（收銀台顯示「儲存卡片」勾選，付款後 webhook 存卡）。
    const meta: Record<string, unknown> = { is3DSAuthentication: true }
    if (body.save_card !== false && user) meta.tokenizeMode = 'ASKFORCONSENT'
    paymentMethod.paymentMethodMetaData = meta
  }

  // 【嵌入式 Payment Element】(productScene=ELEMENT_PAYMENT)：前端 AMSPaymentElement.mountComponent 內嵌、不跳轉。
  // Apple Pay 於 Payment Element 場景【必須】用 availablePaymentMethod.paymentMethodTypeList 指定（非 paymentMethod），
  // applePayConfiguration 置於 availablePaymentMethod.paymentMethodMetaData 且官方建議置空/預設（Antom 官方文檔截圖）。
  // 先前誤送 paymentMethod.paymentMethodType=APPLEPAY + 頂層 applePayConfiguration → SDK 卡 SDK_START_OF_LOADING。
  const isApplePay = method === 'APPLEPAY'
  const payload: Record<string, unknown> = {
    productCode: 'CASHIER_PAYMENT',
    productScene: 'ELEMENT_PAYMENT',
    paymentRequestId: order.order_number,
    order: {
      referenceOrderId: order.order_number,
      orderDescription: `FLESIM 訂單 ${order.order_number}`,
      orderAmount: { currency: payCurrency, value },
      buyer: { referenceBuyerId: String(order.email || order.order_number) },
    },
    paymentAmount: { currency: payCurrency, value },
    ...(isApplePay
      ? { availablePaymentMethod: { paymentMethodTypeList: [{ paymentMethodType: 'APPLEPAY' }] } }
      : { paymentMethod }),
    paymentRedirectUrl: `${origin}/payment/result?provider=antom&order_number=${encodeURIComponent(order.order_number)}`,
    paymentNotifyUrl: `${origin}/api/webhooks/antom`,
  }
  // 多結算幣別合約：需明確指定結算幣別（settlementCurrency，取自後台 antom_currency）
  // 否則 Antom 無法推斷 → PROCESS_FAIL。顧客仍付 paymentAmount 幣別，此為撥款幣別。
  if (cfg.currency) payload.settlementStrategy = { settlementCurrency: cfg.currency.toUpperCase() }
  // 網頁整合須指定終端類型；Apple Pay 另需 clientIp（真實公網 IP），缺失會靜默失敗（Antom 確認）
  const clientIp = getClientIp(request)
  payload.env = { terminalType: 'WEB', ...(clientIp ? { clientIp } : {}) }
  // isAuthorization 為卡片授權專用；APM（Alipay 等）不帶。
  // 註：3DS 由 paymentMethodMetaData.is3DSAuthentication 控制（見上），不在 paymentFactor。
  if (method === 'CARD') payload.paymentFactor = { isAuthorization: true }

  try {
    const res = await antomRequest('/ams/api/v1/payments/createPaymentSession', payload)
    const result = (res.data.result || {}) as Record<string, string>
    const environment = cfg.env === 'production' ? 'prod' : 'sandbox'
    // 彈窗（含 Apple Pay 極速支付）：回 paymentSessionData 供 SDK createComponent
    const paymentSessionData = res.data.paymentSessionData as string
    if (paymentSessionData) {
      return NextResponse.json({
        ok: true,
        paymentSessionData,
        paymentSessionId: res.data.paymentSessionId,
        environment,
      })
    }
    return NextResponse.json({ error: result.resultMessage || '建立收銀台失敗', raw: res.data }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
