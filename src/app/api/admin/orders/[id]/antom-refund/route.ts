import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { antomRequest, toAntomAmountValue, fromAntomAmountValue } from '@/lib/antom'

// 以 inquiryPayment 取得原付款的 paymentId 與金額（幣別/value）
async function getPayInfo(orderNumber: string, fallbackPaymentId: string | null) {
  let paymentId = fallbackPaymentId || ''
  let currency = ''
  let value = ''
  try {
    const inq = await antomRequest('/ams/api/v1/payments/inquiryPayment', { paymentRequestId: orderNumber })
    const d = inq.data as Record<string, unknown>
    if (d.paymentId) paymentId = String(d.paymentId)
    const amt = (d.paymentAmount || {}) as Record<string, string>
    currency = amt.currency || ''
    value = amt.value || ''
  } catch { /* 覆核失敗 */ }
  return { paymentId, currency, value }
}

// GET — 回傳原付款金額，供退款彈窗顯示可退上限
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  const { data: order } = await supabase.from('orders').select('order_number, payment_method, tappay_trade_id, status').eq('id', id).single()
  if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })
  if (order.payment_method !== 'antom') return NextResponse.json({ error: '此訂單非 Antom 付款' }, { status: 400 })
  const info = await getPayInfo(order.order_number, order.tappay_trade_id)
  return NextResponse.json({
    currency: info.currency,
    amount: info.currency && info.value ? fromAntomAmountValue(info.value, info.currency) : null,
    refunded: order.status === 'refunded',
  })
}

// POST { amount? } — 對 Antom 已付款訂單發起退款（不帶 amount = 全額；amount 為原付款幣別金額）
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const supabase = createAdminClient()

  const { data: order } = await supabase.from('orders')
    .select('id, order_number, status, payment_method, tappay_trade_id').eq('id', id).single()
  if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })
  if (order.payment_method !== 'antom') return NextResponse.json({ error: '此訂單非 Antom 付款' }, { status: 400 })
  if (order.status === 'refunded') return NextResponse.json({ error: '訂單已退款' }, { status: 400 })

  const { paymentId, currency: payCurrency, value: payValue } = await getPayInfo(order.order_number, order.tappay_trade_id)
  if (!paymentId) return NextResponse.json({ error: '找不到 Antom paymentId，無法退款' }, { status: 400 })
  if (!payCurrency || !payValue) return NextResponse.json({ error: '無法取得原付款金額，請稍後再試' }, { status: 400 })

  // 部分退款：amount 為原付款幣別金額（如 TWD 50），換算成 Antom value；不帶則全額
  let refundValue = payValue
  if (body.amount != null && body.amount !== '') {
    const v = toAntomAmountValue(Number(body.amount), payCurrency)
    if (Number(v) <= 0) return NextResponse.json({ error: '退款金額須大於 0' }, { status: 400 })
    if (Number(v) > Number(payValue)) return NextResponse.json({ error: '退款金額不可超過原付款金額' }, { status: 400 })
    refundValue = v
  }
  const payload = {
    refundRequestId: `${order.order_number}R${Date.now().toString().slice(-8)}`,
    paymentId,
    refundAmount: { currency: payCurrency, value: refundValue },
    refundReason: '商戶後台發起退款',
  }

  try {
    const res = await antomRequest('/ams/api/v1/payments/refund', payload)
    const result = (res.data.result || {}) as Record<string, string>
    // Antom 退款：S=成功、U=受理中（皆視為已受理）；其餘為失敗
    const accepted = result.resultStatus === 'S' || result.resultStatus === 'U'
    if (accepted) {
      const isFull = Number(refundValue) >= Number(payValue)
      if (isFull) await supabase.from('orders').update({ status: 'refunded' }).eq('id', order.id)
      return NextResponse.json({
        ok: true, refundId: res.data.refundId,
        amount: `${payCurrency} ${fromAntomAmountValue(refundValue, payCurrency)}`,
        full: isFull,
        processing: result.resultStatus === 'U',
      })
    }
    return NextResponse.json({ error: result.resultMessage || '退款失敗', raw: res.data }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
