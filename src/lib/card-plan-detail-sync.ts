import { getPlanUsage, getDailyTraffic, getOrderInfo } from './billionconnect'

// 時區統一：所有下單時間存成「+8 牆鐘」naive（跟 BC 的 plan_start_time 同基準）
//  - 帶時區（Z 或 ±hh:mm）→ 轉成 +8 牆鐘再去掉時區
//  - 沒帶時區（naive）→ 視為已是 +8，原樣（僅正規化格式）
function toPlus8Naive(input: string | null | undefined): string | null {
  if (!input) return null
  const s = String(input).trim()
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const utc8 = new Date(new Date(s).getTime() + 8 * 3600000)
    if (isNaN(utc8.getTime())) return null
    return utc8.toISOString().replace('T', ' ').slice(0, 19)
  }
  return s.replace('T', ' ').slice(0, 19)
}
// 蝦皮 order_date 來自我們 DB（已用 +8 牆鐘存成 timestamptz，回傳帶 +00）：
// 直接去掉時區保留牆鐘 = 原本的 +8 牆鐘（不可再 +8，否則會多加一次）
function stripTz(input: string | null | undefined): string | null {
  if (!input) return null
  return String(input).replace('T', ' ').replace(/(Z|[+-]\d{2}:?\d{2})$/, '').slice(0, 19)
}

