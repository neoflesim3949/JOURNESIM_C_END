import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// ── 衍生狀態（與前端徽章一致），供伺服器端篩選 ──
type OItem = { status?: string | null; quantity?: number | null; sale_price?: number | null; original_price?: number | null }
type OSettle = { original_price?: number | null; seller_coupon?: number | null; ams_fee?: number | null; transaction_fee?: number | null; other_service_fee?: number | null; processing_fee?: number | null; wallet_amount?: number | null }
type ORow = { internal_status?: string | null; product_total?: number | null; seller_coupon?: number | null; shopee_order_items?: OItem[]; shopee_settlements?: OSettle[] }

function isCompleted(o: ORow) { const its = o.shopee_order_items || []; return its.length > 0 && its.every(i => ['bc_ordered', 'completed'].includes(i.status || '')) }
function isBackfilled(o: ORow) { if (isCompleted(o)) return false; const its = o.shopee_order_items || []; return its.length > 0 && its.every(i => ['iccid_filled', 'bc_ordered', 'completed'].includes(i.status || '')) }
function sysKey(o: ORow) { if (o.internal_status === '不成立') return '不成立'; if (isCompleted(o)) return 'completed'; if (isBackfilled(o)) return 'backfilled'; return o.internal_status === 'processing' ? 'processing' : 'pending' }
function origPrice(o: ORow) { const s = o.shopee_settlements?.[0]; const it = (o.shopee_order_items || []).reduce((a, i) => a + ((i.sale_price ?? i.original_price ?? 0) * (i.quantity ?? 1)), 0); return s?.original_price ?? (it > 0 ? it : (o.product_total ?? 0)) }
function financeLabel(o: ORow) {
  const ss = o.shopee_settlements || []
  if (ss.length === 0) return '未匯入'
  const s = ss[0]
  const fees = Math.abs(s.ams_fee ?? 0) + Math.abs(s.transaction_fee ?? 0) + Math.abs(s.other_service_fee ?? 0) + Math.abs(s.processing_fee ?? 0)
  // 結算單沒帶折扣時（手動單常見），退回用訂單上的賣家優惠券
  const coupon = Math.abs(s.seller_coupon ?? o.seller_coupon ?? 0)
  const expected = origPrice(o) - coupon - fees
  return Math.abs(expected - (s.wallet_amount ?? 0)) > 1 ? '金流異常' : '已匯入'
}

