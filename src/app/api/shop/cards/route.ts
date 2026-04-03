import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCardExpiry, getPlanUsageV2, getEsimServiceStatus, getDailyTraffic, verifyIccid, getRealNameStatus, getEsimRechargeProducts } from '@/lib/billionconnect'

// GET — 取得用戶所有卡片（從訂單中的 ICCID 收集）
export async function GET(request: Request) {
  const serverSupabase = await createClient()
  const { data: { user } } = await serverSupabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') // list | detail | usage
  const iccid = searchParams.get('iccid')

  const supabase = createAdminClient()

  if (action === 'detail' && iccid) {
    // 一次查詢所有 ICCID 相關資訊
    const now = new Date()
    const begin = new Date(now.getTime() - 7 * 86400000)

    const [expiry, serviceStatus, usage, traffic, verify, realName, rechargeProducts] = await Promise.all([
      getCardExpiry([iccid]).catch(() => []),                              // F010
      getEsimServiceStatus(iccid).catch(() => null),                      // F042
      getPlanUsageV2({ iccid }).catch(() => null),                        // F046
      getDailyTraffic({                                                    // F023
        iccid,
        beginDate: begin.toISOString().slice(0, 10).replace(/-/g, ''),
        endDate: now.toISOString().slice(0, 10).replace(/-/g, ''),
      }).catch(() => []),
      verifyIccid(iccid).catch(() => null),                               // F013
      getRealNameStatus(iccid).catch(() => null),                          // F054
      getEsimRechargeProducts(iccid).catch(() => null),                   // F052
    ])

    return NextResponse.json({
      iccid,
      expiry: Array.isArray(expiry) ? expiry[0] || null : null,
      service_status: serviceStatus,
      usage,
      traffic: Array.isArray(traffic) ? traffic : [],
      verify,
      real_name: realName,
      recharge_products: rechargeProducts,
    })
  }

  // 預設：列出所有卡片
  // 從 orders → sub_orders → order_skus 收集 ICCID
  const { data: orders } = await supabase.from('orders')
    .select('id').eq('member_id', user.id)

  if (!orders || orders.length === 0) return NextResponse.json([])

  const orderIds = orders.map((o) => o.id)

  const { data: subOrders } = await supabase.from('sub_orders')
    .select('id, category, sub_order_number')
    .in('order_id', orderIds)

  if (!subOrders || subOrders.length === 0) return NextResponse.json([])

  const subIds = subOrders.map((s) => s.id)
  const subMap = new Map(subOrders.map((s) => [s.id, s]))

  const { data: skus } = await supabase.from('order_skus')
    .select('id, sub_order_id, bc_sku_id, bc_sku_name, product_name, display_name, copies, days, iccid, sim_iccid, lpa_code, qr_code_url, status')
    .in('sub_order_id', subIds)

  // 收集所有有 ICCID 的卡片
  const cards: {
    iccid: string; type: 'esim' | 'sim'
    product_name: string | null; display_name: string | null
    bc_sku_id: string; copies: string; days: number | null
    lpa_code: string | null; qr_code_url: string | null
    status: string
  }[] = []

  for (const sku of skus || []) {
    const sub = subMap.get(sku.sub_order_id)
    if (!sub) continue
    const isEsim = sub.category === 'esim'

    const iccids = isEsim ? (sku.iccid as string[] || []) : (sku.sim_iccid as string[] || [])
    for (const ic of iccids) {
      cards.push({
        iccid: ic,
        type: isEsim ? 'esim' : 'sim',
        product_name: sku.product_name,
        display_name: sku.display_name,
        bc_sku_id: sku.bc_sku_id,
        copies: sku.copies,
        days: sku.days,
        lpa_code: isEsim ? sku.lpa_code : null,
        qr_code_url: isEsim ? sku.qr_code_url : null,
        status: sku.status,
      })
    }
  }

  return NextResponse.json(cards)
}
