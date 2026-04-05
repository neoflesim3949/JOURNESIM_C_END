import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''

  const supabase = createAdminClient()

  // 查有金流結算的訂單
  let query = supabase.from('shopee_settlements')
    .select('shopee_order_id, original_price, seller_coupon, ams_fee, transaction_fee, other_service_fee, processing_fee, wallet_amount')

  if (from) query = query.gte('wallet_date', from)
  if (to) query = query.lte('wallet_date', to + 'T23:59:59')

  const { data: settlements } = await query

  if (!settlements || settlements.length === 0) {
    return NextResponse.json({ total_revenue: 0, platform_fees: 0, platform_rate: 0, product_cost: 0, profit: 0, profit_rate: 0, order_count: 0 })
  }

  // 查商品成本
  const orderIds = [...new Set(settlements.map(s => s.shopee_order_id).filter(Boolean))]
  let totalCost = 0
  if (orderIds.length > 0) {
    const { data: items } = await supabase.from('shopee_order_items')
      .select('shopee_order_id, cost_twd, quantity')
      .in('shopee_order_id', orderIds)
    if (items) {
      totalCost = items.reduce((sum, i) => sum + ((i.cost_twd ?? 0) * (i.quantity ?? 1)), 0)
    }
  }

  let totalRevenue = 0
  let platformFees = 0
  let walletTotal = 0

  for (const s of settlements) {
    totalRevenue += Math.abs(s.original_price ?? 0)
    platformFees += Math.abs(s.ams_fee ?? 0) + Math.abs(s.transaction_fee ?? 0) +
      Math.abs(s.other_service_fee ?? 0) + Math.abs(s.processing_fee ?? 0)
    walletTotal += s.wallet_amount ?? 0
  }

  const profit = walletTotal - totalCost
  const platformRate = totalRevenue > 0 ? (platformFees / totalRevenue) * 100 : 0
  const profitRate = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0

  return NextResponse.json({
    total_revenue: Math.round(totalRevenue),
    platform_fees: Math.round(platformFees),
    platform_rate: Math.round(platformRate * 10) / 10,
    wallet_total: Math.round(walletTotal),
    product_cost: Math.round(totalCost),
    profit: Math.round(profit),
    profit_rate: Math.round(profitRate * 10) / 10,
    order_count: settlements.length,
  })
}
