import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const orderNumber = searchParams.get('order_number')
  const recTradeId = searchParams.get('rec_trade_id')

  if (!orderNumber) {
    return NextResponse.json({ error: '缺少訂單編號' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 查詢訂單
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status')
    .eq('order_number', orderNumber)
    .single()

  if (!order) {
    return NextResponse.json({ error: '訂單不存在' }, { status: 404 })
  }

  // 更新訂單狀態為已付款（如果跳轉回來）
  if (recTradeId && order.status === 'pending_payment') {
    await supabase
      .from('orders')
      .update({ status: 'paid', tappay_trade_id: recTradeId })
      .eq('id', order.id)
  }

  return NextResponse.json({
    order_id: order.id,
    order_number: order.order_number,
  })
}
