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
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
  const method = String(body.payment_method || 'ALL').toUpperCase()

  // 效能：獨立查詢並行化（訂單/設定/啟用方式/登入會員），省去串行往返
  const [orderRes, cfg, enabledRes, userRes] = await Promise.all([
    supabase.from('orders').select('id, order_number, total_amount, email').eq('order_number', orderNumber).single(),
    getAntomConfig(),
    method === 'ALL'
      ? supabase.from('system_settings').select('value').eq('key', 'antom_enabled_methods').maybeSingle()
      : Promise.resolve({ data: null }),
    createClient().then((c) => c.auth.getUser()),
  ])
  const order = orderRes.data
  if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })
  const user = userRes.data.user

  // 付款方式：'ALL' = 由 Payment Element 渲染全部啟用方式（結帳頁第一層嵌入）；或指定單一方式
  let methodList: string[]
  if (method === 'ALL') {
    methodList = String(enabledRes.data?.value || 'CARD,JKOPAY').split(',').map((m) => m.trim().toUpperCase()).filter(Boolean)
      .filter((m) => m !== 'ALIPAY_HK')   // AlipayHK 僅收 HKD，與 TWD 列表混用會衝突，列表模式排除
    if (methodList.length === 0) methodList = ['CARD']
  } else {
    methodList = [method]
  }
  // 部分方式只收特定幣別（AlipayHK 僅 HKD）；其餘用後台交易幣別（預設 TWD，卡片/街口/Apple Pay 皆可）
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

  const cardId = String(body.card_id || '').trim()

  // 官方 Payment Element：所有方式以 availablePaymentMethod.paymentMethodTypeList 指定，
  // 卡別參數放 availablePaymentMethod.paymentMethodMetaData；已綁卡用 savedPaymentMethods.paymentMethodId。
  const pmMeta: Record<string, unknown> = {}
  const savedTokens: string[] = []
  const includesCard = methodList.includes('CARD')
  if (includesCard) {
    // 新卡：3DS 強制驗證（liability shift，見 docs/RiskManagementPlan.md）；登入會員 tokenizeMode 綁卡勾選
    pmMeta.is3DSAuthentication = true
    if (body.save_card !== false && user) pmMeta.tokenizeMode = 'ASKFORCONSENT'
    if (user) {
      if (cardId) {
        // 指定單一已綁卡
        const { data: card } = await supabase.from('member_cards')
          .select('card_token').eq('id', cardId).eq('member_id', user.id).eq('provider', 'antom').single()
        if (!card?.card_token) return NextResponse.json({ error: '找不到綁定卡片' }, { status: 404 })
        savedTokens.push(card.card_token)
      } else {
        // 列表模式：帶會員全部已綁卡，由 Payment Element 渲染「已儲存卡片」供選
        const { data: cards } = await supabase.from('member_cards')
          .select('card_token').eq('member_id', user.id).eq('provider', 'antom')
        for (const c of cards || []) if (c.card_token) savedTokens.push(c.card_token)
      }
    }
  }
  // Apple Pay：applePayConfiguration 官方建議於 Payment Element 場景留空（不設）

  // 渲染模式：element = 官方 Payment Element（productScene=ELEMENT_PAYMENT，前端 AMSElement.mount/submitPayment）；
  //           hosted = 全托管（productScene=CHECKOUT_PAYMENT，回 normalUrl 整頁跳轉）
  const renderMode = String(body.render_mode || 'element').toLowerCase()
  const useHosted = renderMode === 'hosted'
  const productScene = useHosted ? 'CHECKOUT_PAYMENT' : 'ELEMENT_PAYMENT'
  const hasMeta = Object.keys(pmMeta).length > 0
  const methodField: Record<string, unknown> = useHosted
    ? { paymentMethod: { paymentMethodType: methodList[0], ...(hasMeta ? { paymentMethodMetaData: pmMeta } : {}), ...(savedTokens[0] ? { paymentMethodId: savedTokens[0] } : {}) } }
    : {
        availablePaymentMethod: {
          paymentMethodTypeList: methodList.map((m) => ({ paymentMethodType: m })),
          ...(hasMeta ? { paymentMethodMetaData: pmMeta } : {}),
        },
        ...(savedTokens.length ? { savedPaymentMethods: savedTokens.map((t) => ({ paymentMethodType: 'CARD', paymentMethodId: t })) } : {}),
      }
  const payload: Record<string, unknown> = {
    productCode: 'CASHIER_PAYMENT',
    productScene,
    paymentRequestId: order.order_number,
    order: {
      referenceOrderId: order.order_number,
      orderDescription: `FLESIM 訂單 ${order.order_number}`,
      orderAmount: { currency: payCurrency, value },
      // Apple Pay 付款表顯示的商家名稱（未設時 SDK 顯示預設 "merchant"）
      merchant: { referenceMerchantId: 'FLESIM', merchantName: 'FLESIM.COM', merchantDisplayName: 'FLESIM.COM' },
      // 照官方範例補 goods 明細（Apple Pay 表建立 line items 需要）
      goods: [{
        referenceGoodsId: order.order_number,
        goodsName: `FLESIM 訂單 ${order.order_number}`,
        goodsQuantity: '1',
        goodsUnitAmount: { currency: payCurrency, value },
      }],
      buyer: { referenceBuyerId: String(order.email || order.order_number) },
    },
    paymentAmount: { currency: payCurrency, value },
    ...methodField,
    paymentRedirectUrl: `${origin}/payment/result?provider=antom&order_number=${encodeURIComponent(order.order_number)}`,
    paymentNotifyUrl: `${origin}/api/webhooks/antom`,
  }
  // 多結算幣別合約：需明確指定結算幣別（settlementCurrency，取自後台 antom_currency）
  // 否則 Antom 無法推斷 → PROCESS_FAIL。顧客仍付 paymentAmount 幣別，此為撥款幣別。
  if (cfg.currency) payload.settlementStrategy = { settlementCurrency: cfg.currency.toUpperCase() }
  // 網頁整合須指定終端類型；Apple Pay 另需 clientIp（真實公網 IP），缺失會靜默失敗（Antom 確認）
  const clientIp = getClientIp(request)
  // 照官方範例補 deviceLanguage/deviceId；Apple Pay 試 terminalType=WAP + osType=IOS（手機端，測是否走不同流程/網域）
  payload.env = method === 'APPLEPAY'
    ? { terminalType: 'WAP', osType: 'IOS', deviceLanguage: 'zh_TW', deviceId: '', ...(clientIp ? { clientIp } : {}) }
    : { terminalType: 'WEB', deviceLanguage: 'zh_TW', deviceId: '', ...(clientIp ? { clientIp } : {}) }
  // isAuthorization 為卡片/Apple Pay 授權專用；APM（Alipay 等）不帶。
  // 註：3DS 由 paymentMethodMetaData.is3DSAuthentication 控制（見上），不在 paymentFactor。
  if (method === 'CARD') payload.paymentFactor = { isAuthorization: true }
  else if (method === 'APPLEPAY') payload.paymentFactor = { isAuthorization: true, captureMode: 'AUTOMATIC' }  // 照官方範例補 captureMode

  try {
    const res = await antomRequest('/ams/api/v1/payments/createPaymentSession', payload)
    const result = (res.data.result || {}) as Record<string, string>
    const environment = cfg.env === 'production' ? 'prod' : 'sandbox'
    // 托管模式：回 normalUrl → 前端整頁跳轉
    const normalUrl = (res.data.normalUrl || res.data.redirectUrl) as string | undefined
    if (renderMode === 'hosted' && normalUrl) {
      return NextResponse.json({ ok: true, redirect_url: normalUrl, environment })
    }
    // element/popup：回 paymentSessionData 供前端 SDK（mountComponent / createComponent）
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
