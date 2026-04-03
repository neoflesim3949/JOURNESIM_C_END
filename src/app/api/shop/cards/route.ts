import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCardExpiry, getPlanUsageV2, getEsimServiceStatus, getDailyTraffic, verifyIccid, getRealNameStatus, getEsimRechargeProducts } from '@/lib/billionconnect'

// GET — 取得用戶所有卡片（訂單 + 手動新增）
export async function GET(request: Request) {
  const serverSupabase = await createClient()
  const { data: { user } } = await serverSupabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') // list | detail | usage | today
  const iccid = searchParams.get('iccid')

  const supabase = createAdminClient()

  // ─── detail：查詢卡片詳情 ──────────────────────────────────
  if (action === 'detail' && iccid) {
    const isManual = searchParams.get('manual') === '1'

    if (isManual) {
      // 手動卡片：只查 expiry + service_status + 當日流量
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const [expiry, serviceStatus, todayTraffic] = await Promise.all([
        getCardExpiry([iccid]).catch(() => []),
        getEsimServiceStatus(iccid).catch(() => null),
        getDailyTraffic({ iccid, beginDate: today, endDate: today }).catch(() => []),
      ])
      return NextResponse.json({
        iccid,
        is_manual: true,
        expiry: Array.isArray(expiry) ? expiry[0] || null : null,
        service_status: serviceStatus,
        today_traffic: Array.isArray(todayTraffic) ? todayTraffic : [],
      })
    }

    // 一般訂單卡片：查詢全部資訊
    const now = new Date()
    const begin = new Date(now.getTime() - 7 * 86400000)

    const [expiry, serviceStatus, usage, traffic, verify, realName, rechargeProducts] = await Promise.all([
      getCardExpiry([iccid]).catch(() => []),
      getEsimServiceStatus(iccid).catch(() => null),
      getPlanUsageV2({ iccid }).catch(() => null),
      getDailyTraffic({
        iccid,
        beginDate: begin.toISOString().slice(0, 10).replace(/-/g, ''),
        endDate: now.toISOString().slice(0, 10).replace(/-/g, ''),
      }).catch(() => []),
      verifyIccid(iccid).catch(() => null),
      getRealNameStatus(iccid).catch(() => null),
      getEsimRechargeProducts(iccid).catch(() => null),
    ])

    return NextResponse.json({
      iccid,
      is_manual: false,
      expiry: Array.isArray(expiry) ? expiry[0] || null : null,
      service_status: serviceStatus,
      usage,
      traffic: Array.isArray(traffic) ? traffic : [],
      verify,
      real_name: realName,
      recharge_products: rechargeProducts,
    })
  }

  // ─── list：列出所有卡片 ───────────────────────────────────
  const [ordersRes, manualRes] = await Promise.all([
    supabase.from('orders').select('id').eq('member_id', user.id),
    supabase.from('member_iccids').select('*').eq('member_id', user.id).order('created_at'),
  ])

  const cards: {
    iccid: string; type: 'esim' | 'sim'; is_manual: boolean
    product_name: string | null; display_name: string | null; nickname: string | null
    bc_sku_id: string; copies: string; days: number | null
    lpa_code: string | null; qr_code_url: string | null
    status: string
  }[] = []

  // 訂單卡片
  const orders = ordersRes.data || []
  if (orders.length > 0) {
    const orderIds = orders.map((o) => o.id)
    const { data: subOrders } = await supabase.from('sub_orders')
      .select('id, category').in('order_id', orderIds)

    if (subOrders && subOrders.length > 0) {
      const subIds = subOrders.map((s) => s.id)
      const subMap = new Map(subOrders.map((s) => [s.id, s]))

      const { data: skus } = await supabase.from('order_skus')
        .select('id, sub_order_id, bc_sku_id, bc_sku_name, product_name, display_name, copies, days, iccid, sim_iccid, lpa_code, qr_code_url, status')
        .in('sub_order_id', subIds)

      for (const sku of skus || []) {
        const sub = subMap.get(sku.sub_order_id)
        if (!sub) continue
        const isEsim = sub.category === 'esim'
        const iccids = isEsim ? (sku.iccid as string[] || []) : (sku.sim_iccid as string[] || [])
        for (const ic of iccids) {
          cards.push({
            iccid: ic, type: isEsim ? 'esim' : 'sim', is_manual: false,
            product_name: sku.product_name, display_name: sku.display_name, nickname: null,
            bc_sku_id: sku.bc_sku_id, copies: sku.copies, days: sku.days,
            lpa_code: isEsim ? sku.lpa_code : null, qr_code_url: isEsim ? sku.qr_code_url : null,
            status: sku.status,
          })
        }
      }
    }
  }

  // 手動新增的卡片（去重：排除已在訂單中的）
  const existingIccids = new Set(cards.map((c) => c.iccid))
  for (const mi of manualRes.data || []) {
    if (!existingIccids.has(mi.iccid)) {
      cards.push({
        iccid: mi.iccid, type: mi.card_type as 'esim' | 'sim', is_manual: true,
        product_name: null, display_name: null, nickname: mi.nickname || null,
        bc_sku_id: '', copies: '', days: null,
        lpa_code: null, qr_code_url: null, status: 'manual',
      })
    }
  }

  return NextResponse.json(cards)
}

// POST — 手動新增卡號
export async function POST(request: Request) {
  const serverSupabase = await createClient()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const body = await request.json()
  const { iccid, card_type = 'esim', nickname } = body

  if (!iccid || typeof iccid !== 'string' || iccid.trim().length < 10) {
    return NextResponse.json({ error: 'ICCID 格式不正確' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('member_iccids').upsert({
    member_id: user.id,
    iccid: iccid.trim(),
    card_type,
    nickname: nickname || null,
  }, { onConflict: 'member_id,iccid' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE — 移除手動新增的卡號
export async function DELETE(request: Request) {
  const serverSupabase = await createClient()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const { iccid } = await request.json()
  if (!iccid) return NextResponse.json({ error: '缺少 ICCID' }, { status: 400 })

  const supabase = createAdminClient()
  await supabase.from('member_iccids').delete()
    .eq('member_id', user.id).eq('iccid', iccid)

  return NextResponse.json({ success: true })
}
