import { getSettings } from '@/lib/settings'

const TAPPAY_SANDBOX = 'https://sandbox.tappaysdk.com/tpc'
const TAPPAY_PROD = 'https://prod.tappaysdk.com/tpc'

interface PayByPrimeResponse {
  status: number
  msg: string
  rec_trade_id: string
  bank_transaction_id: string
  order_number: string
  amount: number
  payment_url?: string
  card_info?: {
    bin_code: string
    last_four: string
    issuer: string
    type: number
  }
  card_secret?: {
    card_token: string
    card_key: string
  }
}

interface PayByTokenResponse {
  status: number
  msg: string
  rec_trade_id: string
  bank_transaction_id: string
  order_number: string
  amount: number
}

// 取非空值的 helper
function nonEmpty(...values: (string | undefined | null)[]): string {
  for (const v of values) {
    if (v && v.trim()) return v.trim()
  }
  return ''
}

async function getTapPayConfig() {
  let settings = new Map<string, string>()
  try {
    settings = await getSettings()
  } catch {
    // system_settings 表可能不存在，用 env fallback
  }
  const partnerKey = nonEmpty(settings.get('tappay_partner_key'), process.env.TAPPAY_PARTNER_KEY)
  const env = nonEmpty(settings.get('tappay_env'), process.env.NEXT_PUBLIC_TAPPAY_ENV) || 'sandbox'
  const baseUrl = env === 'production' ? TAPPAY_PROD : TAPPAY_SANDBOX

  if (!partnerKey) throw new Error('缺少 Partner Key，請到後台「參數管理 → 系統設定」填入')

  return { settings, partnerKey, baseUrl }
}

function getMerchantId(settings: Map<string, string>, method: string): string {
  const keys: Record<string, string> = {
    credit_card: 'tappay_merchant_id',
    line_pay: 'tappay_merchant_id_line_pay',
    apple_pay: 'tappay_merchant_id_apple_pay',
    jko_pay: 'tappay_merchant_id_jko_pay',
    pxpay: 'tappay_merchant_id_pxpay',
  }
  // 優先用該付款方式的專屬 Merchant ID，沒有就用通用的
  const merchantId = nonEmpty(
    settings.get(keys[method]),
    settings.get('tappay_merchant_id'),
    process.env.TAPPAY_MERCHANT_ID,
  )

  if (!merchantId) throw new Error(`缺少 ${method} 的 Merchant ID`)
  return merchantId
}

// Pay by Prime（首次付款）
export async function payByPrime(params: {
  prime: string
  amount: number
  orderNumber: string
  email: string
  details?: string
  paymentMethod?: string
  resultUrl?: string
  remember?: boolean  // true = 儲存卡片
}): Promise<{
  success: boolean
  trade_id: string
  payment_url?: string
  card_secret?: { card_token: string; card_key: string }
  card_info?: { bin_code: string; last_four: string; issuer: string; type: number }
  raw: PayByPrimeResponse
}> {
  const { settings, partnerKey, baseUrl } = await getTapPayConfig()
  const method = params.paymentMethod || 'credit_card'
  const merchantId = getMerchantId(settings, method)

  const body: Record<string, unknown> = {
    prime: params.prime,
    partner_key: partnerKey,
    merchant_id: merchantId,
    amount: params.amount,
    currency: 'TWD',
    details: params.details || 'FLESIM eSIM',
    order_number: params.orderNumber,
    cardholder: {
      phone_number: '',
      name: '',
      email: params.email,
    },
    remember: params.remember ?? false,
  }

  // 跳轉型付款需要 result_url
  const redirectMethods = ['line_pay', 'jko_pay', 'pxpay']
  if (params.resultUrl && redirectMethods.includes(method)) {
    body.result_url = {
      frontend_redirect_url: params.resultUrl,
      backend_notify_url: params.resultUrl.replace('/payment/result', '/api/payment/notify'),
    }
  }

  const res = await fetch(`${baseUrl}/payment/pay-by-prime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': partnerKey },
    body: JSON.stringify(body),
  })

  const data = await res.json() as PayByPrimeResponse

  return {
    success: data.status === 0,
    trade_id: data.rec_trade_id || '',
    payment_url: data.payment_url,
    card_secret: data.card_secret,
    card_info: data.card_info,
    raw: data,
  }
}

// Pay by Token（已儲存卡片付款）
export async function payByToken(params: {
  cardToken: string
  cardKey: string
  amount: number
  orderNumber: string
  email: string
  details?: string
}): Promise<{ success: boolean; trade_id: string; raw: PayByTokenResponse }> {
  const { partnerKey, baseUrl } = await getTapPayConfig()

  const body = {
    card_key: params.cardKey,
    card_token: params.cardToken,
    partner_key: partnerKey,
    merchant_id: process.env.TAPPAY_MERCHANT_ID,
    amount: params.amount,
    currency: 'TWD',
    details: params.details || 'FLESIM eSIM',
    order_number: params.orderNumber,
    cardholder: {
      phone_number: '',
      name: '',
      email: params.email,
    },
  }

  const res = await fetch(`${baseUrl}/payment/pay-by-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': partnerKey },
    body: JSON.stringify(body),
  })

  const data = await res.json() as PayByTokenResponse

  return {
    success: data.status === 0,
    trade_id: data.rec_trade_id || '',
    raw: data,
  }
}
