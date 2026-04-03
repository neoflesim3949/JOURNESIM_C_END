import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { createEsimOrder, createRechargeOrder } from '@/lib/billionconnect'


// POST — 批次儲存 ICCID 並送出 BC 訂單
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId } = await params
  const { sub_order_id } = await request.json()

  const supabase = createAdminClient()

  // 取得子訂單
  const { data: subOrder } = await supabase.from('sub_orders')
    .select('*').eq('id', sub_order_id).single()
  if (!subOrder) return NextResponse.json({ error: '子訂單不存在' }, { status: 404 })

  // 已有 BC 訂單號的跳過
  if (subOrder.bc_order_id) {
    return NextResponse.json({ error: '此子訂單已送出 BC 訂單', bc_order_id: subOrder.bc_order_id }, { status: 400 })
  }

  // 取得所有 SKU
  const { data: skus } = await supabase.from('order_skus')
    .select('*').eq('sub_order_id', sub_order_id)
  if (!skus || skus.length === 0) return NextResponse.json({ error: '無 SKU 資料' }, { status: 400 })

  // 檢查是否所有 SKU 都有 ICCID
  const isSim = subOrder.category === 'sim'
  const isEsim = subOrder.category === 'esim'

  if (isSim) {
    // SIM: F007 — 充值訂單（帶 ICCID）
    // 組裝 subOrderList
    const subOrderList = skus.map((sku) => {
      const iccids = (sku.sim_iccid as string[]) || []
      if (iccids.length === 0) return null
      return {
        channelSubOrderId: sku.sku_number || sku.id,
        iccid: iccids,
        skuId: sku.bc_sku_id,
        copies: sku.copies,
      }
    }).filter(Boolean) as { channelSubOrderId: string; iccid: string[]; skuId: string; copies: string }[]

    if (subOrderList.length === 0) {
      return NextResponse.json({ error: '請先填入所有 SIM 卡 ICCID' }, { status: 400 })
    }

    try {
      const bcResult = await createRechargeOrder({
        channelOrderId: subOrder.sub_order_number,
        totalAmount: String(subOrder.subtotal),
        subOrderList,
      })

      // 更新子訂單
      await supabase.from('sub_orders').update({
        bc_order_id: bcResult.orderId,
        status: 'processing',
        updated_at: new Date().toISOString(),
      }).eq('id', sub_order_id)

      // 更新 SKU 的 BC 子訂單號
      for (const bcSub of bcResult.subOrderList || []) {
        await supabase.from('order_skus').update({
          bc_sub_order_id: bcSub.subOrderId,
          status: 'processing',
        }).eq('sku_number', bcSub.channelSubOrderId)
      }

      return NextResponse.json({ ok: true, bc_order_id: bcResult.orderId })
    } catch (err) {
      console.error('BC SIM order failed:', err)
      return NextResponse.json({ error: `BC API 錯誤：${err instanceof Error ? err.message : JSON.stringify(err)}` }, { status: 500 })
    }
  }

  if (isEsim) {
    // eSIM: F040 — 重新送出（如果之前失敗）
    const subOrderList = skus.map((sku) => ({
      channelSubOrderId: sku.sku_number || sku.id,
      deviceSkuId: sku.bc_sku_id,
      planSkuCopies: sku.copies,
      number: String(sku.quantity),
    }))

    try {
      const bcResult = await createEsimOrder({
        channelOrderId: subOrder.sub_order_number,
        totalAmount: String(subOrder.subtotal),
        subOrderList,
      })

      await supabase.from('sub_orders').update({
        bc_order_id: bcResult.orderId,
        status: 'processing',
        updated_at: new Date().toISOString(),
      }).eq('id', sub_order_id)

      for (const bcSub of bcResult.subOrderList || []) {
        await supabase.from('order_skus').update({
          bc_sub_order_id: bcSub.subOrderId,
          status: 'processing',
        }).eq('sku_number', bcSub.channelSubOrderId)
      }

      return NextResponse.json({ ok: true, bc_order_id: bcResult.orderId })
    } catch (err) {
      console.error('BC eSIM order failed:', err)
      return NextResponse.json({ error: `BC API 錯誤：${err instanceof Error ? err.message : JSON.stringify(err)}` }, { status: 500 })
    }
  }

  return NextResponse.json({ error: '未知的子訂單類型' }, { status: 400 })
}
