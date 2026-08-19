import { getPlanUsage } from './billionconnect'

// 依 ICCID 打 BC F012，把每個 subOrder（方案）寫進 card_plans（一卡×一方案一列）
// 重要：不寫回 manual_iccids（避免與卡片管理的 F010/F012 同步互相干擾）；
//       同步當下把 F010 卡狀態記成 card_plans.card_status 快照，供「要不要再撈」判斷用自己這份。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncCardPlanDetails(supabase: any, iccids: string[]): Promise<{ cards: number; plans: number }> {
  const uniq = [...new Set(iccids.map(s => String(s || '').trim()).filter(Boolean))]
  if (uniq.length === 0) return { cards: 0, plans: 0 }
  const syncedAt = new Date().toISOString()

  // 取同步當下的 F010 卡狀態（快照用）
  const statusByIccid = new Map<string, string | null>()
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await supabase.from('manual_iccids').select('iccid, card_status').in('iccid', uniq.slice(i, i + 300))
    for (const m of data || []) statusByIccid.set(m.iccid, m.card_status)
  }

  let cards = 0, plans = 0
  const concurrency = 5
  let i = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < uniq.length) {
      const ic = uniq[i++]
      const cardStatus = statusByIccid.get(ic) ?? null
      try {
        const orders = await getPlanUsage({ iccid: ic })
        const rows: Record<string, unknown>[] = []
        for (const o of orders || []) {
          for (const s of o.subOrderList || []) {
            if (!s.subOrderId) continue
            const st = s.planStatus != null ? String(s.planStatus) : null
            const cd = Array.isArray(s.country) ? s.country : (s.country ? [s.country] : [])
            const countries = [...new Set(cd.map((c: { name?: string; mcc?: string }) => (c?.name || c?.mcc || '').trim()).filter(Boolean))]
            const total = s.totalDays != null && s.totalDays !== '' ? Number(s.totalDays) : null
            rows.push({
              iccid: ic,
              sub_order_id: s.subOrderId,
              order_id: o.orderId || null,
              channel_order_id: o.channelOrderId || null,
              sku_id: s.skuId || null,
              sku_name: s.skuName || null,
              copies: s.copies || null,
              total_days: total,
              plan_status: st,
              plan_start_time: s.planStartTime || null,
              plan_end_time: s.planEndTime || null,
              countries,
              card_status: cardStatus,        // F010 卡狀態快照（統計自己這份，不碰 manual_iccids）
              synced_at: syncedAt,
            })
          }
        }
        if (rows.length > 0) {
          const { error } = await supabase.from('card_plans').upsert(rows, { onConflict: 'iccid,sub_order_id' })
          if (!error) plans += rows.length
        }
        cards++
      } catch {
        // 單筆失敗略過，不阻斷整批
      }
    }
  }))
  return { cards, plans }
}
