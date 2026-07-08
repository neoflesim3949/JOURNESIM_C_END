import { createSign, createVerify } from 'crypto'
import { getSettings } from '@/lib/settings'
import { createAdminClient } from '@/lib/supabase/admin'

// Antom（Alipay+ / Ant International）Cashier Payment 串接
// 憑證來源：後台 system_settings（antom_*），env 為備援。
// 詳見 docs/Antom_API.md

export interface AntomConfig {
  clientId: string
  env: 'sandbox' | 'production'
  gateway: string
  privateKey: string        // 商戶私鑰（簽出）
  alipayPublicKey: string   // Antom 公鑰（驗 webhook）
  currency: string          // 結算幣別（settlementCurrency）
  paymentCurrency: string   // 交易/計價幣別（paymentAmount，訂單以此計價，預設 TWD）
  defaultMethod: string     // pay 需指定 paymentMethodType（如 CARD / ALIPAY_CN…）
  merchantRegion: string    // 商戶所在地（ISO 3166 2 碼，如 HK）
}

export async function getAntomConfig(): Promise<AntomConfig> {
  let s = new Map<string, string>()
  try { s = await getSettings() } catch { /* system_settings 可能不存在 */ }
  const g = (k: string, e: string) => (s.get(k)?.trim() || process.env[e] || '')
  const env = (g('antom_env', 'ANTOM_ENV') || 'sandbox') as 'sandbox' | 'production'
  // sandbox 閘道網域由 Antom Dashboard 提供，這裡以設定為準
  const gateway = g('antom_gateway_url', 'ANTOM_GATEWAY_URL') || 'https://open-sea-global.alipay.com'
  return {
    clientId: g('antom_client_id', 'ANTOM_CLIENT_ID'),
    env,
    gateway: gateway.replace(/\/$/, ''),
    privateKey: g('antom_merchant_private_key', 'ANTOM_MERCHANT_PRIVATE_KEY'),
    alipayPublicKey: g('antom_alipay_public_key', 'ANTOM_ALIPAY_PUBLIC_KEY'),
    currency: g('antom_currency', 'ANTOM_CURRENCY') || 'TWD',
    paymentCurrency: g('antom_payment_currency', 'ANTOM_PAYMENT_CURRENCY') || 'TWD',
    defaultMethod: g('antom_default_method', 'ANTOM_DEFAULT_METHOD') || 'CARD',
    merchantRegion: g('antom_merchant_region', 'ANTOM_MERCHANT_REGION') || 'HK',
  }
}

export function isAntomConfigured(cfg: AntomConfig): boolean {
  return !!(cfg.clientId && cfg.privateKey)
}

