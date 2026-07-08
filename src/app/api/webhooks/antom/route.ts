import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAntomConfig, verifySignature, antomRequest, logAntomApi, extractCardInfo, saveMemberAntomCard } from '@/lib/antom'

// Antom 支付結果通知（notifyPayment）
// 驗簽 → inquiryPayment 覆核 → 更新訂單 → 必回 {"result":{...,"S"}}
// 詳見 docs/Antom_API.md
const ACK = { result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'success' } }

export async function POST(request: Request) {
  const raw = await request.text()
  const clientId = request.headers.get('client-id') || ''
  const requestTime = request.headers.get('request-time') || ''
  const sigHeader = request.headers.get('signature') || ''
  const signature = /signature=([^,]+)/.exec(sigHeader)?.[1] || sigHeader
  const path = new URL(request.url).pathname

  const cfg = await getAntomConfig()

  // 驗簽（有設定 Antom 公鑰才驗；未設定先略過以利先行搭建）
  if (cfg.alipayPublicKey) {
    const ok = verifySignature('POST', path, clientId, requestTime, raw, signature, cfg.alipayPublicKey)
    if (!ok) {
      console.error('[antom webhook] 驗簽失敗')
      return NextResponse.json({ result: { resultCode: 'SIGNATURE_INVALID', resultStatus: 'F', resultMessage: 'invalid signature' } }, { status: 401 })
    }
  }

  let body: Record<string, unknown> = {}
  try { body = JSON.parse(raw) } catch {
    void logAntomApi({ action: 'notifyPayment', endpoint: path, direction: 'incoming', request_body: { raw }, status: 'error', error_message: 'JSON 解析失敗' })
    return NextResponse.json(ACK)
  }

  const paymentRequestId = String(body.paymentRequestId || '')
  const result = (body.result || {}) as Record<string, string>
  const notifyPaid = result.resultStatus === 'S'

  // 留底 webhook 通知
  void logAntomApi({
    action: 'notifyPayment', endpoint: path, direction: 'incoming',
    order_number: paymentRequestId || null, payment_id: String(body.paymentId || '') || null,
    request_body: body, response_body: ACK,
    status: notifyPaid ? 'success' : 'error', result_status: result.resultStatus || null,
  })

  if (paymentRequestId) {
    const supabase = createAdminClient()
    const { data: order } = await supabase.from('orders').select('id, status, member_id').eq('order_number', paymentRequestId).single()
    if (order) {
      let paid = notifyPaid
      let inqData: Record<string, unknown> | null = null
      // 覆核：以 inquiryPayment 再確認一次（有憑證才打）
      try {
        const inq = await antomRequest('/ams/api/v1/payments/inquiryPayment', { paymentRequestId })
        inqData = inq.data
        const st = ((inq.data.paymentStatus as string) || ((inq.data.result as Record<string, string>)?.resultStatus)) || ''
        if (st) paid = st === 'SUCCESS' || st === 'S'
      } catch { /* 憑證未齊時略過覆核，採用通知結果 */ }

      if (paid && order.status !== 'paid' && order.status !== 'completed') {
        await supabase.from('orders').update({
          status: 'paid',
          payment_method: 'antom',
          tappay_trade_id: String((body.paymentId as string) || ''),
        }).eq('id', order.id)
      }

      // 付款即綁卡：從通知或覆核結果取 cardToken 存進該會員
      if (paid && order.member_id) {
        const info = extractCardInfo(body) || (inqData ? extractCardInfo(inqData) : null)
        if (info) await saveMemberAntomCard(order.member_id, info)
      }
    }
  }

  // Antom 要求固定回覆此格式代表已收妥，否則會重試
  return NextResponse.json(ACK)
}
