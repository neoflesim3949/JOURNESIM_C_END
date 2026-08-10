import type { SupabaseClient } from '@supabase/supabase-js'

// F017 售後成功後生成「售後訂單」紀錄（bc_aftersales）
// 退回成本推算：依渠道單號找蝦皮品項，交集 ICCID → 單卡成本 × 退卡張數
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordBcAftersale(supabase: SupabaseClient<any>, params: {
  afterSaleId?: string | null
  channelOrderId: string
  channelSubOrderId?: string | null
  iccids: string[]
  reason: string
  source: string
}) {
  try {
    const { data: items } = await supabase.from('shopee_order_items')
      .select('id, shopee_order_id, cost_cny, cost_twd, iccid')
      .eq('bc_channel_order_id', params.channelOrderId)
    let refundCny = 0, refundTwd = 0, matched = 0
    let shopeeOrderId: string | null = null
    const set = new Set(params.iccids)
    for (const it of items || []) {
      const arr = Array.isArray(it.iccid) ? (it.iccid as string[]) : []
      const n = arr.filter(ic => set.has(ic)).length
      if (n > 0) {
        matched += n
        refundCny += n * (Number(it.cost_cny) || 0)
        refundTwd += n * (Number(it.cost_twd) || 0)
        if (!shopeeOrderId) shopeeOrderId = it.shopee_order_id
      }
    }
    // 品項沒記 ICCID 時退而求其次：關聯到該渠道單的訂單，成本不推算（留空）
    if (!shopeeOrderId && items?.length) shopeeOrderId = items[0].shopee_order_id

    const { error } = await supabase.from('bc_aftersales').insert({
      after_sale_id: params.afterSaleId || null,
      channel_order_id: params.channelOrderId,
      channel_sub_order_id: params.channelSubOrderId || null,
      shopee_order_id: shopeeOrderId,
      iccids: params.iccids,
      card_count: params.iccids.length,
      reason: params.reason,
      refund_cny: matched > 0 ? refundCny : null,
      refund_twd: matched > 0 ? refundTwd : null,
      source: params.source,
    })
    if (error) console.error('[售後訂單] 寫入失敗:', error.message)
  } catch (e) {
    // 紀錄失敗不影響售後主流程（F017 已成功）
    console.error('[售後訂單] 例外:', e)
  }
}
