import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — 從 BC API Log 重新解析一筆 webhook
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: log } = await supabase.from('bc_api_logs').select('*').eq('id', id).single()
  if (!log) return NextResponse.json({ error: '找不到 log' }, { status: 404 })
  if (log.direction !== 'incoming') {
    return NextResponse.json({ error: '只能重放 webhook（incoming）紀錄' }, { status: 400 })
  }

  const payload = log.request_body as { tradeType?: string; tradeData?: Record<string, unknown> }
  const tradeType = payload?.tradeType || log.trade_type
  const tradeData = payload?.tradeData

  if (!tradeType || !tradeData) {
    return NextResponse.json({ error: 'payload 格式不正確' }, { status: 400 })
  }

  const summary: { tradeType: string; matched: number; updated: number; note?: string } = {
    tradeType, matched: 0, updated: 0,
  }

  if (tradeType === 'N009') {
    const { orderId, channelOrderId, subOrderList } = tradeData as {
      orderId?: string; channelOrderId?: string
      subOrderList?: { channelSubOrderId?: string; iccid?: string | string[]; qrCodeUrl?: string; qrCodeContent?: string; subOrderId?: string }[]
    }

    let shopeeItems: { id: string; shopee_order_id: string; bc_channel_sub_order_id: string | null }[] | null = null

    if (channelOrderId) {
      const { data } = await supabase.from('shopee_order_items')
        .select('id, shopee_order_id, bc_channel_sub_order_id')
        .eq('bc_channel_order_id', channelOrderId)
      shopeeItems = data
    }
    if ((!shopeeItems || shopeeItems.length === 0) && orderId) {
      const { data } = await supabase.from('shopee_order_items')
        .select('id, shopee_order_id, bc_channel_sub_order_id')
        .eq('bc_order_id', orderId)
      shopeeItems = data
    }
    if ((!shopeeItems || shopeeItems.length === 0) && subOrderList?.length) {
      const channelSubIds = subOrderList.map(s => s.channelSubOrderId).filter(Boolean) as string[]
      if (channelSubIds.length > 0) {
        const { data } = await supabase.from('shopee_order_items')
          .select('id, shopee_order_id, bc_channel_sub_order_id')
          .in('bc_channel_sub_order_id', channelSubIds)
        shopeeItems = data
      }
    }

    summary.matched = shopeeItems?.length || 0

    if (shopeeItems && shopeeItems.length > 0) {
      // 若 webhook 有多個 sub 但 DB 只有 1 筆匹配（quantity>1 沒拆單的舊訂單），
      // 把第一筆填入，其他 sub 克隆出新 row 填入
      const subs = subOrderList || []
      const unmatchedSubs: typeof subs = []
      const usedIds = new Set<string>()
      for (const sub of subs) {
        const target = shopeeItems.find(it => it.bc_channel_sub_order_id === sub.channelSubOrderId && !usedIds.has(it.id))
        if (target) {
          usedIds.add(target.id)
          const iccids = sub.iccid ? (Array.isArray(sub.iccid) ? sub.iccid : [sub.iccid]) : null
          await supabase.from('shopee_order_items').update({
            iccid: iccids,
            qr_code_url: sub.qrCodeUrl || null,
            lpa_code: sub.qrCodeContent || null,
            bc_sub_order_id: sub.subOrderId || null,
            bc_order_id: orderId || null,
            status: 'bc_ordered',
          }).eq('id', target.id)
          summary.updated++
        } else {
          unmatchedSubs.push(sub)
        }
      }

      // 把未匹配的 sub 建為新 row（克隆第一筆 shopee_order_item 作為模板）
      if (unmatchedSubs.length > 0) {
        const { data: template } = await supabase.from('shopee_order_items')
          .select('*').eq('id', shopeeItems[0].id).single()
        if (template) {
          for (const sub of unmatchedSubs) {
            const iccids = sub.iccid ? (Array.isArray(sub.iccid) ? sub.iccid : [sub.iccid]) : null
            await supabase.from('shopee_order_items').insert({
              shopee_order_id: template.shopee_order_id,
              shopee_product_name: template.shopee_product_name,
              shopee_product_id: template.shopee_product_id,
              shopee_variation_name: template.shopee_variation_name,
              shopee_variation_id: template.shopee_variation_id,
              shopee_sku_code: template.shopee_sku_code,
              original_price: template.original_price,
              sale_price: template.sale_price,
              quantity: 1,
              matched_package_id: template.matched_package_id,
              matched_plan_id: template.matched_plan_id,
              matched_copies: template.matched_copies,
              bc_sku_id: template.bc_sku_id,
              cost_cny: template.cost_cny,
              cost_twd: template.cost_twd,
              is_manual: template.is_manual,
              delivery_type: 'esim',
              iccid: iccids,
              qr_code_url: sub.qrCodeUrl || null,
              lpa_code: sub.qrCodeContent || null,
              bc_sub_order_id: sub.subOrderId || null,
              bc_order_id: orderId || null,
              bc_channel_order_id: channelOrderId || template.bc_channel_order_id,
              bc_channel_sub_order_id: sub.channelSubOrderId || null,
              status: 'bc_ordered',
            })
            summary.updated++
          }
          // 模板品項 quantity 改為 1（因為原 qty=2 被拆成多 row 了）
          if ((template.quantity || 1) > 1) {
            await supabase.from('shopee_order_items').update({ quantity: 1 }).eq('id', template.id)
          }
        }
      }

      const shopeeOrderId = shopeeItems[0].shopee_order_id
      const { data: allItems } = await supabase.from('shopee_order_items')
        .select('iccid, bc_order_id, delivery_type, qr_code_url').eq('shopee_order_id', shopeeOrderId)
      const allDone = (allItems || []).every(i =>
        i.bc_order_id && (i.delivery_type === 'esim' ? !!i.qr_code_url : (i.iccid && (i.iccid as string[]).length > 0))
      )
      await supabase.from('shopee_orders').update({
        internal_status: allDone ? 'completed' : 'processing',
        updated_at: new Date().toISOString(),
      }).eq('id', shopeeOrderId)
    } else {
      summary.note = '找不到對應的蝦皮訂單明細'
    }
  } else if (tradeType === 'N002' || tradeType === 'N003') {
    // N002/N003 — 寫入 manual_iccids 的啟用/到期時間
    const rawData = tradeData as unknown
    const items = Array.isArray(rawData)
      ? rawData
      : (rawData && typeof rawData === 'object' && 'iccid' in (rawData as object) ? [rawData] : [])
    const now = new Date().toISOString()
    for (const it of items as { iccid?: string; startTime?: string; endTime?: string; apn?: string; countryRegion?: string; subOrderId?: string }[]) {
      const iccid = it?.iccid
      if (!iccid) continue
      summary.matched++
      if (tradeType === 'N002') {
        await supabase.from('esim_profiles').update({ status: 'active' }).eq('iccid', iccid)
        const { error } = await supabase.from('manual_iccids').update({
          activation_start_time: it.startTime || null,
          activation_end_time: it.endTime || null,
          activation_apn: it.apn || null,
          activation_country_region: it.countryRegion || null,
          activation_sub_order_id: it.subOrderId || null,
          activation_updated_at: now,
        }).eq('iccid', iccid)
        if (!error) summary.updated++
      } else {
        await supabase.from('esim_profiles').update({ status: 'expired' }).eq('iccid', iccid)
        const update: Record<string, unknown> = { activation_updated_at: now }
        if (it.endTime) update.activation_end_time = it.endTime
        if (it.subOrderId) update.activation_sub_order_id = it.subOrderId
        const { error } = await supabase.from('manual_iccids').update(update).eq('iccid', iccid)
        if (!error) summary.updated++
      }
    }
    if (summary.matched === 0) summary.note = 'payload 無 iccid 可處理'
  } else {
    return NextResponse.json({ error: `暫不支援重放 ${tradeType}（目前支援 N002 / N003 / N009）` }, { status: 400 })
  }

  return NextResponse.json({ ok: true, summary })
}
