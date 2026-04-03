import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBalance } from '@/lib/billionconnect'
import { formatCapacity } from '@/lib/format'
import { checkAdminAuth, getUnauthorizedResponse } from '@/lib/admin'

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') || '30')
  const typeFilter = searchParams.get('productType') || 'all'
  const aggregation = searchParams.get('aggregation') || 'day'

  const supabase = createAdminClient()

  // 1. Balance
  let balance = 0
  try {
    const bcBalance = await getBalance()
    // NOTE: 重點記錄 - 用於排查餘額顯示問題
    console.log('[BC_BALANCE_RESPONSE_FULL]', JSON.stringify(bcBalance))
    
    // BC API F014 可能回傳 availableBalance 或 saleBalance
    const rawBal = bcBalance.availableBalance || bcBalance.saleBalance
    if (rawBal) {
      // 移除可能存在的貨幣符號或逗號
      const cleanBal = String(rawBal).replace(/[^-0-9.]/g, '')
      balance = parseFloat(cleanBal) || 0
    }
  } catch (e) {
    console.error('[BC_BALANCE_ERROR] Failed to get balance', e)
    balance = 0
  }

  // 2. Real-time Status (Pending ICCID & Failed)
  const { data: pendingSkus } = await supabase
    .from('order_skus')
    .select('id, status, sim_iccid, sub_orders!inner(category)')
    .in('status', ['pending', 'failed'])

  let pending_sim = 0
  let failed_esim = 0
  for (const s of pendingSkus || []) {
    const category = (s.sub_orders as any)?.category
    if (category === 'sim' && s.status === 'pending' && (!s.sim_iccid || s.sim_iccid.length === 0)) {
      pending_sim++
    }
    if (category === 'esim' && s.status === 'failed') {
      failed_esim++
    }
  }

  // 3. Trend Analytics
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  startDate.setHours(0, 0, 0, 0)

  const { data: skus } = await supabase.from('order_skus')
    .select('id, created_at, subtotal, quantity, bc_sku_id, bc_sku_name, copies, days, package_plan_id, product_name, sub_orders!inner(id, order_id, category)')
    .gte('created_at', startDate.toISOString())
    .neq('status', 'cancelled')

  // Cost map & Region map
  const skuIds = [...new Set((skus || []).map(s => s.bc_sku_id).filter(Boolean))]
  const { data: bcProducts } = await supabase.from('bc_products').select('sku_id, name, cost_price, country_data, desc, high_flow_size, capacity').in('sku_id', skuIds)
  const costMap = new Map((bcProducts || []).map(p => [p.sku_id, Number(p.cost_price) || 0]))
  const regionMap = new Map((bcProducts || []).map(p => [p.sku_id, p.country_data]))
  const bcInfoMap = new Map((bcProducts || []).map(p => [p.sku_id, {
    highFlowSize: p.high_flow_size,
    capacity: p.capacity
  }]))

  // 4. Trend Aggregation Logic
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

  const trendMetrics = new Map<string, { revenue: number, skusCount: number, ordersSet: Set<string> }>()

  let totalEsim = 0
  let totalSim = 0
  const regionCounts: Record<string, number> = {}
  
  // 4. Metadata for Hierarchy
  const { data: packagePlans } = await supabase.from('package_plans').select('id, package_id, display_name, plan_category, packages(name)')
  const ppMap = new Map((packagePlans || []).map(p => [p.id, {
    packageId: p.package_id,
    packageName: (p as any).packages?.name || '未命名套餐',
    displayName: p.display_name,
    planCategory: p.plan_category
  }]))

  // 取得 package_id -> country 映射
  const { data: pkgCountries } = await supabase.from('country_packages')
    .select('package_id, mcc')

  // 取得 mcc -> country info
  const allMccs = [...new Set((pkgCountries || []).map((p) => p.mcc))]
  const { data: countryInfo } = allMccs.length > 0
    ? await supabase.from('bc_countries').select('mcc, scope, name_zh, name').in('mcc', allMccs)
    : { data: [] }
  const mccInfoMap = new Map((countryInfo || []).map((c) => [c.mcc, c]))

  const pkgCountryMap = new Map()
  for (const ps of pkgCountries || []) {
    const info = mccInfoMap.get(ps.mcc)
    if (info && !pkgCountryMap.has(ps.package_id)) {
      pkgCountryMap.set(ps.package_id, {
        scope: info.scope || 'local',
        name: info.name_zh || info.name || ps.mcc
      })
    }
  }

  const hotPlansMap = new Map<string, any>()
  let totalRevenue = 0
  let totalVolume = 0

  // 5. Processing Loop
  for (const s of skus || []) {
    const d = new Date(s.created_at)
    const tzOffset = d.getTimezoneOffset() * 60000;
    const dateStr = (new Date(d.getTime() - tzOffset)).toISOString();
    const groupKey = getGroupKey(dateStr)
    
    const category = (s.sub_orders as any)?.category
    if (typeFilter !== 'all' && typeFilter !== category) continue

    const revenue = Number(s.subtotal) || 0
    const quantity = Number(s.quantity) || 1
    const subOrder = s.sub_orders as any
    
    if (!trendMetrics.has(groupKey)) {
      trendMetrics.set(groupKey, { revenue: 0, skusCount: 0, ordersSet: new Set() })
    }
    
    const t = trendMetrics.get(groupKey)!
    t.revenue += revenue
    t.skusCount += quantity
    if (subOrder?.order_id) t.ordersSet.add(subOrder.order_id)

    if (category === 'esim') totalEsim += quantity
    if (category === 'sim') totalSim += quantity
    
    totalRevenue += revenue
    totalVolume += quantity

    if (s.bc_sku_id) {
      const ppInfo = s.package_plan_id ? ppMap.get(s.package_plan_id) : null
      const bcInfo = bcInfoMap.get(s.bc_sku_id)
      const packageName = ppInfo?.packageName || s.product_name || '未命名套餐'
      const countryInfo = ppInfo?.packageId ? pkgCountryMap.get(ppInfo.packageId) : null
      const scopeLevel = countryInfo?.name || '其他方案'
      
      // 更新區域統計 (改用 scopeLevel 使圓餅圖與表格一致)
      regionCounts[scopeLevel] = (regionCounts[scopeLevel] || 0) + 1

      let traffic = s.bc_sku_name || '未知流量'
      if (ppInfo) {
        if (ppInfo.displayName) traffic = ppInfo.displayName
        else {
          const isDaily = ppInfo.planCategory === 'daily'
          const sizeStr = isDaily ? bcInfo?.highFlowSize : bcInfo?.capacity
          traffic = formatCapacity(sizeStr, isDaily)
        }
      }

      const copiesStr = `${traffic}｜${s.days || 1}天`

      if (!hotPlansMap.has(scopeLevel)) hotPlansMap.set(scopeLevel, { id: `scope_${scopeLevel}`, name: scopeLevel, qty: 0, revenue: 0, childrenObj: {} })
      const rObj = hotPlansMap.get(scopeLevel)
      rObj.qty += 1
      rObj.revenue += revenue

      if (!rObj.childrenObj[packageName]) rObj.childrenObj[packageName] = { id: `pkg_${scopeLevel}_${packageName}`, name: packageName, qty: 0, revenue: 0, childrenObj: {} }
      const rPNameObj = rObj.childrenObj[packageName]
      rPNameObj.qty += 1
      rPNameObj.revenue += revenue

      if (!rPNameObj.childrenObj[copiesStr]) rPNameObj.childrenObj[copiesStr] = { id: `sku_${scopeLevel}_${packageName}_${copiesStr}`.replace(/\s+/g,''), name: copiesStr, qty: 0, revenue: 0 }
      const rCopiesObj = rPNameObj.childrenObj[copiesStr]
      rCopiesObj.qty += 1
      rCopiesObj.revenue += revenue
    }
  }

  function convertTree(mapValue: Map<string, any>): any[] {
    const arr = Array.from(mapValue.values() as any)
    arr.sort((a: any, b: any) => b.qty - a.qty)
    for (let item of arr as any[]) {
      if (item.childrenObj) {
        item.children = convertTree(new Map(Object.entries(item.childrenObj)))
        delete item.childrenObj
      }
    }
    return arr as any[]
  }

  const hotPlansTree = convertTree(hotPlansMap)
  const trend = Array.from(trendMetrics.entries()).map(([date, data]) => ({ 
    date, 
    revenue: data.revenue,
    skusCount: data.skusCount,
    ordersCount: data.ordersSet.size
  })).sort((a: any, b: any) => a.date.localeCompare(b.date))
  
  const innerPie = [
    { name: 'eSIM', value: totalEsim },
    { name: 'SIM', value: totalSim }
  ].filter(i => i.value > 0)
  
  const outerPie = Object.entries(regionCounts).map(([name, value]) => ({ name, value }))

  return NextResponse.json({
    balance,
    realtime: { pending_sim, failed_esim },
    trend,
    distribution: { inner: innerPie, outer: outerPie },
    hotPlansTree,
    summary: { totalRevenue, totalVolume }
  })
}

