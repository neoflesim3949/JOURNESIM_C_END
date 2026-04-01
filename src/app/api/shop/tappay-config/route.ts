import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'

// 前端用：取得 TapPay App ID / App Key / 環境 / 啟用的付款方式
export async function GET() {
  const settings = await getSettings()

  return NextResponse.json({
    app_id: Number(settings.get('tappay_app_id') || process.env.NEXT_PUBLIC_TAPPAY_APP_ID || '0'),
    app_key: settings.get('tappay_app_key') || process.env.NEXT_PUBLIC_TAPPAY_APP_KEY || '',
    env: settings.get('tappay_env') || process.env.NEXT_PUBLIC_TAPPAY_ENV || 'sandbox',
    methods: {
      credit_card: settings.get('payment_credit_card') === 'true',
      line_pay: settings.get('payment_line_pay') === 'true',
      apple_pay: settings.get('payment_apple_pay') === 'true',
      jko_pay: settings.get('payment_jko_pay') === 'true',
      pxpay: settings.get('payment_pxpay') === 'true',
    },
  })
}