// 依 ICCID 打 BC F012，把每個 subOrder（方案）寫進 card_plans（一卡×一方案一列）
// 同時對「有啟用的卡」打 F023，把日流量寫進 card_usage_daily（同步方案時一併撈使用量）
// 重要：不寫回 manual_iccids（避免與卡片管理的 F010/F012 同步互相干擾）；
//       同步當下把 F010 卡狀態記成 card_plans.card_status 快照，供「要不要再撈」判斷用自己這份。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncCardPlanDetails(supabase: any, iccids: string[]): Promise<{ cards: number; plans: number; usage: number }> {
  const uniq = [...new Set(iccids.map(s => String(s || '').trim()).filter(Boolean))]
  if (uniq.length === 0) return { cards: 0, plans: 0, usage: 0 }
  const syncedAt = new Date().toISOString()
  const today = new Date().toISOString().slice(0, 10)

  // 取同步當下的 F010 卡狀態（快照用）
  const statusByIccid = new Map<string, string | null>()
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await supabase.from('manual_iccids').select('iccid, card_status').in('iccid', uniq.slice(i, i + 300))
    for (const m of data || []) statusByIccid.set(m.iccid, m.card_status)
  }
  // sku → plan_type（總量型/單日型）快照用；先查完整清單較省（bc_products 有限）
  const planTypeBySku = new Map<string, string | null>()
  {
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('bc_products').select('sku_id, plan_type').range(from, from + 999)
      if (!data || data.length === 0) break
      for (const p of data) planTypeBySku.set(p.sku_id, p.plan_type)
      if (data.length < 1000) break
    }
  }

  // 下單時間（優先蝦皮購買時間）：iccid → 最早 order_date
  //   鏈路：shopee_orders(id, order_date) → shopee_order_items(shopee_order_id, iccid[])
  const shopeeTimeByIccid = new Map<string, string>()
  {
    const odById = new Map<string, string>()
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('shopee_orders').select('id, order_date').range(from, from + 999)
      if (!data || data.length === 0) break
      for (const o of data) if (o.order_date) odById.set(o.id, o.order_date as string)
      if (data.length < 1000) break
    }
    const want = new Set(uniq)
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('shopee_order_items').select('shopee_order_id, iccid').not('iccid', 'is', null).range(from, from + 999)
      if (!data || data.length === 0) break
      for (const it of data) {
        const od = it.shopee_order_id ? odById.get(it.shopee_order_id) : undefined
        if (!od) continue
        const arr = Array.isArray(it.iccid) ? (it.iccid as string[]) : []
        for (const ic of arr) {
          if (!want.has(ic)) continue
          const prev = shopeeTimeByIccid.get(ic)
          if (!prev || od < prev) shopeeTimeByIccid.set(ic, od)
        }
      }
      if (data.length < 1000) break
    }
  }
  // BC 建單時間快取（F011，僅在沒有蝦皮時間時才撈；依 channelOrderId 去重）
  const bcOrderTimeCache = new Map<string, Promise<string | null>>()
  const fetchBcOrderTime = (coid: string): Promise<string | null> => {
    let p = bcOrderTimeCache.get(coid)
    if (!p) { p = getOrderInfo({ channelOrderId: coid }).then(info => info?.createTime || null).catch(() => null); bcOrderTimeCache.set(coid, p) }
    return p
  }

  let cards = 0, plans = 0, usage = 0
  const concurrency = 5
  let i = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < uniq.length) {
      const ic = uniq[i++]
      const cardStatus = statusByIccid.get(ic) ?? null
      try {
        const orders = await getPlanUsage({ iccid: ic })
        const rows: Record<string, unknown>[] = []
        const startDates: string[] = []   // 收集啟用/到期日，算 F023 區間
        const endDates: string[] = []
        for (const o of orders || []) {
          for (const s of o.subOrderList || []) {
            if (!s.subOrderId) continue
            const st = s.planStatus != null ? String(s.planStatus) : null
            if (s.planStartTime) startDates.push(String(s.planStartTime).slice(0, 10))
            if (s.planEndTime) endDates.push(String(s.planEndTime).slice(0, 10))
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
              plan_type: s.skuId ? (planTypeBySku.get(s.skuId) ?? null) : null,
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
        // 下單時間：有蝦皮購買時間就用蝦皮，否則用 BC 建單時間（F011）
        if (rows.length > 0) {
          const shopeeTime = shopeeTimeByIccid.get(ic)
          if (shopeeTime) {
            const t = stripTz(shopeeTime)   // 蝦皮：保留 +8 牆鐘
            for (const r of rows) { r.order_time = t; r.order_time_source = 'shopee' }
          } else {
            const coids = [...new Set(rows.map(r => r.channel_order_id).filter(Boolean) as string[])]
            const timeByCoid = new Map<string, string | null>()
            await Promise.all(coids.map(async c => { timeByCoid.set(c, toPlus8Naive(await fetchBcOrderTime(c))) }))
            for (const r of rows) {
              const t = r.channel_order_id ? (timeByCoid.get(r.channel_order_id as string) || null) : null
              r.order_time = t
              r.order_time_source = t ? 'bc' : null
            }
          }
        }
        if (rows.length > 0) {
          const { error } = await supabase.from('card_plans').upsert(rows, { onConflict: 'iccid,sub_order_id' })
          if (!error) plans += rows.length
        }
        // 記「撈過了」（含 subs=0 的已開卡）→ 不再被當「從沒撈過」重複撈
        await supabase.from('card_plan_sync_state').upsert(
          { iccid: ic, synced_at: syncedAt, plan_count: rows.length }, { onConflict: 'iccid' })
        cards++

        // 有啟用 → 順帶撈使用量（F023），區間＝最早啟用 ~ min(最晚到期, 今天)
        if (startDates.length > 0) {
          const begin = startDates.sort()[0]
          const maxEnd = endDates.length ? endDates.sort()[endDates.length - 1] : today
          const end = maxEnd > today ? today : maxEnd
          if (begin <= end) {
            try {
              const items = await getDailyTraffic({ iccid: ic, beginDate: begin, endDate: end })
              const uRows = (items || []).map(it => ({
                iccid: ic,
                used_date: (it.usedDate || '').slice(0, 10) || null,
                country: it.country || null,
                country_region_code: it.countryRegionCode || null,
                type: it.type || null,
                used_amount: it.usedAmount != null && it.usedAmount !== '' ? Number(it.usedAmount) : null,
                synced_at: syncedAt,
              })).filter(r => r.used_date)
              if (uRows.length > 0) {
                const { error } = await supabase.from('card_usage_daily').upsert(uRows, { onConflict: 'iccid,used_date,country_region_code' })
                if (!error) usage += uRows.length
              }
            } catch {
              // F023 單筆失敗略過
            }
          }
        }
      } catch {
        // 單筆失敗略過，不阻斷整批
      }
    }
  }))
  return { cards, plans, usage }
}
