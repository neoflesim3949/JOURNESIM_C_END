import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 訂單統計分析（bc_history_orders 採購訂單）
//   渠道改為 TAB：一次計算「全部＋各渠道」，前端切 TAB 不重跑
// GET ?from=&to=（訂單創建）&operator=&facets=1
const ALL = '全部'

interface Bkt {
  cards: number; settle: number; actual: number; orders: Set<string>
  byMonth: Map<string, { cards: number; settle: number; orders: Set<string> }>
  byProduct: Map<string, { cards: number; settle: number }>
  byChannel: Map<string, { cards: number; settle: number }>
  byOperator: Map<string, { cards: number; settle: number }>
  byType: Map<string, { cards: number; settle: number }>
  refundByMonth: Map<string, number>; refundTotal: number
  refundCntByMonth: Map<string, number>; refundCntTotal: number   // 售後筆數（供訂單量視角）
}
const newBkt = (): Bkt => ({ cards: 0, settle: 0, actual: 0, orders: new Set(), byMonth: new Map(), byProduct: new Map(), byChannel: new Map(), byOperator: new Map(), byType: new Map(), refundByMonth: new Map(), refundTotal: 0, refundCntByMonth: new Map(), refundCntTotal: 0 })
const add = (m: Map<string, { cards: number; settle: number }>, k: string, s: number) => { const g = m.get(k) || { cards: 0, settle: 0 }; g.cards++; g.settle += s; m.set(k, g) }
const arr = (m: Map<string, { cards: number; settle: number }>, n = 1000) => [...m].map(([name, g]) => ({ name, cards: g.cards, settle: Math.round(g.settle * 100) / 100 })).sort((a, b) => b.settle - a.settle).slice(0, n)

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const supabase = createAdminClient()

  if (sp.get('facets')) {
    const { data } = await supabase.from('bc_history_orders').select('operator').limit(100000)
    const operators = [...new Set((data || []).map(r => r.operator).filter(Boolean) as string[])].sort()
    return NextResponse.json({ operators })
  }

  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const operator = sp.get('operator') || ''

  // 億點單號 → 渠道/操作員（供售後歸因）
  const orderMeta = new Map<string, { channel: string | null; operator: string | null }>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('bc_history_orders').select('bc_order_no, channel_name, operator').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) { if (r.bc_order_no && !orderMeta.has(r.bc_order_no as string)) orderMeta.set(r.bc_order_no as string, { channel: (r.channel_name as string) || null, operator: (r.operator as string) || null }) }
    if (data.length < 1000) break
  }

  const buckets = new Map<string, Bkt>()
  const bkt = (k: string) => { let b = buckets.get(k); if (!b) { b = newBkt(); buckets.set(k, b) } return b }
  bkt(ALL)
  const channelSet = new Set<string>()

  interface R { platform_order_no: string | null; bc_order_no: string | null; product_name: string | null; channel_name: string | null; operator: string | null; order_type: string | null; order_created_at: string | null; settle_price: number | null; actual_price: number | null }
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('bc_history_orders').select('platform_order_no, bc_order_no, product_name, channel_name, operator, order_type, order_created_at, settle_price, actual_price')
    if (from) q = q.gte('order_created_at', from)
    if (to) q = q.lte('order_created_at', to + 'T23:59:59')
    if (operator) q = q.eq('operator', operator)
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data as R[]) {
      const s = Number(r.settle_price) || 0
      const ch = r.channel_name || '—'
      channelSet.add(ch)
      const ok = `${r.platform_order_no || ''}|${r.bc_order_no || ''}`
      const month = (r.order_created_at || '').slice(0, 7) || '—'
      for (const b of [bkt(ALL), bkt(ch)]) {
        b.cards++; b.settle += s; b.actual += Number(r.actual_price) || 0; b.orders.add(ok)
        const mg = b.byMonth.get(month) || { cards: 0, settle: 0, orders: new Set<string>() }
        mg.cards++; mg.settle += s; mg.orders.add(ok); b.byMonth.set(month, mg)
        add(b.byProduct, r.product_name || '—', s)
        add(b.byChannel, ch, s)
        add(b.byOperator, r.operator || '—', s)
        add(b.byType, r.order_type || '—', s)
      }
    }
    if (data.length < 1000) break
  }

  // 售後退款：以億點單號歸因渠道（＋操作員篩選），加到「全部」與該渠道
  for (let f = 0; ; f += 1000) {
    let q = supabase.from('bc_history_aftersales').select('aftersale_date, refund_amount, bc_order_no')
    if (from) q = q.gte('aftersale_date', from.slice(0, 10))
    if (to) q = q.lte('aftersale_date', to.slice(0, 10))
    const { data } = await q.range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const meta = r.bc_order_no ? orderMeta.get(r.bc_order_no as string) : undefined
      if (operator && (meta?.operator || '') !== operator) continue
      const mo = (r.aftersale_date || '').slice(0, 7); if (!mo) continue
      const amt = Number(r.refund_amount) || 0
      const targets = [bkt(ALL)]
      if (meta?.channel) targets.push(bkt(meta.channel))   // 對不到渠道的只計入「全部」
      for (const b of targets) {
        b.refundByMonth.set(mo, (b.refundByMonth.get(mo) || 0) + amt); b.refundTotal += amt
        b.refundCntByMonth.set(mo, (b.refundCntByMonth.get(mo) || 0) + 1); b.refundCntTotal += 1
      }
    }
    if (data.length < 1000) break
  }

  const build = (b: Bkt) => {
    const allMonths = [...new Set([...b.byMonth.keys(), ...b.refundByMonth.keys()])].filter(m => m !== '—').sort()
    const months = allMonths.map(month => {
      const p = b.byMonth.get(month)
      const s = p ? Math.round(p.settle * 100) / 100 : 0
      const rf = Math.round((b.refundByMonth.get(month) || 0) * 100) / 100
      const oc = p?.orders.size || 0
      const rfc = b.refundCntByMonth.get(month) || 0
      const cardsM = p?.cards || 0
      const avg = cardsM > 0 ? Math.round((s / cardsM) * 100) / 100 : 0   // 卡均採購單價
      return { month, cards: cardsM, orders: oc, settle: s, refund: rf, net: Math.round((s - rf) * 100) / 100, refund_cnt: rfc, net_cnt: oc - rfc, avg }
    })
    return {
      summary: { cards: b.cards, orders: b.orders.size, settle: Math.round(b.settle * 100) / 100, actual: Math.round(b.actual * 100) / 100, refund: Math.round(b.refundTotal * 100) / 100, net: Math.round((b.settle - b.refundTotal) * 100) / 100, refund_cnt: b.refundCntTotal, net_cnt: b.orders.size - b.refundCntTotal },
      months, products: arr(b.byProduct, 30), channels: arr(b.byChannel), operators: arr(b.byOperator), types: arr(b.byType),
    }
  }

  const channels = [ALL, ...[...channelSet].filter(c => c !== '—').sort(), ...(channelSet.has('—') ? ['—'] : [])]
  const data: Record<string, ReturnType<typeof build>> = {}
  for (const c of channels) data[c] = build(bkt(c))

  return NextResponse.json({ channels, data })
}
