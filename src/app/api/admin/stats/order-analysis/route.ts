import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 訂單統計分析（bc_history_orders 採購訂單）
// GET ?from=&to=（訂單創建）&channel=&operator=&facets=1
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const supabase = createAdminClient()

  if (sp.get('facets')) {
    const { data } = await supabase.from('bc_history_orders').select('channel_name, operator').limit(100000)
    const uniq = (k: 'channel_name' | 'operator') => [...new Set((data || []).map(r => r[k]).filter(Boolean) as string[])].sort()
    return NextResponse.json({ channels: uniq('channel_name'), operators: uniq('operator') })
  }

  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const channel = sp.get('channel') || ''
  const operator = sp.get('operator') || ''

  interface R { platform_order_no: string | null; bc_order_no: string | null; product_name: string | null; channel_name: string | null; operator: string | null; order_type: string | null; order_created_at: string | null; settle_price: number | null; actual_price: number | null }
  const rows: R[] = []
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('bc_history_orders').select('platform_order_no, bc_order_no, product_name, channel_name, operator, order_type, order_created_at, settle_price, actual_price')
    if (from) q = q.gte('order_created_at', from)
    if (to) q = q.lte('order_created_at', to + 'T23:59:59')
    if (channel) q = q.eq('channel_name', channel)
    if (operator) q = q.eq('operator', operator)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    rows.push(...(data as R[]))
    if (data.length < 1000) break
  }

  const orders = new Set<string>()          // distinct 平台單|億點單
  let cards = 0, settle = 0, actual = 0
  const byMonth = new Map<string, { cards: number; settle: number; orders: Set<string> }>()
  const byProduct = new Map<string, { cards: number; settle: number }>()
  const byChannel = new Map<string, { cards: number; settle: number }>()
  const byOperator = new Map<string, { cards: number; settle: number }>()
  const byType = new Map<string, { cards: number; settle: number }>()
  const add = (m: Map<string, { cards: number; settle: number }>, k: string, s: number) => { const g = m.get(k) || { cards: 0, settle: 0 }; g.cards++; g.settle += s; m.set(k, g) }

  for (const r of rows) {
    const s = Number(r.settle_price) || 0
    cards++; settle += s; actual += Number(r.actual_price) || 0
    const ok = `${r.platform_order_no || ''}|${r.bc_order_no || ''}`
    orders.add(ok)
    const month = (r.order_created_at || '').slice(0, 7) || '—'
    const mg = byMonth.get(month) || { cards: 0, settle: 0, orders: new Set<string>() }
    mg.cards++; mg.settle += s; mg.orders.add(ok); byMonth.set(month, mg)
    add(byProduct, r.product_name || '—', s)
    add(byChannel, r.channel_name || '—', s)
    add(byOperator, r.operator || '—', s)
    add(byType, r.order_type || '—', s)
  }

  const arr = (m: Map<string, { cards: number; settle: number }>, n = 1000) => [...m].map(([name, g]) => ({ name, cards: g.cards, settle: Math.round(g.settle * 100) / 100 })).sort((a, b) => b.settle - a.settle).slice(0, n)

  // 售後退款 by month（來源 bc_history_aftersales；僅套用日期，售後表無渠道/操作員欄位）
  const refundByMonth = new Map<string, number>()
  let refundTotal = 0
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('bc_history_aftersales').select('aftersale_date, refund_amount')
    if (from) q = q.gte('aftersale_date', from.slice(0, 10))
    if (to) q = q.lte('aftersale_date', to.slice(0, 10))
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const mo = (r.aftersale_date || '').slice(0, 7); if (!mo) continue
      const amt = Number(r.refund_amount) || 0
      refundByMonth.set(mo, (refundByMonth.get(mo) || 0) + amt); refundTotal += amt
    }
    if (data.length < 1000) break
  }

  const allMonths = [...new Set([...byMonth.keys(), ...refundByMonth.keys()])].filter(m => m !== '—').sort()
  const months = allMonths.map(month => {
    const p = byMonth.get(month)
    const s = p ? Math.round(p.settle * 100) / 100 : 0
    const rf = Math.round((refundByMonth.get(month) || 0) * 100) / 100
    return { month, cards: p?.cards || 0, orders: p?.orders.size || 0, settle: s, refund: rf, net: Math.round((s - rf) * 100) / 100 }
  })

  return NextResponse.json({
    summary: {
      cards, orders: orders.size,
      settle: Math.round(settle * 100) / 100, actual: Math.round(actual * 100) / 100,
      refund: Math.round(refundTotal * 100) / 100, net: Math.round((settle - refundTotal) * 100) / 100,
    },
    months,
    products: arr(byProduct, 30),
    channels: arr(byChannel),
    operators: arr(byOperator),
    types: arr(byType),
  })
}
