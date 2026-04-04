import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdminAuth, getUnauthorizedResponse } from '@/lib/admin'

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const aggregation = searchParams.get('aggregation') || 'day' // day | month | quarter | year
  const startStr = searchParams.get('startDate')
  const endStr = searchParams.get('endDate')

  const supabase = createAdminClient()

  // 1. 決定區間
  let startDate: Date
  let endDate: Date = endStr ? new Date(endStr) : new Date()

  if (startStr) {
    startDate = new Date(startStr)
  } else {
    startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)
  }
  startDate.setHours(0, 0, 0, 0)
  endDate.setHours(23, 59, 59, 999)

  // 2. 數據獲取
  const { data: membersRaw } = await supabase
    .from('members')
    .select('created_at')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  const { data: skuStats } = await supabase
    .from('order_skus')
    .select('subtotal, created_at, quantity, bc_sku_id, cost_price')
    .neq('status', 'cancelled')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  // cost_price 已存在 order_skus 中（TWD，結帳時鎖定），不需要從 bc_products 讀取

  const { data: orderHistory } = await supabase
    .from('sub_orders')
    .select('id, order_id, created_at, orders!inner(member_id)')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })

  // 3. 回購計算 (全量數據或至少是大於區間的數據以保證準確)
  const memberOrders = new Map<string, string[]>()
  for (const o of orderHistory || []) {
    const mid = (o.orders as any).member_id
    if (!mid) continue
    if (!memberOrders.has(mid)) memberOrders.set(mid, [])
    memberOrders.get(mid)!.push(o.created_at)
  }
  let totalOrderedMembers = memberOrders.size
  let repurchasedMembers = 0
  let totalIntervalMs = 0
  let intervalCount = 0
  memberOrders.forEach((times) => {
    if (times.length > 1) {
      repurchasedMembers++
      const t1 = new Date(times[0]).getTime()
      const t2 = new Date(times[1]).getTime()
      totalIntervalMs += (t2 - t1)
      intervalCount++
    }
  })
  const repurchaseRate = totalOrderedMembers > 0 ? (repurchasedMembers / totalOrderedMembers) : 0
  const avgRepurchaseDays = intervalCount > 0 ? (totalIntervalMs / intervalCount / (1000 * 60 * 60 * 24)) : 0

  // 4. 數據聚合與增長率計算
  function getGroupKey(dateStr: string) {
    const d = new Date(dateStr)
    const Y = d.getFullYear()
    const M = String(d.getMonth() + 1).padStart(2, '0')
    if (aggregation === 'year') return `${Y}`
    if (aggregation === 'quarter') {
      const Q = Math.floor(d.getMonth() / 3) + 1
      return `${Y}-Q${Q}`
    }
    if (aggregation === 'month') return `${Y}-${M}`
    return dateStr.split('T')[0]
  }

  const metricsMap = new Map<string, { members: number, revenue: number, volume: number, cost: number }>()

  membersRaw?.forEach(m => {
    const key = getGroupKey(m.created_at)
    if (!metricsMap.has(key)) metricsMap.set(key, { members: 0, revenue: 0, volume: 0, cost: 0 })
    metricsMap.get(key)!.members += 1
  })

  skuStats?.forEach(s => {
    const key = getGroupKey(s.created_at)
    if (!metricsMap.has(key)) metricsMap.set(key, { members: 0, revenue: 0, volume: 0, cost: 0 })
    const m = metricsMap.get(key)!
    const rev = Number(s.subtotal) || 0
    const qty = Number(s.quantity) || 1
    m.revenue += rev
    m.volume += qty
    m.cost += (Number(s.cost_price) || 0) * qty
  })

  // 補齊時間區間內的空缺
  const trend: any[] = []
  const cur = new Date(startDate)
  while (cur <= endDate) {
    const key = getGroupKey(cur.toISOString())
    if (!metricsMap.has(key)) metricsMap.set(key, { members: 0, revenue: 0, volume: 0, cost: 0 })
    
    // 按維度遞增 cur
    if (aggregation === 'year') cur.setFullYear(cur.getFullYear() + 1)
    else if (aggregation === 'quarter') cur.setMonth(cur.getMonth() + 3)
    else if (aggregation === 'month') cur.setMonth(cur.getMonth() + 1)
    else cur.setDate(cur.getDate() + 1)
  }

  const sortedKeys = Array.from(metricsMap.keys()).sort()
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i]
    const data = metricsMap.get(key)!
    const prev = i > 0 ? metricsMap.get(sortedKeys[i - 1]) : null

    function getGrowth(curVal: number, prevVal: number | undefined) {
      if (!prevVal || prevVal === 0) return curVal > 0 ? 1 : 0
      return (curVal - prevVal) / prevVal
    }

    trend.push({
      date: key,
      ...data,
      profit: data.revenue - data.cost,
      margin: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) : 0,
      membersGrowth: getGrowth(data.members, prev?.members),
      revenueGrowth: getGrowth(data.revenue, prev?.revenue),
      volumeGrowth: getGrowth(data.volume, prev?.volume)
    })
  }

  const totalStats = trend.reduce((acc, curr) => ({
    revenue: acc.revenue + curr.revenue,
    cost: acc.cost + curr.cost,
    volume: acc.volume + curr.volume,
  }), { revenue: 0, cost: 0, volume: 0 })

  return NextResponse.json({
    trend,
    summary: {
      ...totalStats,
      profit: totalStats.revenue - totalStats.cost,
      margin: totalStats.revenue > 0 ? (totalStats.revenue - totalStats.cost) / totalStats.revenue : 0,
      repurchaseRate,
      avgRepurchaseDays
    }
  })
}

