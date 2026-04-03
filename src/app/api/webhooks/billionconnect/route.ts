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
    return NextResponse.json({ tradeCode: '9999', tradeMsg: 'Invalid signature' }, { status: 403 })
  }

  const payload = JSON.parse(rawBody)
  const { tradeType, tradeData } = payload
  const supabase = createAdminClient()

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
