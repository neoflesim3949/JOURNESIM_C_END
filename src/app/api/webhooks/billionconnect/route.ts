import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_SECRET = process.env.BILLIONCONNECT_APP_SECRET!

function verifySign(body: string, signValue: string): boolean {
  const expected = crypto.createHash('md5').update(APP_SECRET + body, 'utf8').digest('hex')
  return expected === signValue
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signValue = request.headers.get('x-sign-value') || ''

  if (!verifySign(rawBody, signValue)) {
    // 記錄失敗的 webhook（方便排查）
    try {
      const supabaseLog = createAdminClient()
      const parsed = JSON.parse(rawBody).tradeType || 'unknown'
      await supabaseLog.from('bc_api_logs').insert({
        trade_type: parsed, direction: 'incoming',
        request_body: JSON.parse(rawBody), response_body: null,
        status: 'error', error_message: 'Invalid signature',
      })
    } catch {}
    return NextResponse.json({ tradeCode: '9999', tradeMsg: 'Invalid signature' }, { status: 403 })
  }

  const payload = JSON.parse(rawBody)
  const { tradeType, tradeData } = payload
  const supabase = createAdminClient()

  // 記錄 BC webhook log
  await supabase.from('bc_api_logs').insert({
    trade_type: tradeType, direction: 'incoming',
    request_body: payload, response_body: null, status: 'success',
  })

  // 冪等處理
  const webhookId = `${tradeType}_${tradeData.orderId || tradeData.channelOrderId || tradeData.iccid}_${Date.now()}`
  const { data: existing } = await supabase.from('webhook_logs').select('id').eq('webhook_id', webhookId).single()
  if (existing) return NextResponse.json({ tradeCode: '1000', tradeMsg: 'Already processed' })

  await supabase.from('webhook_logs').insert({ webhook_id: webhookId, trade_type: tradeType, payload: tradeData })

  switch (tradeType) {
    case 'N009': {
      // eSIM QR Code 通知
      // channelOrderId = 我們的子訂單號（E 結尾）
      // channelSubOrderId = 我們的 SKU 單號（E1, E2...）
      const { orderId, channelOrderId, subOrderList } = tradeData

      // ===== 蝦皮訂單（manual eSIM）=====
      // 先用 channelOrderId 查；查不到再用 bc_order_id 或個別 channelSubOrderId 查
      {
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
          const channelSubIds = subOrderList.map((s: { channelSubOrderId: string }) => s.channelSubOrderId).filter(Boolean)
          if (channelSubIds.length > 0) {
            const { data } = await supabase.from('shopee_order_items')
              .select('id, shopee_order_id, bc_channel_sub_order_id')
              .in('bc_channel_sub_order_id', channelSubIds)
            shopeeItems = data
          }
        }

        if (shopeeItems && shopeeItems.length > 0) {
          console.log('[N009] 蝦皮訂單匹配到', shopeeItems.length, '個品項')
          const subs = subOrderList || []
          const unmatchedSubs: typeof subs = []
          const usedIds = new Set<string>()
          for (const sub of subs) {
            const { channelSubOrderId, iccid, qrCodeUrl, qrCodeContent } = sub
            const target = shopeeItems.find(it => it.bc_channel_sub_order_id === channelSubOrderId && !usedIds.has(it.id))
            if (!target) {
              unmatchedSubs.push(sub)
              continue
            }
            usedIds.add(target.id)
            await supabase.from('shopee_order_items').update({
              iccid: iccid ? (Array.isArray(iccid) ? iccid : [iccid]) : null,
              qr_code_url: qrCodeUrl || null,
              lpa_code: qrCodeContent || null,
              bc_sub_order_id: sub.subOrderId || null,
              bc_order_id: orderId,
              status: 'bc_ordered',
            }).eq('id', target.id)
          }

          // 未匹配的 sub（qty>1 未先拆單）→ 克隆第一筆建新 row
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
                  bc_order_id: orderId,
                  bc_channel_order_id: channelOrderId || template.bc_channel_order_id,
                  bc_channel_sub_order_id: sub.channelSubOrderId || null,
                  status: 'bc_ordered',
                })
              }
              if ((template.quantity || 1) > 1) {
                await supabase.from('shopee_order_items').update({ quantity: 1 }).eq('id', template.id)
              }
            }
          }

          // 檢查蝦皮訂單是否全部完成
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
          break
        }
      }

      // 找到子訂單
      const { data: subOrder } = await supabase.from('sub_orders')
        .select('id, order_id').eq('sub_order_number', channelOrderId).single()

      if (subOrder) {
        for (const sub of subOrderList || []) {
          const { channelSubOrderId, iccid, qrCodeUrl, qrCodeContent } = sub

          // 更新 order_skus
          await supabase.from('order_skus').update({
            iccid: iccid ? (Array.isArray(iccid) ? iccid : [iccid]) : null,
            qr_code_url: qrCodeUrl || null,
            lpa_code: qrCodeContent || null,
            bc_sub_order_id: sub.subOrderId || null,
            status: 'completed',
          }).eq('sku_number', channelSubOrderId)
        }

        // 更新子訂單狀態
        await supabase.from('sub_orders').update({
          bc_order_id: orderId,
          status: 'completed',
          updated_at: new Date().toISOString(),
        }).eq('id', subOrder.id)

        // 檢查所有子訂單是否完成，更新主訂單
        const { data: allSubs } = await supabase.from('sub_orders')
          .select('status').eq('order_id', subOrder.order_id)
        const allCompleted = (allSubs || []).every((s) => s.status === 'completed')
        if (allCompleted) {
          await supabase.from('orders').update({ status: 'completed' }).eq('id', subOrder.order_id)
        }
      }

      // 向後相容：也寫入 esim_profiles
      if (subOrderList) {
        for (const sub of subOrderList) {
          const iccids = Array.isArray(sub.iccid) ? sub.iccid : sub.iccid ? [sub.iccid] : []
          for (const ic of iccids) {
            // 找任何匹配的 order_item
            const { data: order } = await supabase.from('orders')
              .select('id').eq('order_number', channelOrderId).single()
            if (!order) {
              // 也嘗試用 sub_order 的 order_id
              const so = subOrder
              if (so) {
                const { data: items } = await supabase.from('order_items')
                  .select('id').eq('order_id', so.order_id).limit(1)
                if (items && items.length > 0) {
                  await supabase.from('esim_profiles').upsert({
                    order_item_id: items[0].id,
                    iccid: ic,
                    qr_code_url: sub.qrCodeUrl || null,
                    qr_code_data: sub.qrCodeContent || null,
                    sm_dp_address: sub.smdpAddress || null,
                    activation_code: sub.activationCode || null,
                    status: 'ready',
                  }, { onConflict: 'iccid' })
                }
              }
            }
          }
        }
      }
      break
    }

    case 'N001': {
      // SIM 發貨通知
      // channelOrderId = 我們的子訂單號（S 結尾）
      const { orderId, channelOrderId, courierNumber } = tradeData

      const { data: subOrder } = await supabase.from('sub_orders')
        .select('id, order_id').eq('sub_order_number', channelOrderId).single()

      if (subOrder) {
        await supabase.from('sub_orders').update({
          bc_order_id: orderId,
          status: 'shipping',
          tracking_number: courierNumber || null,
          shipping_status: 'shipped',
          updated_at: new Date().toISOString(),
        }).eq('id', subOrder.id)

        // 更新所有 SKU 狀態
        await supabase.from('order_skus').update({ status: 'shipping' })
          .eq('sub_order_id', subOrder.id)
      }

      // 向後相容
      if (orderId) {
        await supabase.from('orders').update({ status: 'shipping' }).eq('bc_order_id', orderId)
      }
      break
    }

    case 'N002': {
      // 流量開始
      const { iccid } = tradeData
      if (iccid) {
        await supabase.from('esim_profiles').update({ status: 'active' }).eq('iccid', iccid)
      }
      break
    }

    case 'N003': {
      // 流量結束
      const { iccid } = tradeData
      if (iccid) {
        await supabase.from('esim_profiles').update({ status: 'expired' }).eq('iccid', iccid)
      }
      break
    }

    case 'N013': {
      // 充值結果通知
      const { orderId, channelOrderId, subOrderList } = tradeData

      const { data: subOrder } = await supabase.from('sub_orders')
        .select('id, order_id').eq('sub_order_number', channelOrderId).single()

      if (subOrder) {
        await supabase.from('sub_orders').update({
          bc_order_id: orderId,
          status: 'completed',
          updated_at: new Date().toISOString(),
        }).eq('id', subOrder.id)

        // 更新 SKU
        for (const sub of subOrderList || []) {
          await supabase.from('order_skus').update({
            bc_sub_order_id: sub.subOrderId || null,
            status: 'completed',
          }).eq('sku_number', sub.channelSubOrderId)
        }

        // 檢查主訂單
        const { data: allSubs } = await supabase.from('sub_orders')
          .select('status').eq('order_id', subOrder.order_id)
        const allCompleted = (allSubs || []).every((s) => s.status === 'completed')
        if (allCompleted) {
          await supabase.from('orders').update({ status: 'completed' }).eq('id', subOrder.order_id)
        }
      }
      break
    }
  }

  return NextResponse.json({ tradeCode: '1000', tradeMsg: 'Success' })
}
