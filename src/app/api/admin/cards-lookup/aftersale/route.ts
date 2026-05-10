import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAfterSale, getOrderInfo } from '@/lib/billionconnect'

// POST — 直接以 ICCID + (orderId 或 channelOrderId) 申請售後（F017）
// body: { iccid, channelSubOrderId, channelOrderId?, orderId?, reason }
// 若只給 orderId 會先用 F011 查回 channelOrderId
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const iccid = String(body.iccid || '').trim()
  const reason = String(body.reason || '').trim()
  let channelOrderId = String(body.channelOrderId || '').trim()
  const orderId = String(body.orderId || '').trim()
  const channelSubOrderId = String(body.channelSubOrderId || '').trim() || undefined

  if (!iccid) return NextResponse.json({ error: '缺少 ICCID' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: '請輸入售後原因代碼' }, { status: 400 })
  if (!channelOrderId && !orderId) return NextResponse.json({ error: '缺少 channelOrderId / orderId' }, { status: 400 })

  // 沒給 channelOrderId 就先用 F011 查
  if (!channelOrderId && orderId) {
    try {
      const info = await getOrderInfo({ orderId })
      channelOrderId = info?.channelOrderId || ''
      if (!channelOrderId) return NextResponse.json({ error: 'F011 未回傳 channelOrderId' }, { status: 500 })
    } catch (err) {
      return NextResponse.json({ error: 'F011 查訂單失敗：' + (err instanceof Error ? err.message : String(err)) }, { status: 500 })
    }
  }

  try {
    const result = await createAfterSale({
      channelOrderId,
      channelSubOrderId,
      reason,
      iccid: [iccid],
      refundType: '0',
      unSubscribeFlow: '1',
      returnCardOrNot: '0',
      receivingState: '1',
    })
    return NextResponse.json({ ok: true, afterSaleId: result.afterSaleId })
  } catch (err) {
    return NextResponse.json({ error: 'F017 售後申請失敗：' + (err instanceof Error ? err.message : String(err)) }, { status: 500 })
  }
}
