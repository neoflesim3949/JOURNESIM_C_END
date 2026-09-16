import { getSettings } from '@/lib/settings'
import { createAdminClient } from '@/lib/supabase/admin'

const TAPPAY_SANDBOX = 'https://sandbox.tappaysdk.com/tpc'
const TAPPAY_PROD = 'https://prod.tappaysdk.com/tpc'

// 記 log 前遮罩敏感欄位（partner_key / prime / card_token / card_key / card_secret），不落地
function maskBody(body: unknown): unknown {
  if (body == null || typeof body !== 'object') return body ?? null
  const SENSITIVE = new Set(['partner_key', 'prime', 'card_token', 'card_key'])
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (SENSITIVE.has(k)) out[k] = typeof val === 'string' && val ? `***${val.slice(-4)}` : '***'
        else if (k === 'card_secret') out[k] = '***'   // 回應內的卡片 token/key 整包遮掉
        else out[k] = walk(val)
      }
      return out
    }
    return v
  }
  try { return walk(body) } catch { return null }
}

// 寫入 TapPay API log（失敗不影響主流程）
export async function logTappayApi(entry: {
  action: string; endpoint?: string; direction?: string
  order_number?: string | null; trade_id?: string | null
  request_body?: unknown; response_body?: unknown
  status: string; tappay_status?: string | null; error_message?: string | null; duration_ms?: number
}) {
  try {
    await createAdminClient().from('tappay_api_logs').insert({
      action: entry.action,
      endpoint: entry.endpoint || null,
      direction: entry.direction || 'outgoing',
      order_number: entry.order_number || null,
      trade_id: entry.trade_id || null,
      request_body: maskBody(entry.request_body),
      response_body: maskBody(entry.response_body),
      status: entry.status,
      tappay_status: entry.tappay_status ?? null,
      error_message: entry.error_message || null,
      duration_ms: entry.duration_ms ?? null,
    }).abortSignal(AbortSignal.timeout(8000))
  } catch (e) {
    console.error('[TAPPAY LOG] 寫入失敗:', e)
  }
}

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

  const endpoint = `${baseUrl}/payment/pay-by-prime`
  const startedAt = Date.now()
  let data: PayByPrimeResponse
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': partnerKey },
      body: JSON.stringify(body),
    })
    data = await res.json() as PayByPrimeResponse
  } catch (err) {
    await logTappayApi({
      action: 'payByPrime', endpoint, order_number: params.orderNumber,
      request_body: body, response_body: null, status: 'error',
      error_message: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - startedAt,
    })
    throw err
  }

  await logTappayApi({
    action: 'payByPrime', endpoint, order_number: params.orderNumber, trade_id: data.rec_trade_id || null,
    request_body: body, response_body: data,
    status: data.status === 0 ? 'success' : 'error', tappay_status: String(data.status),
    error_message: data.status === 0 ? null : data.msg, duration_ms: Date.now() - startedAt,
  })

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
  const { settings, partnerKey, baseUrl } = await getTapPayConfig()

  const body = {
    card_key: params.cardKey,
    card_token: params.cardToken,
    partner_key: partnerKey,
    merchant_id: getMerchantId(settings, 'credit_card'),
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

  const endpoint = `${baseUrl}/payment/pay-by-token`
  const startedAt = Date.now()
  let data: PayByTokenResponse
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': partnerKey },
      body: JSON.stringify(body),
    })
    data = await res.json() as PayByTokenResponse
  } catch (err) {
    await logTappayApi({
      action: 'payByToken', endpoint, order_number: params.orderNumber,
      request_body: body, response_body: null, status: 'error',
      error_message: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - startedAt,
    })
    throw err
  }

  await logTappayApi({
    action: 'payByToken', endpoint, order_number: params.orderNumber, trade_id: data.rec_trade_id || null,
    request_body: body, response_body: data,
    status: data.status === 0 ? 'success' : 'error', tappay_status: String(data.status),
    error_message: data.status === 0 ? null : data.msg, duration_ms: Date.now() - startedAt,
  })

  return {
    success: data.status === 0,
    trade_id: data.rec_trade_id || '',
    raw: data,
  }
}
