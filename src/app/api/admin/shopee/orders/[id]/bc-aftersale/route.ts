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
    const result = await createAfterSale({
      channelOrderId,
      channelSubOrderId,
      reason,
      iccid: (item.iccid as string[]) || [],
      refundType: '0', // 自動退款
    })
    console.log('[BC F017] afterSaleId:', result.afterSaleId)

    // 清除系統內 BC 訂單記錄，回到 matched 狀態
    await supabase.from('shopee_order_items').update({
      bc_order_id: null,
      bc_sub_order_id: null,
      bc_channel_order_id: null,
      bc_channel_sub_order_id: null,
      iccid: null,
      cost_cny: null,
      cost_twd: null,
      status: 'matched',
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
