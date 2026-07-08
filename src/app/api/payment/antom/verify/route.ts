import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { antomRequest } from '@/lib/antom'

// GET ?order_number= — 以 inquiryPayment 覆核 Antom 付款狀態，並回寫訂單
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const orderNumber = (searchParams.get('order_number') || '').trim()
  if (!orderNumber) return NextResponse.json({ status: 'failed', error: '缺少訂單編號' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: order } = await supabase.from('orders').select('id, order_number, status').eq('order_number', orderNumber).single()
  if (!order) return NextResponse.json({ status: 'failed', error: '訂單不存在' }, { status: 404 })

  // 已是付款/完成狀態，直接回成功
  if (order.status === 'paid' || order.status === 'completed') {
    return NextResponse.json({ status: 'success', order_id: order.id, order_number: order.order_number })
  }

  let paid = false
  let paymentId = ''
  try {
    const inq = await antomRequest('/ams/api/v1/payments/inquiryPayment', { paymentRequestId: orderNumber })
    const d = inq.data as Record<string, unknown>
    const ps = String(d.paymentStatus || '')
    const rs = String((d.result as Record<string, string> | undefined)?.resultStatus || '')
    paid = ps === 'SUCCESS' || rs === 'S'
    paymentId = String(d.paymentId || '')
  } catch { /* 憑證/連線問題時視為未確認 */ }

  if (paid) {
    await supabase.from('orders').update({
      status: 'paid', payment_method: 'antom', tappay_trade_id: paymentId || null,
    }).eq('id', order.id)
    return NextResponse.json({ status: 'success', order_id: order.id, order_number: order.order_number })
  }
  return NextResponse.json({ status: 'pending', order_id: order.id, order_number: order.order_number })
}
