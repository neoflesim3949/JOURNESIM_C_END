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
    .select('*').eq('shopee_order_id', id).in('status', ['matched', 'iccid_filled']).is('bc_order_id', null)

  if (!items || items.length === 0) return NextResponse.json({ error: '無可下單的商品' }, { status: 400 })

  // 查詢成本價（從 bc_products.prices + 匯率）
  const skuIds = [...new Set(items.map(i => i.bc_sku_id).filter(Boolean))]
  const { data: bcProducts } = await supabase.from('bc_products').select('sku_id, prices').in('sku_id', skuIds)
  const bcPriceMap = new Map((bcProducts || []).map(p => [p.sku_id, p.prices as { copies: string; settlementPrice: string }[] | null]))
  const { data: rateRow } = await supabase.from('exchange_rates').select('rate').eq('currency', 'CNY').single()
  const cnyRate = rateRow ? Number(rateRow.rate) : 0.2128

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
      console.log('========== [BC F007 送出訂單] ==========')
      console.log('[BC F007] 蝦皮訂單ID:', id)
      console.log('[BC F007] channelOrderId:', channelOrderId)
      console.log('[BC F007] subOrderList:', JSON.stringify(subOrderList, null, 2))
      const bcResult = await createRechargeOrder({ channelOrderId, subOrderList })
      console.log('[BC F007] 回傳結果:', JSON.stringify(bcResult, null, 2))
      for (let i = 0; i < itemsWithIccid.length; i++) {
        const bcSub = bcResult.subOrderList?.[i]
        const item = itemsWithIccid[i]
        // 計算成本價
        const prices = bcPriceMap.get(item.bc_sku_id) || []
        const matchedPrice = prices?.find(p => p.copies === (item.matched_copies || '1'))
        const costCny = matchedPrice ? Number(matchedPrice.settlementPrice) || 0 : 0
        const costTwd = Math.ceil(costCny / cnyRate)
        const saveData = {
          bc_order_id: bcResult.orderId,
          bc_sub_order_id: bcSub?.subOrderId || null,
          bc_channel_order_id: channelOrderId,
          bc_channel_sub_order_id: subOrderList[i].channelSubOrderId,
          cost_cny: costCny,
          cost_twd: costTwd,
        }
        console.log(`[BC F007] 儲存 item[${i}]:`, JSON.stringify(saveData))
        await supabase.from('shopee_order_items').update({
          ...saveData,
          status: 'bc_ordered',
        }).eq('id', item.id)
        results.push({ item_id: itemsWithIccid[i].id, bc_order_id: bcResult.orderId })
      }
      console.log('========== [BC F007 完成] ==========')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'F007 失敗'
      console.error('[BC F007] error:', msg)
      for (const item of itemsWithIccid) {
        results.push({ item_id: item.id, error: msg })
      }
    }
  }

  // 重新查詢所有商品，判斷訂單狀態
  const { data: allItems } = await supabase.from('shopee_order_items')
    .select('iccid, bc_order_id').eq('shopee_order_id', id)
  const allDone = (allItems || []).every(i => i.bc_order_id && i.iccid && (i.iccid as string[]).length > 0)

  await supabase.from('shopee_orders').update({
    internal_status: allDone ? 'completed' : 'processing',
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ results })
}
