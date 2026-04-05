import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const dateField = searchParams.get('date_field') || 'wallet_date' // wallet_date | order_date

  const supabase = createAdminClient()

  // ─── 有金流的訂單 ───
  let settleQuery = supabase.from('shopee_settlements')
    .select('shopee_order_id, original_price, seller_coupon, ams_fee, transaction_fee, other_service_fee, processing_fee, wallet_amount, wallet_date')

  if (dateField === 'wallet_date') {
    if (from) settleQuery = settleQuery.gte('wallet_date', from)
    if (to) settleQuery = settleQuery.lte('wallet_date', to + 'T23:59:59')
  }

  const { data: allSettlements } = await settleQuery

  // 如果用 order_date 篩選，需要從 shopee_orders 取日期再過濾
  let settlements = allSettlements || []
  let settledOrderIds = [...new Set(settlements.map(s => s.shopee_order_id).filter(Boolean))]

  if (dateField === 'order_date' && (from || to)) {
    let orderQuery = supabase.from('shopee_orders').select('id, order_date')
    if (from) orderQuery = orderQuery.gte('order_date', from)
    if (to) orderQuery = orderQuery.lte('order_date', to + 'T23:59:59')
    const { data: filteredOrders } = await orderQuery
    const validIds = new Set((filteredOrders || []).map(o => o.id))
    settlements = settlements.filter(s => s.shopee_order_id && validIds.has(s.shopee_order_id))
    settledOrderIds = [...new Set(settlements.map(s => s.shopee_order_id).filter(Boolean))]
  }

  // 有金流的成本
  let settledCost = 0
  if (settledOrderIds.length > 0) {
    const { data: items } = await supabase.from('shopee_order_items')
      .select('shopee_order_id, cost_twd, quantity')
      .in('shopee_order_id', settledOrderIds)
    if (items) settledCost = items.reduce((sum, i) => sum + ((i.cost_twd ?? 0) * (i.quantity ?? 1)), 0)
  }

  let settledRevenue = 0, settledPlatformFees = 0, settledWallet = 0
  for (const s of settlements) {
    settledRevenue += Math.abs(s.original_price ?? 0)
    settledPlatformFees += Math.abs(s.ams_fee ?? 0) + Math.abs(s.transaction_fee ?? 0) +
      Math.abs(s.other_service_fee ?? 0) + Math.abs(s.processing_fee ?? 0)
    settledWallet += s.wallet_amount ?? 0
  }
  const settledProfit = settledWallet - settledCost
  const settledPlatformRate = settledRevenue > 0 ? (settledPlatformFees / settledRevenue) * 100 : 0
  const settledProfitRate = settledRevenue > 0 ? (settledProfit / settledRevenue) * 100 : 0

  // ─── 無金流的訂單 ───
  let unsettledQuery = supabase.from('shopee_orders')
    .select('id, product_total, seller_coupon, transaction_fee, other_service_fee, payment_processing_fee, shopee_order_items(cost_twd, quantity)')

  if (dateField === 'order_date') {
    if (from) unsettledQuery = unsettledQuery.gte('order_date', from)
    if (to) unsettledQuery = unsettledQuery.lte('order_date', to + 'T23:59:59')
  } else {
    // wallet_date 模式下，無金流的用 order_date 做大範圍篩選
    if (from) unsettledQuery = unsettledQuery.gte('order_date', from)
    if (to) unsettledQuery = unsettledQuery.lte('order_date', to + 'T23:59:59')
  }

  const { data: allOrders } = await unsettledQuery
  // 過濾掉已有金流的
  const allSettledIds = new Set((allSettlements || []).map(s => s.shopee_order_id))
  const unsettledOrders = (allOrders || []).filter(o => !allSettledIds.has(o.id))

  let unsettledRevenue = 0, unsettledPlatformFees = 0, unsettledCost = 0
  for (const o of unsettledOrders) {
    unsettledRevenue += o.product_total ?? 0
    unsettledPlatformFees += Math.abs(o.transaction_fee ?? 0) + Math.abs(o.other_service_fee ?? 0) + Math.abs(o.payment_processing_fee ?? 0)
    const items = o.shopee_order_items as { cost_twd: number | null; quantity: number }[] | null
    if (items) unsettledCost += items.reduce((sum: number, i: { cost_twd: number | null; quantity: number }) => sum + ((i.cost_twd ?? 0) * (i.quantity ?? 1)), 0)
  }
  const unsettledEstProfit = unsettledRevenue - unsettledPlatformFees - unsettledCost
  const unsettledPlatformRate = unsettledRevenue > 0 ? (unsettledPlatformFees / unsettledRevenue) * 100 : 0
  const unsettledProfitRate = unsettledRevenue > 0 ? (unsettledEstProfit / unsettledRevenue) * 100 : 0

  return NextResponse.json({
    settled: {
      order_count: settlements.length,
      total_revenue: Math.round(settledRevenue),
      platform_fees: Math.round(settledPlatformFees),
      platform_rate: Math.round(settledPlatformRate * 10) / 10,
      wallet_total: Math.round(settledWallet),
      product_cost: Math.round(settledCost),
      profit: Math.round(settledProfit),
      profit_rate: Math.round(settledProfitRate * 10) / 10,
    },
    unsettled: {
      order_count: unsettledOrders.length,
      total_revenue: Math.round(unsettledRevenue),
      platform_fees: Math.round(unsettledPlatformFees),
      platform_rate: Math.round(unsettledPlatformRate * 10) / 10,
      product_cost: Math.round(unsettledCost),
      est_profit: Math.round(unsettledEstProfit),
      profit_rate: Math.round(unsettledProfitRate * 10) / 10,
    },
  })
}
