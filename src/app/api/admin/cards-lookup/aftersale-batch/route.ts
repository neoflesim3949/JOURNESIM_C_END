import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAfterSale, getOrderInfo } from '@/lib/billionconnect'
import { recordBcAftersale } from '@/lib/aftersale-record'

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

  // 1) 補齊 channelOrderId
  //    優先順序：item.channelOrderId → 從 channelSubOrderId 去尾數字還原 → F011(orderId) 反查
  const orderIdToChannel = new Map<string, string>()
  const needsLookup = items.filter(i => {
    if (i.channelOrderId) return false
    if (i.channelSubOrderId && /[SE]\d+$/.test(i.channelSubOrderId)) return false
    return !!i.orderId
  }).map(i => i.orderId!)
  const uniqueOrderIds = [...new Set(needsLookup)]
  for (const oid of uniqueOrderIds) {
    try {
      const info = await getOrderInfo({ orderId: oid })
      if (info?.channelOrderId) orderIdToChannel.set(oid, info.channelOrderId)
    } catch {
      // 忽略，後面該 item 會標 error
    }
  }

  // 2) 依「子單(channelSubOrderId)」分組 —— BC 的 F017 是「子單層級」，每個子單一次呼叫且必須帶 channelSubOrderId。
  //    （舊版依 channelOrderId 分組，同主單多子單時會省略 channelSubOrderId、又塞多張卡 → BC 回 1003 Parameter error）
  type Grp = { channelOrderId: string; channelSubOrderId?: string; iccids: string[] }
  const groups = new Map<string, Grp>()
  const failed: { iccid: string; error: string }[] = []
  for (const it of items) {
    // 還原 channelOrderId：item 直接給 → 由子單去尾數字 → F011(orderId) 反查
    let cOrder = it.channelOrderId
    if (!cOrder && it.channelSubOrderId && /[SE]\d+$/.test(it.channelSubOrderId)) {
      cOrder = it.channelSubOrderId.replace(/\d+$/, '')
    }
    if (!cOrder && it.orderId) cOrder = orderIdToChannel.get(it.orderId)
    if (!cOrder) {
      failed.push({ iccid: it.iccid, error: '缺 channelOrderId 且 F011 反查失敗' })
      continue
    }
    // 分組鍵：有子單 → 以「子單」為單位（BC F017 的單位，必帶 channelSubOrderId）；無子單 → 退回「主單」一組
    const sub = it.channelSubOrderId || undefined
    const key = sub ? `S:${sub}` : `O:${cOrder}`
    if (!groups.has(key)) groups.set(key, { channelOrderId: cOrder, channelSubOrderId: sub, iccids: [] })
    const g = groups.get(key)!
    if (!g.iccids.includes(it.iccid)) g.iccids.push(it.iccid)
  }

  // 3) 每個子單打一次 F017（帶 channelOrderId + channelSubOrderId + 該子單的 iccid）
  const results: { channelOrderId: string; channelSubOrderId?: string; iccids: string[]; ok: boolean; afterSaleId?: string; error?: string }[] = []
  for (const g of groups.values()) {
    try {
      const r = await createAfterSale({
        channelOrderId: g.channelOrderId,
        channelSubOrderId: g.channelSubOrderId,
        reason,
        iccid: g.iccids,
        refundType: '0',
        unSubscribeFlow: '1',
        returnCardOrNot: '0',
        receivingState: '1',
      })
      results.push({ channelOrderId: g.channelOrderId, channelSubOrderId: g.channelSubOrderId, iccids: g.iccids, ok: true, afterSaleId: r.afterSaleId })
      // 生成售後訂單（含退回成本推算），不影響主流程
      await recordBcAftersale(createAdminClient(), {
        afterSaleId: r.afterSaleId, channelOrderId: g.channelOrderId, channelSubOrderId: g.channelSubOrderId,
        iccids: g.iccids, reason, source: String(body.source || 'cards_lookup'),
      })
    } catch (err) {
      results.push({ channelOrderId: g.channelOrderId, channelSubOrderId: g.channelSubOrderId, iccids: g.iccids, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({ results, failed })
}
