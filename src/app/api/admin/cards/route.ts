import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCardExpiry, getPlanUsageV2, getDailyTraffic } from '@/lib/billionconnect'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

export async function GET(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') // list | expiry | usage | traffic
  const iccid = searchParams.get('iccid')

  const supabase = createAdminClient()

  // ─── list：列出所有 ICCID（從 order_skus 收集）──────────────
  if (action === 'list' || !action) {
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')

    // 從 order_skus 收集所有 ICCID
    type SkuRow = {
      id: string; sub_order_id: string; bc_sku_id: string; bc_sku_name: string | null
      product_name: string | null; display_name: string | null
      copies: string; quantity: number; iccid: string[] | null; sim_iccid: string[] | null
      status: string
    }

    const allCards: {
      iccid: string; type: 'esim' | 'sim'; bc_sku_name: string | null
      product_name: string | null; order_number: string | null; order_id: string | null
      sub_order_number: string | null; status: string
    }[] = []

    // 分批拉取
    let from = 0
    while (true) {
      const { data: skus } = await supabase.from('order_skus')
        .select('id, sub_order_id, bc_sku_id, bc_sku_name, product_name, display_name, copies, quantity, iccid, sim_iccid, status')
        .range(from, from + 999)
      if (!skus || skus.length === 0) break

      // 取得 sub_orders 資訊
      const subIds = [...new Set(skus.map((s) => s.sub_order_id))]
      const { data: subs } = await supabase.from('sub_orders')
        .select('id, order_id, sub_order_number, category').in('id', subIds)
      const subMap = new Map((subs || []).map((s) => [s.id, s]))

      // 取得 orders 資訊
      const orderIds = [...new Set((subs || []).map((s) => s.order_id))]
      const { data: orders } = await supabase.from('orders')
        .select('id, order_number').in('id', orderIds)
      const orderMap = new Map((orders || []).map((o) => [o.id, o]))

      for (const sku of skus as SkuRow[]) {
        const sub = subMap.get(sku.sub_order_id)
        if (!sub) continue
        const order = orderMap.get(sub.order_id)
        const isEsim = sub.category === 'esim'
        const iccids = isEsim ? (sku.iccid || []) : (sku.sim_iccid || [])

        for (const ic of iccids) {
          allCards.push({
            iccid: ic,
            type: isEsim ? 'esim' : 'sim',
            bc_sku_name: sku.product_name ? `${sku.product_name} - ${sku.display_name || sku.bc_sku_name}` : sku.bc_sku_name,
            product_name: sku.product_name,
            order_number: order?.order_number || null,
            order_id: order?.id || null,
            sub_order_number: sub.sub_order_number,
            status: sku.status,
          })
        }
      }

      if (skus.length < 1000) break
      from += 1000
    }

    // 搜尋過濾
    let filtered = allCards
    if (search) {
      const q = search.toLowerCase()
      filtered = allCards.filter((c) =>
        c.iccid.toLowerCase().includes(q) ||
        (c.order_number || '').toLowerCase().includes(q) ||
        (c.bc_sku_name || '').toLowerCase().includes(q)
      )
    }

    // 分頁
    const total = filtered.length
    const start = (page - 1) * pageSize
    const paged = filtered.slice(start, start + pageSize)

    return NextResponse.json({ data: paged, total })
  }

  // ─── expiry：F010 卡片有效期 ──────────────────────────────
  if (action === 'expiry' && iccid) {
    try {
      const result = await getCardExpiry([iccid])
      return NextResponse.json({ expiry: Array.isArray(result) ? result[0] || null : null })
    } catch {
      return NextResponse.json({ expiry: null })
    }
  }

  // ─── usage：F046 套餐使用資訊（帶 channelOrderId 查特定訂單）──
  if (action === 'usage' && iccid) {
    const channelOrderId = searchParams.get('channelOrderId') || ''
    try {
      const result = await getPlanUsageV2({ iccid, ...(channelOrderId ? { channelOrderId } : {}) })
      return NextResponse.json({ usage: result })
    } catch {
      return NextResponse.json({ usage: null })
    }
  }

  // ─── traffic：F023 日流量 ─────────────────────────────────
  if (action === 'traffic' && iccid) {
    const beginDate = searchParams.get('beginDate') || ''
    const endDate = searchParams.get('endDate') || ''
    if (!beginDate || !endDate) return NextResponse.json({ traffic: [] })

    try {
      const raw = await getDailyTraffic({ iccid, beginDate, endDate }).catch(() => [])
      const items = Array.isArray(raw) ? raw : []

      const mccs = [...new Set(items.map((t) => t.countryRegionCode).filter(Boolean))]
      let countryMap = new Map<string, string>()
      if (mccs.length > 0) {
        const { data: countries } = await supabase.from('bc_countries').select('mcc, name_zh, name').in('mcc', mccs)
        for (const c of countries || []) countryMap.set(c.mcc, c.name_zh || c.name)
      }

      const traffic = items.map((t) => ({
        usedDate: t.usedDate,
        country: countryMap.get(t.countryRegionCode) || t.country,
        usedAmountKB: parseFloat(t.usedAmount) || 0,
      }))

      return NextResponse.json({ traffic })
    } catch {
      return NextResponse.json({ traffic: [] })
    }
  }

  return NextResponse.json({ error: '無效 action' }, { status: 400 })
}
