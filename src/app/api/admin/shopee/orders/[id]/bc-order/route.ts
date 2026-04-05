import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRechargeOrder } from '@/lib/billionconnect'
import { generateSubOrderId, generateSkuId } from '@/lib/utils'

// POST — 批次送出 BC 訂單
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: items } = await supabase.from('shopee_order_items')
    .select('*').eq('shopee_order_id', id).in('status', ['matched', 'iccid_filled'])

  if (!items || items.length === 0) return NextResponse.json({ error: '無可下單的商品' }, { status: 400 })

  // 蝦皮訂單全部是 SIM → F007（帶 ICCID）
  const results: { item_id: string; bc_order_id?: string; error?: string }[] = []

  const itemsWithIccid = items.filter(i => i.iccid && (i.iccid as string[]).length > 0)
  const itemsNoIccid = items.filter(i => !i.iccid || (i.iccid as string[]).length === 0)

  // 沒有 ICCID 的商品無法下單
  for (const item of itemsNoIccid) {
    results.push({ item_id: item.id, error: '請先填入 ICCID' })
  }

  if (itemsWithIccid.length > 0) {
    const channelOrderId = generateSubOrderId('sim')
    const subOrderList = itemsWithIccid.map((item, idx) => ({
      channelSubOrderId: generateSkuId(channelOrderId, idx + 1),
      iccid: item.iccid as string[],
      skuId: item.bc_sku_id,
      copies: item.matched_copies || '1',
    }))

    try {
      console.log('[BC F007] channelOrderId:', channelOrderId, 'subOrderList:', JSON.stringify(subOrderList))
      const bcResult = await createRechargeOrder({ channelOrderId, subOrderList })
      console.log('[BC F007] result:', JSON.stringify(bcResult))
      for (let i = 0; i < itemsWithIccid.length; i++) {
        const bcSub = bcResult.subOrderList?.[i]
        await supabase.from('shopee_order_items').update({
          bc_order_id: bcResult.orderId,
          bc_sub_order_id: bcSub?.subOrderId || null,
          status: 'bc_ordered',
        }).eq('id', itemsWithIccid[i].id)
        results.push({ item_id: itemsWithIccid[i].id, bc_order_id: bcResult.orderId })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'F007 失敗'
      console.error('[BC F007] error:', msg)
      for (const item of itemsWithIccid) {
        results.push({ item_id: item.id, error: msg })
      }
    }
  }

  // 更新訂單狀態
  await supabase.from('shopee_orders').update({
    internal_status: 'processing', updated_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ results })
}