// 將原始 base64 金鑰包成 PEM（若已是 PEM 則原樣返回）
function toPem(key: string, label: 'PRIVATE KEY' | 'PUBLIC KEY'): string {
  const k = (key || '').trim()
  if (k.includes('BEGIN')) return k
  const body = k.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || ''
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`
}

// 待簽字串：`<method> <path>\n<clientId>.<requestTime>.<body>`；SHA256withRSA → Base64 → URLEncode
export function buildContent(method: string, path: string, clientId: string, requestTime: string, body: string): string {
  return `${method} ${path}\n${clientId}.${requestTime}.${body}`
}

export function signRequest(method: string, path: string, clientId: string, requestTime: string, body: string, privateKey: string): string {
  const signer = createSign('RSA-SHA256')
  signer.update(buildContent(method, path, clientId, requestTime, body), 'utf8')
  const sig = signer.sign(toPem(privateKey, 'PRIVATE KEY'), 'base64')
  return encodeURIComponent(sig)
}

export function verifySignature(method: string, path: string, clientId: string, requestTime: string, body: string, signature: string, publicKey: string): boolean {
  try {
    const verifier = createVerify('RSA-SHA256')
    verifier.update(buildContent(method, path, clientId, requestTime, body), 'utf8')
    return verifier.verify(toPem(publicKey, 'PUBLIC KEY'), decodeURIComponent(signature), 'base64')
  } catch {
    return false
  }
}

export interface AntomResponse {
  status: number
  data: Record<string, unknown>
  requestTime: string
}

// ── API log（對照 bc_api_logs；fire-and-forget，絕不阻塞主流程）────────────
const MAX_BODY_CHARS = 12_000
function trimBody(body: unknown): unknown {
  if (body == null) return null
  try {
    const s = JSON.stringify(body)
    if (s.length <= MAX_BODY_CHARS) return body
    return { _truncated: true, _bytes: s.length, preview: s.slice(0, MAX_BODY_CHARS) }
  } catch { return null }
}
// 由路徑末段推出動作名（createPaymentSession / inquiryPayment / refund / pay …）
function actionFromPath(path: string): string {
  const seg = path.split('/').filter(Boolean).pop() || path
  return seg
}
export async function logAntomApi(entry: {
  action: string; endpoint?: string; direction?: string
  order_number?: string | null; payment_id?: string | null
  request_body?: unknown; response_body?: unknown
  status: string; result_status?: string | null; error_message?: string; duration_ms?: number
}) {
  try {
    const supabase = createAdminClient()
    await supabase.from('antom_api_logs').insert({
      action: entry.action,
      endpoint: entry.endpoint || null,
      direction: entry.direction || 'outgoing',
      order_number: entry.order_number || null,
      payment_id: entry.payment_id || null,
      request_body: trimBody(entry.request_body),
      response_body: trimBody(entry.response_body),
      status: entry.status,
      result_status: entry.result_status || null,
      error_message: entry.error_message || null,
      duration_ms: entry.duration_ms ?? null,
    }).abortSignal(AbortSignal.timeout(8000))
  } catch (e) {
    console.error('[ANTOM LOG] 寫入失敗:', e)
  }
}

// 卡別代碼（沿用 member_cards 數字碼：1VISA 2MC 3JCB 4銀聯 5AMEX）
const BRAND_CODE: Record<string, string> = { VISA: '1', MASTERCARD: '2', JCB: '3', UNIONPAY: '4', CUP: '4', AMEX: '5', AMERICAN_EXPRESS: '5' }

export interface AntomCardInfo {
  cardToken: string; lastFour: string; brand: string; bin: string | null
  expMonth: string | null; expYear: string | null; issuer: string | null
}

// 從付款/綁卡結果擷取 token 與卡片資訊。相容多種來源與欄位名：
//  付款：paymentResultInfo.{cardToken,cardBin,lastFour,cardBrand,cardNo,issuerName,expiryMonth,expiryYear}、cardInfo.*
//  綁卡：paymentMethodDetail.card.{cardToken,lastFour,brand,bin,expiredMonth,expiredYear,issuerName}
export function extractCardInfo(data: Record<string, unknown>): AntomCardInfo | null {
  const pri = (data.paymentResultInfo || {}) as Record<string, unknown>
  const ci = (data.cardInfo || pri.cardInfo || {}) as Record<string, unknown>
  const pmdCard = ((data.paymentMethodDetail as Record<string, unknown>)?.card || {}) as Record<string, unknown>
  const pick = (...keys: string[]): string => {
    for (const src of [pri, ci, pmdCard]) {
      for (const k of keys) {
        const v = src[k]
        if (v != null && String(v) !== '') return String(v)
      }
    }
    return ''
  }
  const cardToken = pick('cardToken', 'paymentMethodId')
  if (!cardToken) return null
  let lastFour = pick('lastFour', 'last4', 'cardLastFour')
  const cardNo = pick('cardNo')  // 遮罩全碼，如 ************1310
  if (!lastFour && cardNo) lastFour = (cardNo.replace(/\D/g, '').slice(-4)) || cardNo.slice(-4)
  return {
    cardToken,
    lastFour,
    brand: pick('cardBrand', 'brand'),
    bin: pick('cardBin', 'bin') || null,
    expMonth: pick('expiryMonth', 'expiredMonth', 'expMonth') || null,
    expYear: pick('expiryYear', 'expiredYear', 'expYear') || null,
    issuer: pick('issuerName', 'issuingBank') || null,
  }
}

// 將 Antom token 存進 member_cards（付款即綁卡 / 獨立綁卡共用）；回傳卡片 id
export async function saveMemberAntomCard(memberId: string, info: AntomCardInfo): Promise<string | null> {
  if (!memberId || !info.cardToken) return null
  try {
    const supabase = createAdminClient()
    const brand = (info.brand || '').toUpperCase()
    const { data } = await supabase.from('member_cards').upsert({
      member_id: memberId,
      provider: 'antom',
      card_token: info.cardToken,
      card_key: null,
      last_four: info.lastFour || '',
      bin_code: info.bin,
      card_type: BRAND_CODE[brand] || null,
      issuer: info.issuer || brand || null,
      exp_month: info.expMonth,
      exp_year: info.expYear,
    }, { onConflict: 'member_id,card_token' }).select('id').single()
    return data?.id || null
  } catch (e) {
    console.error('[ANTOM] 存卡失敗:', e)
    return null
  }
}

// 送出簽章後的 POST 請求到 Antom 閘道
export async function antomRequest(path: string, payload: Record<string, unknown>): Promise<AntomResponse> {
  const cfg = await getAntomConfig()
  if (!isAntomConfigured(cfg)) throw new Error('Antom 尚未設定憑證（Client-Id / 私鑰）')
  const body = JSON.stringify(payload)
  const requestTime = new Date().toISOString()
  const signature = signRequest('POST', path, cfg.clientId, requestTime, body, cfg.privateKey)
  const started = Date.now()
  const orderNumber = (payload.paymentRequestId || payload.referenceOrderId || (payload.order as Record<string, unknown>)?.referenceOrderId || null) as string | null
  try {
    const res = await fetch(cfg.gateway + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Client-Id': cfg.clientId,
        'Request-Time': requestTime,
        'Signature': `algorithm=RSA256,keyVersion=1,signature=${signature}`,
      },
      body,
    })
    const text = await res.text()
    let data: Record<string, unknown>
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    const result = (data.result || {}) as Record<string, string>
    const resultStatus = result.resultStatus || ''
    // Antom 成功/受理：resultStatus S 或 U（若無 result 欄位則以 HTTP 2xx 判定）
    const ok = resultStatus ? (resultStatus === 'S' || resultStatus === 'U') : (res.status >= 200 && res.status < 300)
    void logAntomApi({
      action: actionFromPath(path), endpoint: path, direction: 'outgoing',
      order_number: orderNumber, payment_id: (payload.paymentId || data.paymentId || null) as string | null,
      request_body: payload, response_body: data,
      status: ok ? 'success' : 'error', result_status: resultStatus || null,
      error_message: ok ? undefined : (result.resultMessage || `HTTP ${res.status}`),
      duration_ms: Date.now() - started,
    })
    return { status: res.status, data, requestTime }
  } catch (e) {
    void logAntomApi({
      action: actionFromPath(path), endpoint: path, direction: 'outgoing',
      order_number: orderNumber, request_body: payload, response_body: null,
      status: 'error', error_message: e instanceof Error ? e.message : String(e),
      duration_ms: Date.now() - started,
    })
    throw e
  }
}

// Antom value 為最小貨幣單位。實測 TWD 亦需 ×100（value「10500」= TWD 105.00）。
// 真正零小數幣別（JPY/KRW/VND）才不 ×100。
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND'])
export function toAntomAmountValue(amount: number, currency: string): string {
  if (ZERO_DECIMAL.has(currency.toUpperCase())) return String(Math.round(amount))
  return String(Math.round(amount * 100))
}

// Antom value（最小單位字串）→ 一般金額
export function fromAntomAmountValue(value: string | number, currency: string): number {
  const v = Number(value) || 0
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? v : v / 100
}
