import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { antomRequest, extractCardInfo, saveMemberAntomCard } from '@/lib/antom'

// GET ?order_number= — 以 inquiryPayment 覆核 Antom 付款狀態，並回寫訂單
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const orderNumber = (searchParams.get('order_number') || '').trim()
  if (!orderNumber) return NextResponse.json({ status: 'failed', error: '缺少訂單編號' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: order } = await supabase.from('orders').select('id, order_number, status, member_id').eq('order_number', orderNumber).single()
  if (!order) return NextResponse.json({ status: 'failed', error: '訂單不存在' }, { status: 404 })

  // 已是付款/完成狀態，直接回成功
  if (order.status === 'paid' || order.status === 'completed') {
    return NextResponse.json({ status: 'success', order_id: order.id, order_number: order.order_number })
  }

  let paid = false
  let paymentId = ''
  let inqData: Record<string, unknown> | null = null
  try {
    const inq = await antomRequest('/ams/api/v1/payments/inquiryPayment', { paymentRequestId: orderNumber })
    const d = inq.data as Record<string, unknown>
    inqData = d
    // 只認 paymentStatus===SUCCESS 為付款成功。
    // result.resultStatus==='S' 只代表 inquiryPayment「查詢 API 成功」，付款可能仍 PROCESSING/FAIL。
    const ps = String(d.paymentStatus || '')
    paid = ps === 'SUCCESS'
    paymentId = String(d.paymentId || '')
  } catch { /* 憑證/連線問題時視為未確認 */ }

  if (paid) {
    await supabase.from('orders').update({
      status: 'paid', payment_method: 'antom', tappay_trade_id: paymentId || null,
    }).eq('id', order.id)
    // 付款即綁卡：若結果帶 cardToken 且為會員訂單，存卡
    if (order.member_id && inqData) {
      const info = extractCardInfo(inqData)
      if (info) await saveMemberAntomCard(order.member_id, info)
    }
    return NextResponse.json({ status: 'success', order_id: order.id, order_number: order.order_number })
  }
  return NextResponse.json({ status: 'pending', order_id: order.id, order_number: order.order_number })
}
