import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

interface SettlementRow {
  shopee_order_id: string | null
  original_price: number | null
  seller_coupon: number | null
  ams_fee: number | null
  transaction_fee: number | null
  other_service_fee: number | null
  processing_fee: number | null
  wallet_amount: number | null
  wallet_date: string | null
}

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const dateField = searchParams.get('date_field') || 'order_date'
  const accountId = searchParams.get('account_id') || ''

  const supabase = createAdminClient()

  // ─── 1. 取得日期範圍內的「訂單為主」資料 ─────────────────────────
  // order_date 模式：母體 = 在日期範圍內下單的訂單
  // wallet_date 模式：母體 = 在日期範圍內入帳的 settlement 對應的訂單
  let inRangeOrderIds: string[] = []

  if (dateField === 'order_date') {
    // 用訂單日期撈所有訂單
    let oq = supabase.from('shopee_orders').select('id').neq('order_status', '不成立')
    if (accountId) oq = oq.eq('shopee_account_id', accountId)
    if (from) oq = oq.gte('order_date', from)
    if (to) oq = oq.lte('order_date', to + 'T23:59:59')
    const { data } = await oq.limit(10000)
    inRangeOrderIds = (data || []).map(o => o.id)
  } else {
    // wallet_date / created_at 模式：撈該範圍內的 settlement，反推訂單
    const settleField = dateField === 'created_at' ? 'created_at' : 'wallet_date'
    let sq = supabase.from('shopee_settlements').select('shopee_order_id')
    if (accountId) sq = sq.eq('shopee_account_id', accountId)
    if (from) sq = sq.gte(settleField, from)
    if (to) sq = sq.lte(settleField, to + 'T23:59:59')
    const { data } = await sq.limit(10000)
    const ids = [...new Set((data || []).map(s => s.shopee_order_id).filter(Boolean) as string[])]
    if (ids.length > 0) {
      // 排除「不成立」
      const valid: string[] = []
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500)
        const { data: ord } = await supabase.from('shopee_orders').select('id, order_status').in('id', batch)
        for (const o of ord || []) if (o.order_status !== '不成立') valid.push(o.id)
      }
      inRangeOrderIds = valid
    }
  }

  // ─── 2. 對母體訂單抓所有 settlement（分批，不限 wallet_date）──
  let allSettlements: SettlementRow[] = []
  if (inRangeOrderIds.length > 0) {
    for (let i = 0; i < inRangeOrderIds.length; i += 500) {
      const batch = inRangeOrderIds.slice(i, i + 500)
      const { data } = await supabase.from('shopee_settlements')
        .select('shopee_order_id, original_price, seller_coupon, ams_fee, transaction_fee, other_service_fee, processing_fee, wallet_amount, wallet_date')
        .in('shopee_order_id', batch)
      allSettlements.push(...((data || []) as SettlementRow[]))
    }
  }

  const settledOrderIdSet = new Set(allSettlements.map(s => s.shopee_order_id).filter(Boolean) as string[])
  const settledOrderIds = [...settledOrderIdSet]
  const unsettledOrderIds = inRangeOrderIds.filter(id => !settledOrderIdSet.has(id))

  // ─── 3. 已結算 stats ──────────────────────────────────────────────
  let settledCost = 0
  let settledCardCount = 0
  if (settledOrderIds.length > 0) {
    for (let i = 0; i < settledOrderIds.length; i += 500) {
      const batch = settledOrderIds.slice(i, i + 500)
      const { data: items } = await supabase.from('shopee_order_items')
        .select('shopee_order_id, cost_twd, quantity').in('shopee_order_id', batch)
      for (const it of items || []) {
        settledCost += (it.cost_twd ?? 0) * (it.quantity ?? 1)
        settledCardCount += it.quantity ?? 0
      }
    }
  }

  let settledRevenue = 0, settledPlatformFees = 0, settledWallet = 0
  for (const s of allSettlements) {
    settledRevenue += Math.abs(s.original_price ?? 0)
    settledPlatformFees += Math.abs(s.ams_fee ?? 0) + Math.abs(s.transaction_fee ?? 0) +
      Math.abs(s.other_service_fee ?? 0) + Math.abs(s.processing_fee ?? 0)
    settledWallet += s.wallet_amount ?? 0
  }
  const settledProfit = settledWallet - settledCost
  const settledPlatformRate = settledRevenue > 0 ? (settledPlatformFees / settledRevenue) * 100 : 0
  const settledProfitRate = settledRevenue > 0 ? (settledProfit / settledRevenue) * 100 : 0

  // ─── 4. 未結算 stats（從 shopee_orders 估算）──────────────────────
  let unsettledRevenue = 0, unsettledPlatformFees = 0, unsettledCost = 0
  let unsettledCardCount = 0
  if (unsettledOrderIds.length > 0) {
    for (let i = 0; i < unsettledOrderIds.length; i += 500) {
      const batch = unsettledOrderIds.slice(i, i + 500)
      const { data: orders } = await supabase.from('shopee_orders')
        .select('id, product_total, transaction_fee, other_service_fee, payment_processing_fee, shopee_order_items(cost_twd, quantity)')
        .in('id', batch)
      for (const o of orders || []) {
        unsettledRevenue += o.product_total ?? 0
        unsettledPlatformFees += Math.abs(o.transaction_fee ?? 0) + Math.abs(o.other_service_fee ?? 0) + Math.abs(o.payment_processing_fee ?? 0)
        const items = o.shopee_order_items as { cost_twd: number | null; quantity: number }[] | null
        if (items) {
          for (const it of items) {
            unsettledCost += (it.cost_twd ?? 0) * (it.quantity ?? 1)
            unsettledCardCount += it.quantity ?? 0
          }
        }
      }
    }
  }
  const unsettledEstProfit = unsettledRevenue - unsettledPlatformFees - unsettledCost
  const unsettledPlatformRate = unsettledRevenue > 0 ? (unsettledPlatformFees / unsettledRevenue) * 100 : 0
  const unsettledProfitRate = unsettledRevenue > 0 ? (unsettledEstProfit / unsettledRevenue) * 100 : 0

  return NextResponse.json({
    settled: {
      order_count: settledOrderIds.length,
      card_count: settledCardCount,
      total_revenue: Math.round(settledRevenue),
      platform_fees: Math.round(settledPlatformFees),
      platform_rate: Math.round(settledPlatformRate * 10) / 10,
      wallet_total: Math.round(settledWallet),
      product_cost: Math.round(settledCost),
      profit: Math.round(settledProfit),
      profit_rate: Math.round(settledProfitRate * 10) / 10,
    },
    unsettled: {
      order_count: unsettledOrderIds.length,
      card_count: unsettledCardCount,
      total_revenue: Math.round(unsettledRevenue),
      platform_fees: Math.round(unsettledPlatformFees),
      platform_rate: Math.round(unsettledPlatformRate * 10) / 10,
      product_cost: Math.round(unsettledCost),
      est_profit: Math.round(unsettledEstProfit),
      profit_rate: Math.round(unsettledProfitRate * 10) / 10,
    },
  })
}
