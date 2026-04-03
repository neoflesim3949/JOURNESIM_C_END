import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateOrderId, generateSubOrderId, generateSkuId } from '@/lib/utils'
import { payByPrime, payByToken } from '@/lib/tappay'
import { createEsimOrder } from '@/lib/billionconnect'

interface CartItem {
  id: string; packageId: string; packageName: string
  planId: string; bcSkuId: string; bcSkuName: string; displayName: string
  copies: string; days: number; planCategory: 'daily' | 'fixed'
  productType: 'esim' | 'sim'
  unitPrice: number; quantity: number
  countryCode: string; countryName: string
}

export async function POST(request: Request) {
  const body = await request.json()
  const { email, items, prime, payment_method = 'credit_card', result_url, save_card = false, card_id, shipping_name, shipping_phone, shipping_address } = body as {
    email: string
    items: CartItem[]
    prime?: string
    payment_method?: string
    result_url?: string
    save_card?: boolean
    card_id?: string
    shipping_name?: string
    shipping_phone?: string
    shipping_address?: string
  }

  if (!email || !items || items.length === 0) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const serverSupabase = await createClient()

  // 取得登入用戶
  const { data: { user } } = await serverSupabase.auth.getUser()
  let memberId: string | null = null
  if (user) {
    const { data: existing } = await supabase.from('members').select('id').eq('id', user.id).single()
    if (!existing) {
      await supabase.from('members').insert({
        id: user.id, email: user.email || email,
        display_name: user.user_metadata?.display_name || null,
        auth_provider: user.app_metadata?.provider || 'email',
      })
    }
    memberId = user.id
  }

  // 計算總金額
  const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
  const orderNumber = generateOrderId()

  // =====================================================
  // TapPay 付款
  // =====================================================
  let paymentStatus = 'pending_payment'
  let tappayTradeId = null
  let tappayRaw = null
  let paymentUrl = null

  const productNames = [...new Set(items.map((i) => i.packageName))].join(', ')

  if (card_id) {
    // Pay by Token
    try {
      const { data: card } = await supabase.from('member_cards').select('card_token, card_key')
        .eq('id', card_id).eq('member_id', memberId).single()
      if (!card) return NextResponse.json({ error: '找不到已儲存的卡片' }, { status: 404 })

      const tokenResult = await payByToken({
        cardToken: card.card_token, cardKey: card.card_key,
        amount: totalAmount, orderNumber, email,
        details: `FLESIM - ${productNames}`,
      })
      tappayTradeId = tokenResult.trade_id
      tappayRaw = tokenResult.raw
      paymentStatus = tokenResult.success ? 'paid' : 'failed'
      if (!tokenResult.success) return NextResponse.json({ error: `付款失敗：${tokenResult.raw.msg || '卡片授權失敗'}` }, { status: 400 })
    } catch (err) {
      return NextResponse.json({ error: `付款處理異常：${err instanceof Error ? err.message : '請稍後再試'}` }, { status: 500 })
    }
  } else if (prime) {
    // Pay by Prime
    try {
      const tappayResult = await payByPrime({
        prime, amount: totalAmount, orderNumber, email,
        details: `FLESIM - ${productNames}`,
        paymentMethod: payment_method, resultUrl: result_url,
        remember: save_card && memberId ? true : false,
      })
      tappayTradeId = tappayResult.trade_id
      tappayRaw = tappayResult.raw
      if (tappayResult.payment_url) {
        paymentStatus = 'pending_payment'
        paymentUrl = tappayResult.payment_url
      } else {
        paymentStatus = tappayResult.success ? 'paid' : 'failed'
      }
      if (!tappayResult.success && !tappayResult.payment_url) {
        return NextResponse.json({ error: `付款失敗：${tappayResult.raw.msg || '請確認付款資訊'}` }, { status: 400 })
      }
      // 儲存卡片 Token
      if (save_card && memberId && tappayResult.card_secret && tappayResult.card_info) {
        await supabase.from('member_cards').upsert({
          member_id: memberId,
          card_token: tappayResult.card_secret.card_token,
          card_key: tappayResult.card_secret.card_key,
          last_four: tappayResult.card_info.last_four,
          bin_code: tappayResult.card_info.bin_code,
          card_type: String(tappayResult.card_info.type),
          issuer: tappayResult.card_info.issuer,
        }, { onConflict: 'member_id,card_token' })
      }
    } catch (err) {
      return NextResponse.json({ error: `付款處理異常：${err instanceof Error ? err.message : '請稍後再試'}` }, { status: 500 })
    }
  }

  // =====================================================
  // L1: 建立主訂單
  // =====================================================
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      member_id: memberId, email,
      order_number: orderNumber,
      status: paymentStatus === 'paid' ? 'paid' : 'pending_payment',
      total_amount: totalAmount,
      payment_method,
      tappay_trade_id: tappayTradeId,
      cart_items: items,
      shipping_name: shipping_name || null,
      shipping_phone: shipping_phone || null,
      shipping_address: shipping_address || null,
    })
    .select().single()

  if (orderError) return NextResponse.json({ error: '建立訂單失敗：' + orderError.message }, { status: 500 })

  // 記錄付款
  if (tappayTradeId) {
    await supabase.from('payments').insert({
      order_id: order.id, method: payment_method,
      tappay_trade_id: tappayTradeId, amount: totalAmount,
      status: paymentStatus === 'paid' ? 'success' : 'pending',
      raw_response: tappayRaw,
    })
  }

  // =====================================================
  // L2: 建立子訂單（按 eSIM / SIM 拆分）
  // =====================================================
  const esimItems = items.filter((i) => i.productType === 'esim')
  const simItems = items.filter((i) => i.productType === 'sim')

  const subOrders: { category: string; items: CartItem[]; subOrderId?: string }[] = []
  if (esimItems.length > 0) subOrders.push({ category: 'esim', items: esimItems })
  if (simItems.length > 0) subOrders.push({ category: 'sim', items: simItems })

  for (const sub of subOrders) {
    const subTotal = sub.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
    const subNumber = generateSubOrderId(sub.category as 'esim' | 'sim')

    const { data: subOrder } = await supabase.from('sub_orders').insert({
      order_id: order.id,
      sub_order_number: subNumber,
      category: sub.category,
      status: sub.category === 'esim' ? 'processing' : 'pending',
      subtotal: subTotal,
    }).select().single()

    if (!subOrder) continue
    sub.subOrderId = subOrder.id

    // 1. 取得這批項目的當前成本價（確保利潤追蹤精確度）
    const itemSkuIds = [...new Set(sub.items.map(i => i.bcSkuId))]
    const { data: currentProducts } = await supabase
      .from('bc_products')
      .select('sku_id, cost_price')
      .in('sku_id', itemSkuIds)
    const costMap = new Map((currentProducts || []).map(p => [p.sku_id, Number(p.cost_price) || 0]))

    // L3: 建立 SKU 單號（按 SKU + copies 拆分，每個 SKU 有獨立編號）
    // =====================================================
    const skuRecords = sub.items.map((item, idx) => ({
      sub_order_id: subOrder.id,
      sku_number: generateSkuId(subNumber, idx + 1),
      bc_sku_id: item.bcSkuId,
      bc_sku_name: item.bcSkuName,
      product_name: item.packageName,
      display_name: item.displayName,
      package_plan_id: item.planId,
      copies: item.copies,
      days: item.days,
      unit_price: item.unitPrice,
      cost_price: costMap.get(item.bcSkuId) || 0, // 記錄當時成本
      quantity: item.quantity,
      subtotal: item.unitPrice * item.quantity,
      status: sub.category === 'esim' ? 'processing' : 'pending',
    }))

    await supabase.from('order_skus').insert(skuRecords)

    // 也寫入舊的 order_items（向後相容）
    for (const item of sub.items) {
      await supabase.from('order_items').insert({
        order_id: order.id,
        product_id: item.packageId,
        product_name: `${item.packageName} - ${item.displayName}`,
        plan_type: item.planCategory,
        plan_label: item.displayName,
        days: item.days,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: item.unitPrice * item.quantity,
        bc_sku_id: item.bcSkuId,
      })
    }

    // =====================================================
    // eSIM 自動下單：付款成功 → 呼叫 BC F040
    // =====================================================
    if (sub.category === 'esim' && paymentStatus === 'paid') {
      try {
        // 取回剛建立的 SKU 記錄（需要 sku_number）
        const { data: createdSkus } = await supabase.from('order_skus')
          .select('id, sku_number, bc_sku_id, copies, quantity')
          .eq('sub_order_id', subOrder.id)

        const bcSubOrderList = (createdSkus || []).map((sku) => ({
          channelSubOrderId: sku.sku_number || sku.id,
          deviceSkuId: sku.bc_sku_id,
          planSkuCopies: sku.copies,
          number: String(sku.quantity),
        }))

        const bcResult = await createEsimOrder({
          channelOrderId: subNumber,
          totalAmount: String(subTotal),
          subOrderList: bcSubOrderList,
        })

        // 更新子訂單 BC 訂單號
        await supabase.from('sub_orders').update({
          bc_order_id: bcResult.orderId,
          status: 'processing',
        }).eq('id', subOrder.id)

        // 更新每個 SKU 的 BC 子訂單號
        for (const bcSub of bcResult.subOrderList || []) {
          await supabase.from('order_skus').update({
            bc_sub_order_id: bcSub.subOrderId,
          }).eq('sku_number', bcSub.channelSubOrderId)
        }
      } catch (err) {
        console.error('BC eSIM order failed:', err)
        // 不阻塞結帳流程，僅記錄錯誤
        await supabase.from('sub_orders').update({
          status: 'pending',
        }).eq('id', subOrder.id)
      }
    }
  }

  return NextResponse.json({
    order_id: order.id,
    order_number: orderNumber,
    payment_url: paymentUrl || null,
    sub_orders: subOrders.map((s) => ({
      id: s.subOrderId,
      category: s.category,
      item_count: s.items.length,
    })),
  })
}
