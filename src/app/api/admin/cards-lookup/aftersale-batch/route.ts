import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAfterSale, getOrderInfo } from '@/lib/billionconnect'

// POST — 批次售後：依 channelOrderId 分組，每組打一次 F017
// body: {
//   items: [{ iccid, channelSubOrderId?, channelOrderId?, orderId? }, ...],
//   reason: string
// }
// 沒給 channelOrderId 但有 orderId 會先用 F011 反查
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const reason = String(body.reason || '').trim()
  const items: { iccid: string; channelSubOrderId?: string; channelOrderId?: string; orderId?: string }[] = Array.isArray(body.items) ? body.items : []
  if (!reason) return NextResponse.json({ error: '請輸入原因代碼' }, { status: 400 })
  if (items.length === 0) return NextResponse.json({ error: '請至少選擇一張卡' }, { status: 400 })

  // 1) 補齊 channelOrderId（用 orderId 反查 F011）
  const orderIdToChannel = new Map<string, string>()
  const needsLookup = items.filter(i => !i.channelOrderId && i.orderId).map(i => i.orderId!)
  const uniqueOrderIds = [...new Set(needsLookup)]
  for (const oid of uniqueOrderIds) {
    try {
      const info = await getOrderInfo({ orderId: oid })
      if (info?.channelOrderId) orderIdToChannel.set(oid, info.channelOrderId)
    } catch {
      // 忽略，後面該 item 會標 error
    }
  }

  // 2) 依 channelOrderId 分組
  const groups = new Map<string, { iccids: string[]; channelSubOrderIds: Set<string>; sourceItems: typeof items }>()
  const failed: { iccid: string; error: string }[] = []
  for (const it of items) {
    let cOrder = it.channelOrderId
    if (!cOrder && it.orderId) cOrder = orderIdToChannel.get(it.orderId)
    if (!cOrder) {
      failed.push({ iccid: it.iccid, error: '缺 channelOrderId 且 F011 反查失敗' })
      continue
    }
    if (!groups.has(cOrder)) groups.set(cOrder, { iccids: [], channelSubOrderIds: new Set(), sourceItems: [] })
    const g = groups.get(cOrder)!
    if (!g.iccids.includes(it.iccid)) g.iccids.push(it.iccid)
    if (it.channelSubOrderId) g.channelSubOrderIds.add(it.channelSubOrderId)
    g.sourceItems.push(it)
  }

  // 3) 每組打一次 F017
  const results: { channelOrderId: string; iccids: string[]; ok: boolean; afterSaleId?: string; error?: string }[] = []
  for (const [channelOrderId, g] of groups) {
    try {
      // 若該組僅來自單一子單，帶上 channelSubOrderId（更精準）；多子單就不帶
      const channelSubOrderId = g.channelSubOrderIds.size === 1 ? [...g.channelSubOrderIds][0] : undefined
      const r = await createAfterSale({
        channelOrderId,
        channelSubOrderId,
        reason,
        iccid: g.iccids,
        refundType: '0',
        unSubscribeFlow: '1',
        returnCardOrNot: '0',
        receivingState: '1',
      })
      results.push({ channelOrderId, iccids: g.iccids, ok: true, afterSaleId: r.afterSaleId })
    } catch (err) {
      results.push({ channelOrderId, iccids: g.iccids, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({ results, failed })
}
