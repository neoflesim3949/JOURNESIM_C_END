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

  const methods = [
    {
      id: 'credit_card',
      enabled: hasDbSettings ? settings.get('payment_credit_card') === 'true' : true,
      label: nonEmpty(settings.get('payment_credit_card_label')) || '信用卡',
      icons: (settings.get('payment_credit_card_icons') || '').split(',').filter(Boolean),
    },
    {
      id: 'line_pay',
      enabled: hasDbSettings ? settings.get('payment_line_pay') === 'true' : false,
      label: nonEmpty(settings.get('payment_line_pay_label')) || 'Line Pay',
      icons: (settings.get('payment_line_pay_icons') || '').split(',').filter(Boolean),
    },
    {
      id: 'apple_pay',
      enabled: hasDbSettings ? settings.get('payment_apple_pay') === 'true' : false,
      label: nonEmpty(settings.get('payment_apple_pay_label')) || 'Apple Pay',
      icons: (settings.get('payment_apple_pay_icons') || '').split(',').filter(Boolean),
    },
    {
      id: 'jko_pay',
      enabled: hasDbSettings ? settings.get('payment_jko_pay') === 'true' : false,
      label: nonEmpty(settings.get('payment_jko_pay_label')) || '街口支付',
      icons: (settings.get('payment_jko_pay_icons') || '').split(',').filter(Boolean),
    },
    {
      id: 'pxpay',
      enabled: hasDbSettings ? settings.get('payment_pxpay') === 'true' : false,
      label: nonEmpty(settings.get('payment_pxpay_label')) || 'PX Pay Plus',
      icons: (settings.get('payment_pxpay_icons') || '').split(',').filter(Boolean),
    },
  ]

  return NextResponse.json({ app_id: Number(appId || '0'), app_key: appKey, env, methods })
}
