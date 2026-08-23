import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 歷史採購售後明細（bc_history_aftersales）
// GET  ?page=&page_size=&search=&from=&to=（日期）&method=&review=&refund=&facets=1
// POST { rows: [...] } — 批量匯入，依 dedupe_key upsert
const NUM = (v: unknown) => { const s = String(v ?? '').replace(/[^\d.-]/g, ''); const n = parseFloat(s); return isNaN(n) ? null : n }
const DT = (v: unknown) => { const m = String(v ?? '').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null }
const T = (v: unknown) => { const s = String(v ?? '').trim(); return s === '' ? null : s }

// 億點單號 → 渠道名稱（來自歷史採購訂單明細 bc_history_orders）
async function loadOrderChannel(supabase: ReturnType<typeof createAdminClient>) {
  const map = new Map<string, string>()
  for (let f = 0; ; f += 1000) {
    const { data } = await supabase.from('bc_history_orders').select('bc_order_no, channel_name').range(f, f + 999)
    if (!data || data.length === 0) break
    for (const r of data) { if (r.bc_order_no && r.channel_name && !map.has(r.bc_order_no)) map.set(r.bc_order_no as string, r.channel_name as string) }
    if (data.length < 1000) break
  }
  return map
}

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(request.url).searchParams
  const supabase = createAdminClient()

  if (sp.get('facets')) {
    const { data } = await supabase.from('bc_history_aftersales').select('aftersale_method, review_status, refund_status').limit(50000)
    const uniq = (k: 'aftersale_method' | 'review_status' | 'refund_status') => [...new Set((data || []).map(r => r[k]).filter(Boolean) as string[])].sort()
    const chMap = await loadOrderChannel(supabase)
    const channels = [...new Set([...chMap.values()])].sort()
    return NextResponse.json({ methods: uniq('aftersale_method'), reviews: uniq('review_status'), refunds: uniq('refund_status'), channels })
  }

  const page = Math.max(1, Number(sp.get('page')) || 1)
  const pageSize = Math.min(200, Number(sp.get('page_size')) || 50)
  const search = (sp.get('search') || '').trim()
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const method = sp.get('method') || ''
  const review = sp.get('review') || ''
  const refund = sp.get('refund') || ''
  const channel = sp.get('channel') || ''

  // 表小（約千筆）→ 撈符合條件的全部、以億點單號歸因渠道、渠道篩選＋分頁在 JS 做
  let q = supabase.from('bc_history_aftersales').select('*')
  if (search) q = q.or(`bc_order_no.ilike.%${search}%,aftersale_no.ilike.%${search}%,problem_iccid.ilike.%${search}%,product_name.ilike.%${search}%`)
  if (from) q = q.gte('aftersale_date', from)
  if (to) q = q.lte('aftersale_date', to)
  if (method) q = q.eq('aftersale_method', method)
  if (review) q = q.eq('review_status', review)
  if (refund) q = q.eq('refund_status', refund)
  q = q.order('aftersale_date', { ascending: false, nullsFirst: false }).limit(20000)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const chMap = await loadOrderChannel(supabase)
  let withCh = (data || []).map(r => ({ ...r, channel_name: (r.bc_order_no && chMap.get(r.bc_order_no as string)) || null }))
  if (channel) withCh = withCh.filter(r => (r.channel_name || '（未對應）') === channel)

  const total = withCh.length
  const rows = withCh.slice((page - 1) * pageSize, page * pageSize)
  return NextResponse.json({ rows, total, page, page_size: pageSize })
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json() as { rows?: Record<string, unknown>[] }
  const rows = Array.isArray(body.rows) ? body.rows : []
  if (rows.length === 0) return NextResponse.json({ error: '無資料列' }, { status: 400 })
  const supabase = createAdminClient()

  const mapped = rows.map(r => {
    const aftersale_no = T(r.aftersale_no)
    const bc_order_no = T(r.bc_order_no)
    const problem_iccid = T(r.problem_iccid)
    const dedupe_key = [aftersale_no || '', bc_order_no || '', problem_iccid || ''].join('|')
    return {
      dedupe_key,
      aftersale_date: DT(r.aftersale_date), bc_order_no, aftersale_no,
      product_name: T(r.product_name), aftersale_method: T(r.aftersale_method), aftersale_reason: T(r.aftersale_reason),
      problem_iccid, refund_amount: NUM(r.refund_amount),
      review_status: T(r.review_status), refund_status: T(r.refund_status),
    }
  }).filter(r => r.dedupe_key.replace(/\|/g, '') !== '')

  const byKey = new Map<string, typeof mapped[number]>()
  for (const m of mapped) byKey.set(m.dedupe_key, m)
  const clean = [...byKey.values()]

  let upserted = 0
  for (let i = 0; i < clean.length; i += 500) {
    const slice = clean.slice(i, i + 500)
    const { error } = await supabase.from('bc_history_aftersales').upsert(slice, { onConflict: 'dedupe_key' })
    if (error) return NextResponse.json({ error: error.message, upsertedBefore: upserted }, { status: 500 })
    upserted += slice.length
  }
  return NextResponse.json({ ok: true, received: rows.length, upserted })
}
