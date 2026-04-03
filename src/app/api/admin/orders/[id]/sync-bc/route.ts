import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrderInfo } from '@/lib/billionconnect'


// POST — 手動從 BC F011 同步訂單狀態
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId } = await params
  const supabase = createAdminClient()

  // 取得所有子訂單
  const { data: subOrders } = await supabase.from('sub_orders')
    .select('*').eq('order_id', orderId)

  if (!subOrders || subOrders.length === 0) {
    return NextResponse.json({ error: '無子訂單' }, { status: 404 })
  }

  const results: { sub_order_number: string; status: string; synced: boolean; error?: string }[] = []

  for (const sub of subOrders) {
    if (!sub.sub_order_number) continue

    try {
      const bcData = await getOrderInfo(sub.sub_order_number)

      // 更新子訂單 BC 訂單號
      await supabase.from('sub_orders').update({
        bc_order_id: bcData.orderId,
        updated_at: new Date().toISOString(),
      }).eq('id', sub.id)

      // 更新每個 SKU
      for (const bcSub of bcData.subOrderList || []) {
        const updates: Record<string, unknown> = {
          bc_sub_order_id: bcSub.subOrderId,
        }

        // eSIM: 回填 ICCID
        if (sub.category === 'esim' && bcSub.iccid && bcSub.iccid.length > 0) {
          updates.iccid = bcSub.iccid
          updates.status = 'completed'
        }

        // SIM: 回填 ICCID
        if (sub.category === 'sim' && bcSub.iccid && bcSub.iccid.length > 0) {
          updates.sim_iccid = bcSub.iccid
        }

        await supabase.from('order_skus').update(updates)
          .eq('sku_number', bcSub.channelSubOrderId)
      }

      results.push({ sub_order_number: sub.sub_order_number, status: 'ok', synced: true })
    } catch (err) {
      results.push({
        sub_order_number: sub.sub_order_number,
        status: 'error',
        synced: false,
        error: err instanceof Error ? err.message : JSON.stringify(err),
      })
    }
  }

  return NextResponse.json({ results })
}
