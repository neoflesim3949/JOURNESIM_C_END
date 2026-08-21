import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 歷史訂單明細（bc_history_orders）
// GET  ?page=&page_size=&search=&from=&to=（訂單創建時間）&status=
// POST { rows: [...] } — 批量匯入（Excel 前端解析後送 JSON），依 dedupe_key upsert

const NUM = (v: unknown) => { const s = String(v ?? '').replace(/[^\d.-]/g, ''); const n = parseFloat(s); return isNaN(n) ? null : n }
const INT = (v: unknown) => { const n = NUM(v); return n == null ? null : Math.round(n) }
const TS = (v: unknown) => { const s = String(v ?? '').trim(); return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) ? s.replace(/\//g, '-') : null }
const DT = (v: unknown) => { const m = String(v ?? '').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null }
const T = (v: unknown) => { const s = String(v ?? '').trim(); return s === '' ? null : s }

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const supabase = createAdminClient()

  // 展開：撈某訂單組（平台單｜億點單｜商品）的逐卡明細
  const groupKey = sp.get('group_key')
  if (groupKey !== null) {
    const [p, b, pr] = groupKey.split('|')
    let q = supabase.from('bc_history_orders')
      .select('id, related_iccid, iccid_start, iccid_end, actual_price, settle_price, discount, order_status, logistics_status')
    q = p ? q.eq('platform_order_no', p) : q.is('platform_order_no', null)
    q = b ? q.eq('bc_order_no', b) : q.is('bc_order_no', null)
    q = pr ? q.eq('product_no', pr) : q.is('product_no', null)
    const { data } = await q.order('related_iccid', { ascending: true }).limit(3000)
    return NextResponse.json({ lines: data || [] })
  }

  // 篩選選項（渠道、操作員）
  if (sp.get('facets')) {
    const { data } = await supabase.from('bc_history_orders_grouped').select('channel_name, operator').limit(50000)
    const channels = [...new Set((data || []).map(r => r.channel_name).filter(Boolean) as string[])].sort()
    const operators = [...new Set((data || []).map(r => r.operator).filter(Boolean) as string[])].sort()
    return NextResponse.json({ channels, operators })
  }

  // 合併列表（分組 VIEW）
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const pageSize = Math.min(200, Number(sp.get('page_size')) || 50)
  const search = (sp.get('search') || '').trim()
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const channel = sp.get('channel') || ''
  const operator = sp.get('operator') || ''

  let q = supabase.from('bc_history_orders_grouped').select('*', { count: 'exact' })
  if (search) q = q.or(`platform_order_no.ilike.%${search}%,bc_order_no.ilike.%${search}%,product_name.ilike.%${search}%,recipient_name.ilike.%${search}%,iccid_min.ilike.%${search}%,iccid_max.ilike.%${search}%`)
  if (from) q = q.gte('order_created_at', from)
  if (to) q = q.lte('order_created_at', to + 'T23:59:59')
  if (channel) q = q.eq('channel_name', channel)
  if (operator) q = q.eq('operator', operator)
  q = q.order('order_created_at', { ascending: false, nullsFirst: false }).range((page - 1) * pageSize, page * pageSize - 1)
  const { data, count, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data || [], total: count || 0, page, page_size: pageSize })
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json() as { rows?: Record<string, unknown>[] }
  const rows = Array.isArray(body.rows) ? body.rows : []
  if (rows.length === 0) return NextResponse.json({ error: '無資料列' }, { status: 400 })
  const supabase = createAdminClient()

  const mapped = rows.map(r => {
    const platform_order_no = T(r.platform_order_no)
    const bc_order_no = T(r.bc_order_no)
    const product_no = T(r.product_no)
    const related_iccid = T(r.related_iccid)
    const iccid_start = T(r.iccid_start)
    const iccid_end = T(r.iccid_end)
    // 去重鍵：一單多卡（號段）與一卡多單都不會誤併——平台單｜億點單｜商品｜關聯卡｜起始｜截止
    const dedupe_key = [platform_order_no || '', bc_order_no || '', product_no || '', related_iccid || '', iccid_start || '', iccid_end || ''].join('|')
    return {
      dedupe_key,
      seq: T(r.seq), platform_order_no, bc_order_no,
      channel_no: T(r.channel_no), channel_name: T(r.channel_name), operator: T(r.operator),
      order_created_at: TS(r.order_created_at), order_type: T(r.order_type),
      product_no, product_name: T(r.product_name), copies: T(r.copies),
      actual_price: NUM(r.actual_price), settle_price: NUM(r.settle_price), quantity: INT(r.quantity),
      discount: NUM(r.discount), shipping_fee: NUM(r.shipping_fee),
      phone: T(r.phone), shipping_method: T(r.shipping_method), recipient_name: T(r.recipient_name), recipient_address: T(r.recipient_address),
      logistics_company: T(r.logistics_company), related_iccid, iccid_start, iccid_end,
      order_status: T(r.order_status), logistics_status: T(r.logistics_status),
      user_ordered_at: TS(r.user_ordered_at), expected_travel_date: DT(r.expected_travel_date), note: T(r.note),
    }
  }).filter(r => r.dedupe_key.replace(/\|/g, '') !== '')   // 全空的列略過

  // 檔案內去重（同 dedupe_key 取最後一筆）
  const byKey = new Map<string, typeof mapped[number]>()
  for (const m of mapped) byKey.set(m.dedupe_key, m)
  const clean = [...byKey.values()]

  let upserted = 0
  for (let i = 0; i < clean.length; i += 500) {
    const slice = clean.slice(i, i + 500)
    const { error } = await supabase.from('bc_history_orders').upsert(slice, { onConflict: 'dedupe_key' })
    if (error) return NextResponse.json({ error: error.message, upsertedBefore: upserted }, { status: 500 })
    upserted += slice.length
  }
  return NextResponse.json({ ok: true, received: rows.length, upserted })
}
