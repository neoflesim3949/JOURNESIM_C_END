import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrderInfo } from '@/lib/billionconnect'

// POST — 透過 BC F011 撈回訂單資訊並回填到品項
// body: { channelOrderId, channelSubOrderId? }
// 若帶 channelSubOrderId 則只取該 sub；否則取第一個 sub
export async function POST(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, itemId } = await params
  const body = await request.json()
  const supabase = createAdminClient()

  const { data: item } = await supabase.from('shopee_order_items')
    .select('id, shopee_order_id, bc_order_id, bc_channel_order_id, bc_channel_sub_order_id')
    .eq('id', itemId).single()
  if (!item || item.shopee_order_id !== id) {
    return NextResponse.json({ error: '找不到品項' }, { status: 404 })
  }

  // 優先使用 BC orderId（用戶提供或既有），其次 channelOrderId
  const orderId = (body.orderId || item.bc_order_id || '').trim()
  const channelOrderId = (body.channelOrderId || item.bc_channel_order_id || '').trim()
  if (!orderId && !channelOrderId) {
    return NextResponse.json({ error: '請提供 BC orderId 或 channelOrderId' }, { status: 400 })
  }

  let bcOrder
  try {
    bcOrder = await getOrderInfo(orderId ? { orderId } : { channelOrderId })
  } catch (err) {
    return NextResponse.json({ error: 'BC 查詢失敗：' + (err instanceof Error ? err.message : String(err)) }, { status: 500 })
  }

  if (!bcOrder?.subOrderList?.length) {
    return NextResponse.json({ error: 'BC 訂單沒有子單資料' }, { status: 400 })
  }

  const targetSubId = (body.channelSubOrderId || item.bc_channel_sub_order_id || '').trim()
  const sub = targetSubId
    ? bcOrder.subOrderList.find(s => s.channelSubOrderId === targetSubId)
    : bcOrder.subOrderList[0]
  if (!sub) {
    return NextResponse.json({ error: '找不到對應的子單', subOrderList: bcOrder.subOrderList }, { status: 404 })
  }

  const iccids = Array.isArray(sub.iccid) ? sub.iccid : sub.iccid ? [sub.iccid] : null

  const { error } = await supabase.from('shopee_order_items').update({
    bc_order_id: bcOrder.orderId,
    bc_sub_order_id: sub.subOrderId,
    bc_channel_order_id: bcOrder.channelOrderId || channelOrderId || null,
    bc_channel_sub_order_id: sub.channelSubOrderId,
    iccid: iccids,
    status: 'bc_ordered',
  }).eq('id', itemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    orderId: bcOrder.orderId,
    subOrderId: sub.subOrderId,
    channelSubOrderId: sub.channelSubOrderId,
    iccid: iccids,
    note: 'F011 不回傳 QR/LPA，eSIM 仍需手動填寫或等 N009 通知',
  })
}
