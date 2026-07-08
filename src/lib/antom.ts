import { createSign, createVerify } from 'crypto'
import { getSettings } from '@/lib/settings'

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

// 送出簽章後的 POST 請求到 Antom 閘道
export async function antomRequest(path: string, payload: Record<string, unknown>): Promise<AntomResponse> {
  const cfg = await getAntomConfig()
  if (!isAntomConfigured(cfg)) throw new Error('Antom 尚未設定憑證（Client-Id / 私鑰）')
  const body = JSON.stringify(payload)
  const requestTime = new Date().toISOString()
  const signature = signRequest('POST', path, cfg.clientId, requestTime, body, cfg.privateKey)
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
  return { status: res.status, data, requestTime }
}

// TWD/JPY 等零小數幣別：value 直接為整數字串；其餘幣別以最小單位（分）
const ZERO_DECIMAL = new Set(['TWD', 'JPY', 'KRW', 'VND'])
export function toAntomAmountValue(amount: number, currency: string): string {
  if (ZERO_DECIMAL.has(currency.toUpperCase())) return String(Math.round(amount))
  return String(Math.round(amount * 100))
}
