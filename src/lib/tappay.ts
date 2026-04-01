const TAPPAY_SANDBOX_URL = 'https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime'
const TAPPAY_PROD_URL = 'https://prod.tappaysdk.com/tpc/payment/pay-by-prime'

interface PayByPrimeResponse {
  status: number
  msg: string
  rec_trade_id: string
  bank_transaction_id: string
  order_number: string
  amount: number
  payment_url?: string  // Line Pay / JKO Pay 跳轉 URL
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
  merchantId?: string
  resultUrl?: string  // 跳轉型付款的回調 URL
}): Promise<{ success: boolean; trade_id: string; payment_url?: string; raw: PayByPrimeResponse }> {
  const partnerKey = process.env.TAPPAY_PARTNER_KEY
  const env = process.env.NEXT_PUBLIC_TAPPAY_ENV || 'sandbox'

  // 根據付款方式選擇對應的 Merchant ID
  const merchantIdMap: Record<string, string | undefined> = {
    credit_card: params.merchantId || process.env.TAPPAY_MERCHANT_ID,
    line_pay: params.merchantId || process.env.TAPPAY_MERCHANT_ID_LINE_PAY || process.env.TAPPAY_MERCHANT_ID,
    apple_pay: params.merchantId || process.env.TAPPAY_MERCHANT_ID_APPLE_PAY || process.env.TAPPAY_MERCHANT_ID,
    jko_pay: params.merchantId || process.env.TAPPAY_MERCHANT_ID_JKO_PAY || process.env.TAPPAY_MERCHANT_ID,
    pxpay: params.merchantId || process.env.TAPPAY_MERCHANT_ID_PXPAY || process.env.TAPPAY_MERCHANT_ID,
  }
  const merchantId = merchantIdMap[params.paymentMethod || 'credit_card'] || process.env.TAPPAY_MERCHANT_ID

  if (!partnerKey) {
    throw new Error('缺少 TAPPAY_PARTNER_KEY')
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

  // 只有跳轉型付款才需要 result_url（Line Pay、JKO Pay、PX Pay）
  const redirectMethods = ['line_pay', 'jko_pay', 'pxpay']
  if (params.resultUrl && redirectMethods.includes(params.paymentMethod || '')) {
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
