import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRechargeOrder, createEsimOrder } from '@/lib/billionconnect'
import { generateSubOrderId, generateSkuId } from '@/lib/utils'

// POST — 批次送出 BC 訂單
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: items } = await supabase.from('shopee_order_items')
    .select('*').eq('shopee_order_id', id).in('status', ['matched', 'iccid_filled']).is('bc_order_id', null)

  if (!items || items.length === 0) return NextResponse.json({ error: '無可下單的商品' }, { status: 400 })

  // 註：qty>1 的 eSIM 不再拆單 —— F040 以 number=quantity 一次跟 BC 要多張，
  //     N009 webhook 會把多張卡聚合進同一筆的 esim_cards（各張獨立 ICCID/QR/LPA）

  // 查詢成本價（從 bc_products.prices + 匯率）
  const skuIds = [...new Set(items.map(i => i.bc_sku_id).filter(Boolean))]
  const { data: bcProducts } = await supabase.from('bc_products').select('sku_id, prices').in('sku_id', skuIds)
  const bcPriceMap = new Map((bcProducts || []).map(p => [p.sku_id, p.prices as { copies: string; settlementPrice: string }[] | null]))
  const { data: rateRow } = await supabase.from('exchange_rates').select('rate').eq('currency', 'CNY').single()
  const cnyRate = rateRow ? Number(rateRow.rate) : 0.2128

  const results: { item_id: string; bc_order_id?: string; error?: string }[] = []

  // 依 delivery_type 分流：SIM → F007（儲值，需 ICCID）；eSIM → F040（新建 eSIM，不需 ICCID）
  const simItems = items.filter(i => (i.delivery_type || 'sim') === 'sim')
  const esimItems = items.filter(i => i.delivery_type === 'esim')

  // SIM 需要 ICCID
  const simWithIccid = simItems.filter(i => i.iccid && (i.iccid as string[]).length > 0)
  const simNoIccid = simItems.filter(i => !i.iccid || (i.iccid as string[]).length === 0)
  for (const item of simNoIccid) {
    results.push({ item_id: item.id, error: '請先填入 ICCID' })
  }

  // ===== SIM → F007 =====
  if (simWithIccid.length > 0) {
    const channelOrderId = generateSubOrderId('sim')
    const subOrderList = simWithIccid.map((item, idx) => ({
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
      for (let i = 0; i < simWithIccid.length; i++) {
        const bcSub = bcResult.subOrderList?.[i]
        const item = simWithIccid[i]
        const prices = bcPriceMap.get(item.bc_sku_id) || []
        const matchedPrice = prices?.find(p => p.copies === (item.matched_copies || '1'))
        // SIM 實體卡固定 +¥3 運費/手續費
        const baseCny = matchedPrice ? Number(matchedPrice.settlementPrice) || 0 : 0
        const computedCny = baseCny > 0 ? baseCny + 3 : 0
        // 已在綁定時快照成本 → 沿用，不被 BC 現價覆蓋
        const costCny = item.cost_cny != null ? Number(item.cost_cny) : computedCny
        const costTwd = item.cost_twd != null ? Number(item.cost_twd) : Math.ceil(costCny / cnyRate)
        await supabase.from('shopee_order_items').update({
          bc_order_id: bcResult.orderId,
          bc_sub_order_id: bcSub?.subOrderId || null,
          bc_channel_order_id: channelOrderId,
          bc_channel_sub_order_id: subOrderList[i].channelSubOrderId,
          cost_cny: costCny,
          cost_twd: costTwd,
          status: 'bc_ordered',
        }).eq('id', item.id)
        results.push({ item_id: item.id, bc_order_id: bcResult.orderId })
      }
      console.log('========== [BC F007 完成] ==========')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'F007 失敗'
      console.error('[BC F007] error:', msg)
      for (const item of simWithIccid) {
        results.push({ item_id: item.id, error: msg })
      }
    }
  }

  // ===== eSIM → F040 =====
  // BC 對 F040 有「超过子订单数量」限制，因此一張 BC 訂單只送一個 eSIM 品項
  // 每個品項各拿一個獨立的 channelOrderId，N009 webhook 會依 channelSubOrderId 回填 QR/LPA
  for (const item of esimItems) {
    const channelOrderId = generateSubOrderId('esim')
    const channelSubOrderId = generateSkuId(channelOrderId, 1)
    const subOrderList = [{
      channelSubOrderId,
      deviceSkuId: item.bc_sku_id as string,
      planSkuCopies: item.matched_copies || '1',
      number: String(item.quantity || 1),
    }]
    try {
      console.log('========== [BC F040 送出 eSIM 訂單] ==========')
      console.log('[BC F040] 蝦皮訂單ID:', id, ' item:', item.id)
      console.log('[BC F040] channelOrderId:', channelOrderId)
      console.log('[BC F040] subOrderList:', JSON.stringify(subOrderList, null, 2))
      const bcResult = await createEsimOrder({ channelOrderId, subOrderList })
      console.log('[BC F040] 回傳結果:', JSON.stringify(bcResult, null, 2))
      const bcSub = bcResult.subOrderList?.[0]
      const prices = bcPriceMap.get(item.bc_sku_id) || []
      const matchedPrice = prices?.find(p => p.copies === (item.matched_copies || '1'))
      // 一筆 eSIM 代表 quantity 張卡，成本 ×quantity（取代過往拆成多筆各算一次）
      const unitCny = matchedPrice ? Number(matchedPrice.settlementPrice) || 0 : 0
      const computedCny = unitCny * (item.quantity || 1)
      // 已在綁定時快照成本 → 沿用，不被 BC 現價覆蓋
      const costCny = item.cost_cny != null ? Number(item.cost_cny) : computedCny
      const costTwd = item.cost_twd != null ? Number(item.cost_twd) : Math.ceil(costCny / cnyRate)
      await supabase.from('shopee_order_items').update({
        bc_order_id: bcResult.orderId,
        bc_sub_order_id: bcSub?.subOrderId || null,
        bc_channel_order_id: channelOrderId,
        bc_channel_sub_order_id: channelSubOrderId,
        cost_cny: costCny,
        cost_twd: costTwd,
        status: 'bc_ordered',
      }).eq('id', item.id)
      results.push({ item_id: item.id, bc_order_id: bcResult.orderId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'F040 失敗'
      console.error('[BC F040] error:', msg, ' item:', item.id)
      results.push({ item_id: item.id, error: msg })
    }
  }

  // 重新查詢所有商品，判斷訂單狀態（SIM 需有 ICCID；eSIM 需有 bc_order_id）
  const { data: allItems } = await supabase.from('shopee_order_items')
    .select('iccid, bc_order_id, delivery_type').eq('shopee_order_id', id)
  const allDone = (allItems || []).every(i =>
    i.bc_order_id && (i.delivery_type === 'esim' ? true : (i.iccid && (i.iccid as string[]).length > 0))
  )

  await supabase.from('shopee_orders').update({
    internal_status: allDone ? 'completed' : 'processing',
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ results })
}
