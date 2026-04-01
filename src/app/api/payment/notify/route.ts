import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// TapPay 後端通知（Line Pay / JKO Pay 付款完成後）
export async function POST(request: Request) {
  const body = await request.json()
  const { status, rec_trade_id, order_number } = body

  const supabase = createAdminClient()

  if (status === 0 && order_number) {
    // 付款成功
    await supabase
      .from('orders')
      .update({ status: 'paid', tappay_trade_id: rec_trade_id })
      .eq('order_number', order_number)

    // 更新付款記錄
    await supabase
      .from('payments')
      .update({ status: 'success' })
      .eq('tappay_trade_id', rec_trade_id)
  }

  return NextResponse.json({ status: 'ok' })
}
