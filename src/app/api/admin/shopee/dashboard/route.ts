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

  // 帳號 id → 名稱（已/未結算明細共用）
  const { data: accRows } = await supabase.from('shopee_accounts').select('id, name')
  const accMap = new Map((accRows || []).map(a => [a.id, a.name]))

  // ─── 3. 已結算 stats ──────────────────────────────────────────────
  let settledCost = 0
  let settledCardCount = 0
  const costByOrder = new Map<string, number>(), cardsByOrder = new Map<string, number>(), itemsTotalByOrder = new Map<string, number>()
  if (settledOrderIds.length > 0) {
    for (let i = 0; i < settledOrderIds.length; i += 500) {
      const batch = settledOrderIds.slice(i, i + 500)
      const { data: items } = await supabase.from('shopee_order_items')
        .select('shopee_order_id, cost_twd, quantity, sale_price, original_price').in('shopee_order_id', batch)
      for (const it of items || []) {
        const c = (it.cost_twd ?? 0) * (it.quantity ?? 1)
        settledCost += c
        settledCardCount += it.quantity ?? 0
        costByOrder.set(it.shopee_order_id, (costByOrder.get(it.shopee_order_id) || 0) + c)
        cardsByOrder.set(it.shopee_order_id, (cardsByOrder.get(it.shopee_order_id) || 0) + (it.quantity ?? 0))
        const itRev = (it.sale_price ?? it.original_price ?? 0) * (it.quantity ?? 1)
        itemsTotalByOrder.set(it.shopee_order_id, (itemsTotalByOrder.get(it.shopee_order_id) || 0) + itRev)
      }
    }
  }

  let settledPlatformFees = 0, settledWallet = 0
  const settleRevByOrder = new Map<string, number>(), feesByOrder = new Map<string, number>(), walletByOrder = new Map<string, number>()
  for (const s of allSettlements) {
    const rev = Math.abs(s.original_price ?? 0)
    const fees = Math.abs(s.ams_fee ?? 0) + Math.abs(s.transaction_fee ?? 0) + Math.abs(s.other_service_fee ?? 0) + Math.abs(s.processing_fee ?? 0)
    settledPlatformFees += fees
    settledWallet += s.wallet_amount ?? 0
    const oid = s.shopee_order_id as string
    if (oid) {
      settleRevByOrder.set(oid, (settleRevByOrder.get(oid) || 0) + rev)
      feesByOrder.set(oid, (feesByOrder.get(oid) || 0) + fees)
      walletByOrder.set(oid, (walletByOrder.get(oid) || 0) + (s.wallet_amount ?? 0))
    }
  }

  // 每筆商品原價：結算單原價 > 0 用之，否則退回明細活動價合計（與訂單明細一致）
  let settledRevenue = 0
  const revByOrder = new Map<string, number>()
  for (const oid of settledOrderIds) {
    const sr = settleRevByOrder.get(oid) || 0
    const fr = sr > 0 ? sr : (itemsTotalByOrder.get(oid) || 0)
    revByOrder.set(oid, fr); settledRevenue += fr
  }

  // 已結算訂單明細
  const settledOrders: { id: string; order_number: string; buyer: string; account: string; date: string | null; status: string; revenue: number; fees: number; cost: number; wallet: number; cards: number }[] = []
  if (settledOrderIds.length > 0) {
    for (let i = 0; i < settledOrderIds.length; i += 500) {
      const batch = settledOrderIds.slice(i, i + 500)
      const { data: ord } = await supabase.from('shopee_orders')
        .select('id, shopee_order_number, buyer_account, shopee_account_id, order_date, order_status').in('id', batch)
      for (const o of ord || []) {
        settledOrders.push({
          id: o.id, order_number: o.shopee_order_number, buyer: o.buyer_account || '-',
          account: (o.shopee_account_id ? accMap.get(o.shopee_account_id) : null) || '-',
          date: o.order_date, status: o.order_status || '-',
          revenue: Math.round(revByOrder.get(o.id) || 0), fees: Math.round(feesByOrder.get(o.id) || 0),
          cost: Math.round(costByOrder.get(o.id) || 0), wallet: Math.round(walletByOrder.get(o.id) || 0),
          cards: cardsByOrder.get(o.id) || 0,
        })
      }
    }
  }
  settledOrders.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  // 利潤 = 商品總價 − 平台費用 − 商品成本
  const settledProfit = settledRevenue - settledPlatformFees - settledCost
  const settledPlatformRate = settledRevenue > 0 ? (settledPlatformFees / settledRevenue) * 100 : 0
  const settledProfitRate = settledRevenue > 0 ? (settledProfit / settledRevenue) * 100 : 0

  // ─── 4. 未結算 stats（從 shopee_orders 估算）──────────────────────
  type OrderStat = { id: string; order_number: string; buyer: string; account: string; date: string | null; status: string; revenue: number; fees: number; cost: number; cards: number }
  let unsettledRevenue = 0, unsettledPlatformFees = 0, unsettledCost = 0, unsettledCardCount = 0
  let bfRevenue = 0, bfPlatformFees = 0, bfCost = 0, bfCardCount = 0  // 已回填（未結算中卡號已填、未送BC）
  const unsettledOrders: OrderStat[] = []
  const backfilledOrders: OrderStat[] = []
  if (unsettledOrderIds.length > 0) {
    for (let i = 0; i < unsettledOrderIds.length; i += 500) {
      const batch = unsettledOrderIds.slice(i, i + 500)
      const { data: orders } = await supabase.from('shopee_orders')
        .select('id, shopee_order_number, buyer_account, shopee_account_id, order_date, order_status, internal_status, product_total, transaction_fee, other_service_fee, payment_processing_fee, shopee_order_items(cost_twd, quantity, sale_price, original_price, status)')
        .in('id', batch)
      for (const o of orders || []) {
        const oFees = Math.abs(o.transaction_fee ?? 0) + Math.abs(o.other_service_fee ?? 0) + Math.abs(o.payment_processing_fee ?? 0)
        unsettledPlatformFees += oFees
        const items = o.shopee_order_items as { cost_twd: number | null; quantity: number; sale_price: number | null; original_price: number | null; status: string | null }[] | null
        // 商品原價＝明細活動價×數量合計（與訂單明細/列表一致），無明細才退回 product_total
        let itemsTotal = 0, oCost = 0, oCards = 0
        if (items) {
          for (const it of items) {
            itemsTotal += (it.sale_price ?? it.original_price ?? 0) * (it.quantity ?? 1)
            oCost += (it.cost_twd ?? 0) * (it.quantity ?? 1)
            oCards += it.quantity ?? 0
          }
        }
        const oRev = itemsTotal > 0 ? itemsTotal : (o.product_total ?? 0)
        unsettledRevenue += oRev; unsettledCost += oCost; unsettledCardCount += oCards
        // 已回填：所有商品都已填卡號(iccid_filled/bc_ordered/completed)、但尚未全部送出BC
        const arr = items || []
        const allCardFilled = arr.length > 0 && arr.every(it => ['iccid_filled', 'bc_ordered', 'completed'].includes(it.status || ''))
        const allOrdered = arr.length > 0 && arr.every(it => ['bc_ordered', 'completed'].includes(it.status || ''))
        const stat: OrderStat = {
          id: o.id, order_number: o.shopee_order_number, buyer: o.buyer_account || '-',
          account: (o.shopee_account_id ? accMap.get(o.shopee_account_id) : null) || '-',
          date: o.order_date, status: o.order_status || '-', revenue: Math.round(oRev), fees: Math.round(oFees), cost: Math.round(oCost), cards: oCards,
        }
        if (allCardFilled && !allOrdered) {
          bfRevenue += oRev; bfPlatformFees += oFees; bfCost += oCost; bfCardCount += oCards
          backfilledOrders.push(stat)
        }
        unsettledOrders.push({
          id: o.id, order_number: o.shopee_order_number, buyer: o.buyer_account || '-',
          account: (o.shopee_account_id ? accMap.get(o.shopee_account_id) : null) || '-',
          date: o.order_date, status: o.order_status || '-', revenue: Math.round(oRev), fees: Math.round(oFees), cost: Math.round(oCost), cards: oCards,
        })
      }
    }
  }
  unsettledOrders.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  backfilledOrders.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const unsettledEstProfit = unsettledRevenue - unsettledPlatformFees - unsettledCost
  const unsettledPlatformRate = unsettledRevenue > 0 ? (unsettledPlatformFees / unsettledRevenue) * 100 : 0
  const unsettledProfitRate = unsettledRevenue > 0 ? (unsettledEstProfit / unsettledRevenue) * 100 : 0
  const bfProfit = bfRevenue - bfPlatformFees - bfCost
  const bfPlatformRate = bfRevenue > 0 ? (bfPlatformFees / bfRevenue) * 100 : 0
  const bfProfitRate = bfRevenue > 0 ? (bfProfit / bfRevenue) * 100 : 0

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
      orders: settledOrders,
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
      orders: unsettledOrders,
    },
    backfilled: {
      order_count: backfilledOrders.length,
      card_count: bfCardCount,
      total_revenue: Math.round(bfRevenue),
      platform_fees: Math.round(bfPlatformFees),
      platform_rate: Math.round(bfPlatformRate * 10) / 10,
      product_cost: Math.round(bfCost),
      est_profit: Math.round(bfProfit),
      profit_rate: Math.round(bfProfitRate * 10) / 10,
      orders: backfilledOrders,
    },
  })
}
