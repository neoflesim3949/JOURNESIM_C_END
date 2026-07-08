import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'

function nonEmpty(...values: (string | undefined | null)[]): string {
  for (const v of values) {
    if (v && v.trim()) return v.trim()
  }
  return ''
}

export async function GET() {
  let settings = new Map<string, string>()
  try {
    settings = await getSettings()
  } catch {
    // system_settings 表可能不存在
  }

  const appId = nonEmpty(settings.get('tappay_app_id'), process.env.NEXT_PUBLIC_TAPPAY_APP_ID)
  const appKey = nonEmpty(settings.get('tappay_app_key'), process.env.NEXT_PUBLIC_TAPPAY_APP_KEY)
  const env = nonEmpty(settings.get('tappay_env'), process.env.NEXT_PUBLIC_TAPPAY_ENV) || 'sandbox'
  const hasDbSettings = settings.size > 0

  const defs = [
    { id: 'credit_card', defaultLabel: '信用卡', defaultSort: 0 },
    { id: 'line_pay', defaultLabel: 'Line Pay', defaultSort: 1 },
    { id: 'apple_pay', defaultLabel: 'Apple Pay', defaultSort: 2 },
    { id: 'jko_pay', defaultLabel: '街口支付', defaultSort: 3 },
    { id: 'pxpay', defaultLabel: 'PX Pay Plus', defaultSort: 4 },
  ]

  const methods = defs.map((d) => ({
    id: d.id,
    enabled: hasDbSettings ? settings.get(`payment_${d.id}`) === 'true' : d.id === 'credit_card',
    label: nonEmpty(settings.get(`payment_${d.id}_label`)) || d.defaultLabel,
    icons: (settings.get(`payment_${d.id}_icons`) || '').split(',').filter(Boolean),
    sort: parseInt(nonEmpty(settings.get(`payment_${d.id}_sort`)) || String(d.defaultSort)),
  })).sort((a, b) => a.sort - b.sort)

  // 卡片種類 icon（1=VISA, 2=MasterCard, 3=JCB, 4=UnionPay, 5=AMEX）
  const cardTypeIcons: Record<string, string> = {}
  for (const t of ['1', '2', '3', '4', '5']) {
    const url = nonEmpty(settings.get(`card_type_${t}_icon`))
    if (url) cardTypeIcons[t] = url
  }

  const provider = nonEmpty(settings.get('payment_provider')) || 'tappay'

  // Antom 可選付款方式（顧客於結帳頁自選）。後台 antom_enabled_methods 以逗號分隔，預設卡片＋街口
  const antomAll = [
    { id: 'CARD', label: '信用卡 / 金融卡' },
    { id: 'APPLEPAY', label: 'Apple Pay' },
    { id: 'JKOPAY', label: '街口支付' },
    { id: 'ALIPAY_HK', label: 'AlipayHK' },
  ]
  const antomEnabledRaw = nonEmpty(settings.get('antom_enabled_methods')) || 'CARD,JKOPAY'
  const antomEnabled = new Set(antomEnabledRaw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
  const antomDefault = (nonEmpty(settings.get('antom_default_method')) || 'CARD').toUpperCase()
  const antomMethods = antomAll.filter((m) => antomEnabled.has(m.id))

  return NextResponse.json({ app_id: Number(appId || '0'), app_key: appKey, env, methods, cardTypeIcons, provider, antomMethods, antomDefault })
}