// GET — 蝦皮訂單列表
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const returnStatus = searchParams.get('return_status') || ''
  const orderDateFrom = searchParams.get('order_date_from') || ''
  const orderDateTo = searchParams.get('order_date_to') || ''
  const createdFrom = searchParams.get('created_from') || ''
  const createdTo = searchParams.get('created_to') || ''
  const accountId = searchParams.get('account_id') || ''
  const orderStatus = searchParams.get('order_status') || ''
  const systemStatus = searchParams.get('system_status') || '' // 衍生：pending/processing/backfilled/completed/不成立
  const financeStatus = searchParams.get('finance_status') || '' // 衍生：未匯入/已匯入/金流異常
  const sortBy = searchParams.get('sort_by') || 'created_at'
  const sortDir = searchParams.get('sort_dir') === 'asc' ? true : false
  const derived = !!(systemStatus || financeStatus)

  const supabase = createAdminClient()

  // 先算搜尋用的 iccid 命中訂單 id（與下方 base() 共用）
  let iccidOrderIds: string[] = []
  if (search) {
    const trimmed = search.trim()
    const { data: exactItems } = await supabase.from('shopee_order_items').select('shopee_order_id').contains('iccid', [trimmed])
    iccidOrderIds = (exactItems || []).map((i: { shopee_order_id: string }) => i.shopee_order_id).filter(Boolean)
    if (iccidOrderIds.length === 0 && /^\d{4,}$/.test(trimmed)) {
      const { data: anyItems } = await supabase.from('shopee_order_items').select('shopee_order_id, iccid').not('iccid', 'is', null)
      iccidOrderIds = (anyItems || []).filter((i: { iccid: unknown }) => (Array.isArray(i.iccid) ? i.iccid : []).some((x) => typeof x === 'string' && x.includes(trimmed)))
        .map((i: { shopee_order_id: string }) => i.shopee_order_id).filter(Boolean)
    }
    iccidOrderIds = [...new Set(iccidOrderIds)]
  }

  // 套用所有 DB 層篩選的查詢（withCount 由 count 模式決定）
  function base(withCount: boolean) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from('shopee_orders').select('*, shopee_order_items(*), shopee_settlements(*)', withCount ? { count: 'exact' } : undefined)
    if (search) {
      const orFilters = [
        `shopee_order_number.ilike.%${search}%`, `buyer_account.ilike.%${search}%`,
        `recipient_name.ilike.%${search}%`, `shopee_tracking_code.ilike.%${search}%`,
      ]
      if (iccidOrderIds.length > 0) orFilters.push(`id.in.(${iccidOrderIds.join(',')})`)
      q = q.or(orFilters.join(','))
    }
    if (status) q = q.eq('internal_status', status)
    if (returnStatus === 'has') q = q.not('return_status', 'is', null).neq('return_status', '')
    else if (returnStatus === 'none') q = q.or('return_status.is.null,return_status.eq.')
    if (orderDateFrom) q = q.gte('order_date', orderDateFrom)
    if (orderDateTo) q = q.lte('order_date', orderDateTo + 'T23:59:59')
    if (createdFrom) q = q.gte('created_at', createdFrom)
    if (createdTo) q = q.lte('created_at', createdTo + 'T23:59:59')
    if (accountId) q = q.eq('shopee_account_id', accountId)
    if (orderStatus) q = q.eq('order_status', orderStatus)
    return q.order(sortBy, { ascending: sortDir })
  }

  let data: ORow[] = []
  let count = 0
  if (derived) {
    // 衍生狀態（已回填/金流異常…）：撈全部 DB 篩選結果 → JS 算狀態 → 過濾 → 分頁，確保每頁填滿
    const all: ORow[] = []
    for (let f = 0; ; f += 1000) {
      const { data: chunk } = await base(false).range(f, f + 999)
      if (!chunk || chunk.length === 0) break
      all.push(...(chunk as ORow[]))
      if (chunk.length < 1000) break
    }
    let filtered = all
    if (systemStatus) filtered = filtered.filter(o => sysKey(o) === systemStatus)
    if (financeStatus) filtered = filtered.filter(o => financeLabel(o) === financeStatus)
    count = filtered.length
    const start = (page - 1) * pageSize
    data = filtered.slice(start, start + pageSize)
  } else {
    const from = (page - 1) * pageSize
    const res = await base(true).range(from, from + pageSize - 1)
    data = (res.data || []) as ORow[]
    count = res.count || 0
  }

  // 蝦皮狀態下拉選項（distinct，不受目前篩選影響）
  const statusSet = new Set<string>()
  for (let f = 0; ; f += 1000) {
    const { data: rows } = await supabase.from('shopee_orders').select('order_status').range(f, f + 999)
    if (!rows || rows.length === 0) break
    for (const r of rows) { const s = (r.order_status || '').trim(); if (s) statusSet.add(s) }
    if (rows.length < 1000) break
  }
  const statusOptions = [...statusSet].sort((a, b) => a.localeCompare(b, 'zh-Hant'))

  return NextResponse.json({ data: data || [], total: count || 0, status_options: statusOptions })
}

// POST — 手動新增蝦皮訂單
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const supabase = createAdminClient()

  const orderNumber = (body.shopee_order_number || '').trim()
  if (!orderNumber) return NextResponse.json({ error: '請輸入蝦皮訂單編號' }, { status: 400 })

  const { data: existing } = await supabase.from('shopee_orders')
    .select('id').eq('shopee_order_number', orderNumber).maybeSingle()
  if (existing) return NextResponse.json({ error: '該訂單編號已存在' }, { status: 400 })

  const { data: inserted, error } = await supabase.from('shopee_orders').insert({
    shopee_order_number: orderNumber,
    buyer_account: body.buyer_account || null,
    shopee_account_id: body.shopee_account_id || null,
    order_date: body.order_date || new Date().toISOString(),
    order_status: '手動建立',
    internal_status: 'pending',
    recipient_name: body.recipient_name || null,
    recipient_phone: body.recipient_phone || null,
    shipping_address: body.shipping_address || null,
    seller_note: body.seller_note || null,
    is_manual: true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, order: inserted })
}
