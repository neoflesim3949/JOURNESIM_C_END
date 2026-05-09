import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAfterSale } from '@/lib/billionconnect'

// POST — 售後申請（F017）+ 清除系統內 BC 訂單記錄
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { item_id, reason } = await request.json()
  if (!item_id || !reason) return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: item } = await supabase.from('shopee_order_items').select('*').eq('id', item_id).single()
  if (!item) return NextResponse.json({ error: '找不到商品明細' }, { status: 404 })
  if (!item.bc_order_id) return NextResponse.json({ error: '此商品未送出 BC 訂單' }, { status: 400 })

  // 呼叫 F017 售後申請
  try {
    const channelOrderId = item.bc_channel_order_id || item.bc_order_id
    const channelSubOrderId = item.bc_channel_sub_order_id || item.bc_sub_order_id || undefined
    const iccid = (item.iccid as string[]) || []
    const afterSaleData = {
      channelOrderId,
      channelSubOrderId,
      reason,
      iccid,
      refundType: '0',
      unSubscribeFlow: '1',
      returnCardOrNot: '0',
      receivingState: '1',
    }
    console.log('========== [BC F017 售後申請] ==========')
    console.log('[BC F017] 蝦皮訂單ID:', id)
    console.log('[BC F017] item_id:', item_id)
    console.log('[BC F017] DB欄位:', JSON.stringify({
      bc_order_id: item.bc_order_id,
      bc_sub_order_id: item.bc_sub_order_id,
      bc_channel_order_id: item.bc_channel_order_id,
      bc_channel_sub_order_id: item.bc_channel_sub_order_id,
      iccid: item.iccid,
      bc_sku_id: item.bc_sku_id,
      matched_copies: item.matched_copies,
    }))
    console.log('[BC F017] 送出參數:', JSON.stringify(afterSaleData))
    const result = await createAfterSale(afterSaleData)
    console.log('[BC F017] 回傳結果:', JSON.stringify(result))
    console.log('========== [BC F017 完成] ==========')

    // 清除系統內 BC 訂單記錄，但保留 ICCID（卡號為實體資產，取消 BC 訂單不代表卡片消失）
    const keepIccid = Array.isArray(item.iccid) && (item.iccid as string[]).length > 0
    await supabase.from('shopee_order_items').update({
      bc_order_id: null,
      bc_sub_order_id: null,
      bc_channel_order_id: null,
      bc_channel_sub_order_id: null,
      cost_cny: null,
      cost_twd: null,
      status: keepIccid ? 'iccid_filled' : 'matched',
    }).eq('id', item_id)

    // 更新訂單狀態
    const { data: allItems } = await supabase.from('shopee_order_items')
      .select('bc_order_id, iccid').eq('shopee_order_id', id)
    const allDone = (allItems || []).every(i => i.bc_order_id && i.iccid && (i.iccid as string[]).length > 0)
    const anyBc = (allItems || []).some(i => i.bc_order_id)
    await supabase.from('shopee_orders').update({
      internal_status: allDone ? 'completed' : anyBc ? 'processing' : 'pending',
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ ok: true, afterSaleId: result.afterSaleId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'F017 售後申請失敗'
    console.error('[BC F017] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
