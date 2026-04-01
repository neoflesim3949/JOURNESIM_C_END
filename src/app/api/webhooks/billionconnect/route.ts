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

  // 驗證簽名
  if (!verifySign(rawBody, signValue)) {
    return NextResponse.json({ tradeCode: '9999', tradeMsg: 'Invalid signature' }, { status: 403 })
  }

  const payload = JSON.parse(rawBody)
  const { tradeType, tradeData } = payload

  const supabase = createAdminClient()

  // 冪等處理：檢查是否已處理過
  const webhookId = `${tradeType}_${tradeData.orderId || tradeData.channelOrderId}_${Date.now()}`
  const { data: existing } = await supabase
    .from('webhook_logs')
    .select('id')
    .eq('webhook_id', webhookId)
    .single()

  if (existing) {
    return NextResponse.json({ tradeCode: '1000', tradeMsg: 'Already processed' })
  }

  // 記錄 Webhook
  await supabase.from('webhook_logs').insert({
    webhook_id: webhookId,
    trade_type: tradeType,
    payload: tradeData,
  })

  switch (tradeType) {
    case 'N009': {
      // eSIM QR Code 通知
      const { orderId, channelOrderId, subOrderList } = tradeData

      for (const sub of subOrderList || []) {
        const { channelSubOrderId, iccid, qrCodeUrl, qrCodeData, smdpAddress, activationCode } = sub

        // 找到對應的 order_item
        const { data: order } = await supabase
          .from('orders')
          .select('id')
          .eq('order_number', channelOrderId)
          .single()

        if (!order) continue

        const { data: item } = await supabase
          .from('order_items')
          .select('id')
          .eq('order_id', order.id)
          .limit(1)
          .single()

        if (!item) continue

        // 建立 eSIM profile
        for (const id of iccid || []) {
          await supabase.from('esim_profiles').insert({
            order_item_id: item.id,
            iccid: id,
            qr_code_url: qrCodeUrl,
            qr_code_data: qrCodeData,
            sm_dp_address: smdpAddress,
            activation_code: activationCode,
            status: 'ready',
          })
        }

        // 更新 order_item 的 iccid
        await supabase
          .from('order_items')
          .update({ iccid: iccid, plan_status: 'ready' })
          .eq('id', item.id)
      }

      // 更新訂單狀態
      await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('bc_order_id', orderId)

      break
    }

    case 'N001': {
      // SIM 發貨通知
      const { orderId } = tradeData
      await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('bc_order_id', orderId)
      break
    }

    case 'N002': {
      // 流量開始
      const { iccid } = tradeData
      if (iccid) {
        await supabase
          .from('esim_profiles')
          .update({ status: 'active' })
          .eq('iccid', iccid)
      }
      break
    }

    case 'N003': {
      // 流量結束
      const { iccid } = tradeData
      if (iccid) {
        await supabase
          .from('esim_profiles')
          .update({ status: 'expired' })
          .eq('iccid', iccid)
      }
      break
    }

    case 'N013': {
      // 充值結果
      break
    }
  }

  return NextResponse.json({ tradeCode: '1000', tradeMsg: 'Success' })
}
