import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
// import { createEsimOrder } from '@/lib/billionconnect'  // 測試階段暫不使用
import { generateOrderId } from '@/lib/utils'
import { payByPrime } from '@/lib/tappay'

export async function POST(request: Request) {
  const body = await request.json()
  const { email, product_id, plan_id, copies, quantity = 1, prime, total_amount, bc_sku_id, payment_method = 'credit_card', result_url } = body

  if (!email || !product_id) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const serverSupabase = await createClient()

  // 取得登入用戶（可選）
  const { data: { user } } = await serverSupabase.auth.getUser()

  // 如果已登入，確保 members 表有記錄
  let memberId: string | null = null
  if (user) {
    const { data: existing } = await supabase.from('members').select('id').eq('id', user.id).single()
    if (!existing) {
      await supabase.from('members').insert({
        id: user.id,
        email: user.email || email,
        display_name: user.user_metadata?.display_name || null,
        auth_provider: user.app_metadata?.provider || 'email',
      })
    }
    memberId = user.id
  }

  // 取得商品資料
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', product_id)
    .single()

  if (!product) {
    return NextResponse.json({ error: '商品不存在' }, { status: 404 })
  }

  // 確認價格（從 product_plan_prices 驗證）
  let verifiedPrice = total_amount
  let verifiedSkuId = bc_sku_id
  let planLabel = ''
  let planDays = 0

  if (plan_id && copies) {
    const { data: priceRow } = await supabase
      .from('product_plan_prices')
      .select('sell_price, cost_price')
      .eq('product_plan_id', plan_id)
      .eq('copies', copies)
      .single()

    if (priceRow && priceRow.sell_price > 0) {
      verifiedPrice = priceRow.sell_price * quantity
    }

    // 取得 BC SKU 和天數
    const { data: planRow } = await supabase
      .from('product_plans')
      .select('bc_sku_id')
      .eq('id', plan_id)
      .single()

    if (planRow) verifiedSkuId = planRow.bc_sku_id

    // 取得 BC 商品天數
    if (verifiedSkuId) {
      const { data: bcProduct } = await supabase
        .from('bc_products')
        .select('days, name')
        .eq('sku_id', verifiedSkuId)
        .single()

      if (bcProduct) {
        planDays = (bcProduct.days || 1) * parseInt(copies)
        planLabel = `${bcProduct.name} × ${copies} copies`
      }
    }
  }

  const orderNumber = generateOrderId()

  // TapPay Pay by Prime 扣款
  let paymentStatus = 'pending_payment'
  let tappayTradeId = null
  let tappayRaw = null

  if (prime) {
    try {
      const tappayResult = await payByPrime({
        prime,
        amount: verifiedPrice,
        orderNumber,
        email,
        details: `FLESIM - ${product.name}`,
        paymentMethod: payment_method,
        resultUrl: result_url,
      })

      tappayTradeId = tappayResult.trade_id
      tappayRaw = tappayResult.raw
      paymentStatus = tappayResult.success ? 'paid' : 'failed'

      if (!tappayResult.success) {
        console.error('TapPay payment failed:', tappayResult.raw)
        return NextResponse.json({
          error: `付款失敗：${tappayResult.raw.msg || '請確認信用卡資訊'}`,
        }, { status: 400 })
      }
    } catch (err) {
      console.error('TapPay API error:', err)
      return NextResponse.json({
        error: '付款處理異常，請稍後再試',
      }, { status: 500 })
    }
  }

  // 建立訂單
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      member_id: memberId,
      email,
      order_number: orderNumber,
      status: paymentStatus === 'paid' ? 'paid' : 'pending_payment',
      total_amount: verifiedPrice,
      payment_method,
      tappay_trade_id: tappayTradeId,
    })
    .select()
    .single()

  if (orderError) {
    return NextResponse.json({ error: '建立訂單失敗：' + orderError.message }, { status: 500 })
  }

  // 建立訂單明細
  await supabase.from('order_items').insert({
    order_id: order.id,
    product_id,
    product_name: product.name,
    plan_type: 'daily',
    plan_label: planLabel || `${planDays} 天`,
    days: planDays || null,
    quantity,
    unit_price: verifiedPrice / quantity,
    subtotal: verifiedPrice,
    bc_sku_id: verifiedSkuId || '',
  })

  // 記錄付款
  if (tappayTradeId) {
    await supabase.from('payments').insert({
      order_id: order.id,
      method: 'credit_card',
      tappay_trade_id: tappayTradeId,
      amount: verifiedPrice,
      status: paymentStatus === 'paid' ? 'success' : 'pending',
      raw_response: tappayRaw,
    })
  }

  // 付款成功 → 呼叫 BC API 建立 eSIM 訂單
  // ⚠️ 測試階段：不呼叫 BC API，僅建立本地訂單
  // 正式上線時取消下方註解
  /*
  if (paymentStatus === 'paid' && verifiedSkuId) {
    try {
      const bcResult = await createEsimOrder({
        channelOrderId: orderNumber,
        email,
        subOrderList: [{
          channelSubOrderId: subOrderId,
          deviceSkuId: verifiedSkuId,
          planSkuCopies: copies || '1',
          number: String(quantity),
        }],
      })

      await supabase
        .from('orders')
        .update({ bc_order_id: bcResult.orderId, status: 'processing' })
        .eq('id', order.id)

      if (bcResult.subOrderList?.length) {
        await supabase
          .from('order_items')
          .update({ bc_sub_order_id: bcResult.subOrderList[0].subOrderId })
          .eq('order_id', order.id)
      }
    } catch (err) {
      console.error('BC order creation failed:', err)
    }
  }
  */

  return NextResponse.json({
    order_id: order.id,
    order_number: orderNumber,
    payment_url: tappayRaw?.payment_url || null,
  })
}
