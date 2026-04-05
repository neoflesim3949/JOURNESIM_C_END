import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { createEsimOrder, createRechargeOrder } from '@/lib/billionconnect'
import { generateSubOrderId, generateSkuId } from '@/lib/utils'

// POST — 批次送出 BC 訂單
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: items } = await supabase.from('shopee_order_items')
    .select('*').eq('shopee_order_id', id).in('status', ['matched', 'iccid_filled'])

  if (!items || items.length === 0) return NextResponse.json({ error: '無可下單的商品' }, { status: 400 })

  // 按 eSIM/SIM 分組（通過 bc_sku_id 查 bc_products.type 判斷）
  const skuIds = [...new Set(items.map(i => i.bc_sku_id).filter(Boolean))]
  const { data: bcProducts } = await supabase.from('bc_products').select('sku_id, type, rechargeable_product').in('sku_id', skuIds)
  const bcMap = new Map((bcProducts || []).map(p => [p.sku_id, p]))

  const esimItems = items.filter(i => {
    const bc = bcMap.get(i.bc_sku_id)
    return bc && (['230', '3105', '3106', '250'].includes(bc.type) || bc.rechargeable_product === '1')
  })
  const simItems = items.filter(i => !esimItems.includes(i))

  const results: { item_id: string; bc_order_id?: string; error?: string }[] = []

  // eSIM → F040
  if (esimItems.length > 0) {
    const channelOrderId = generateSubOrderId('esim')
    const subOrderList = esimItems.map((item, idx) => ({
      channelSubOrderId: generateSkuId(channelOrderId, idx + 1),
      deviceSkuId: item.bc_sku_id,
      planSkuCopies: item.matched_copies || '1',
      number: String(item.quantity || 1),
    }))

    try {
      const bcResult = await createEsimOrder({ channelOrderId, subOrderList })
      for (let i = 0; i < esimItems.length; i++) {
        const bcSub = bcResult.subOrderList?.[i]
        await supabase.from('shopee_order_items').update({
          bc_order_id: bcResult.orderId,
          bc_sub_order_id: bcSub?.subOrderId || null,
          status: 'bc_ordered',
        }).eq('id', esimItems[i].id)
        results.push({ item_id: esimItems[i].id, bc_order_id: bcResult.orderId })
      }
    } catch (err) {
      for (const item of esimItems) {
        results.push({ item_id: item.id, error: err instanceof Error ? err.message : 'F040 失敗' })
      }
    }
  }

  // SIM → F007（帶 ICCID）
  if (simItems.length > 0) {
    const itemsWithIccid = simItems.filter(i => i.iccid && (i.iccid as string[]).length > 0)
    if (itemsWithIccid.length > 0) {
      const channelOrderId = generateSubOrderId('sim')
      const subOrderList = itemsWithIccid.map((item, idx) => ({
        channelSubOrderId: generateSkuId(channelOrderId, idx + 1),
        iccid: item.iccid as string[],
        skuId: item.bc_sku_id,
        copies: item.matched_copies || '1',
      }))

      try {
        const bcResult = await createRechargeOrder({ channelOrderId, subOrderList })
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
        for (const item of itemsWithIccid) {
          results.push({ item_id: item.id, error: err instanceof Error ? err.message : 'F007 失敗' })
        }
      }
    }
  }

  // 更新訂單狀態
  await supabase.from('shopee_orders').update({
    internal_status: 'processing', updated_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ results })
}
