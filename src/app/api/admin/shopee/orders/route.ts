import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 衍生狀態（系統狀態/金流狀態）改由 DB 觸發器算成 shopee_orders 的快照欄位
// （system_status_derived / finance_status_derived，見 migration 084），列表直接以欄位篩選＋分頁。
// 前端徽章仍由回傳列裡的 items/settlements 自行計算，與快照同源。
type ORow = { [k: string]: unknown; shopee_order_items?: unknown[]; shopee_settlements?: unknown[] }

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
    // 衍生狀態改用單表快照欄位（觸發器維護）→ 純 SQL 分頁，不再全撈
    if (systemStatus) q = q.eq('system_status_derived', systemStatus)
    if (financeStatus) q = q.eq('finance_status_derived', financeStatus)
    return q.order(sortBy, { ascending: sortDir })
  }

  const from = (page - 1) * pageSize
  const res = await base(true).range(from, from + pageSize - 1)
  const data = (res.data || []) as ORow[]
  const count = res.count || 0

  // 蝦皮狀態下拉選項（distinct，不受目前篩選影響）
  const statusSet = new Set<string>()
  for (let f = 0; ; f += 1000) {
    const { data: rows } = await supabase.from('shopee_orders').select('order_status').range(f, f + 999)
    if (!rows || rows.length === 0) break
    for (const r of rows) { const s = (r.order_status || '').trim(); if (s) statusSet.add(s) }
    if (rows.length < 1000) break
  }
  const statusOptions = [...statusSet].sort((a, b) => a.localeCompare(b, 'zh-Hant'))

  // 本頁出現的買家 → 歷史訂單數（全表計，不受目前篩選影響）
  const buyers = [...new Set(data.map((o) => (o.buyer_account as string) || '').filter(Boolean))]
  const buyerCounts: Record<string, number> = {}
  if (buyers.length > 0) {
    for (let f = 0; ; f += 1000) {
      const { data: rows } = await supabase.from('shopee_orders').select('buyer_account').in('buyer_account', buyers).range(f, f + 999)
      if (!rows || rows.length === 0) break
      for (const r of rows) { const b = (r.buyer_account || '').trim(); if (b) buyerCounts[b] = (buyerCounts[b] || 0) + 1 }
      if (rows.length < 1000) break
    }
  }

  return NextResponse.json({ data: data || [], total: count || 0, status_options: statusOptions, buyer_counts: buyerCounts })
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
