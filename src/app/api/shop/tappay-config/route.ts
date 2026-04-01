import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'

function nonEmpty(...values: (string | undefined | null)[]): string {
  for (const v of values) {
    if (v && v.trim()) return v.trim()
  }
  return ''
}

// 前端用：取得 TapPay App ID / App Key / 環境 / 啟用的付款方式
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

  // 如果 DB 沒有設定，預設信用卡開啟
  const hasDbSettings = settings.size > 0

  return NextResponse.json({
    app_id: Number(appId || '0'),
    app_key: appKey,
    env,
    methods: {
      credit_card: hasDbSettings ? settings.get('payment_credit_card') === 'true' : true,
      line_pay: hasDbSettings ? settings.get('payment_line_pay') === 'true' : false,
      apple_pay: hasDbSettings ? settings.get('payment_apple_pay') === 'true' : false,
      jko_pay: hasDbSettings ? settings.get('payment_jko_pay') === 'true' : false,
      pxpay: hasDbSettings ? settings.get('payment_pxpay') === 'true' : false,
    },
  })
}
