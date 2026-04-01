import { getSettings } from '@/lib/settings'

const TAPPAY_SANDBOX_URL = 'https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime'
const TAPPAY_PROD_URL = 'https://prod.tappaysdk.com/tpc/payment/pay-by-prime'

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
}

export async function payByPrime(params: {
  prime: string
  amount: number
  orderNumber: string
  email: string
  details?: string
  paymentMethod?: string
  resultUrl?: string
}): Promise<{ success: boolean; trade_id: string; payment_url?: string; raw: PayByPrimeResponse }> {

  // 從 DB system_settings 讀取，fallback 到環境變數
  const settings = await getSettings()
  const partnerKey = settings.get('tappay_partner_key') || process.env.TAPPAY_PARTNER_KEY
  const env = settings.get('tappay_env') || process.env.NEXT_PUBLIC_TAPPAY_ENV || 'sandbox'

  // 根據付款方式選擇對應的 Merchant ID
  const method = params.paymentMethod || 'credit_card'
  const merchantIdKeys: Record<string, string> = {
    credit_card: 'tappay_merchant_id',
    line_pay: 'tappay_merchant_id_line_pay',
    apple_pay: 'tappay_merchant_id_apple_pay',
    jko_pay: 'tappay_merchant_id_jko_pay',
    pxpay: 'tappay_merchant_id_pxpay',
  }
  const merchantId = settings.get(merchantIdKeys[method] || 'tappay_merchant_id')
    || settings.get('tappay_merchant_id')
    || process.env.TAPPAY_MERCHANT_ID

  if (!partnerKey) {
    throw new Error('缺少 Partner Key，請到後台「參數管理 → 系統設定」填入')
  }
  if (!merchantId) {
    throw new Error(`缺少 ${method} 的 Merchant ID，請到後台「參數管理 → 系統設定」填入`)
  }

  const url = env === 'production' ? TAPPAY_PROD_URL : TAPPAY_SANDBOX_URL

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
    remember: false,
  }

  // 只有跳轉型付款才需要 result_url
  const redirectMethods = ['line_pay', 'jko_pay', 'pxpay']
  if (params.resultUrl && redirectMethods.includes(method)) {
    body.result_url = {
      frontend_redirect_url: params.resultUrl,
      backend_notify_url: params.resultUrl.replace('/payment/result', '/api/payment/notify'),
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': partnerKey,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json() as PayByPrimeResponse

  return {
    success: data.status === 0,
    trade_id: data.rec_trade_id || '',
    payment_url: data.payment_url,
    raw: data,
  }
}
