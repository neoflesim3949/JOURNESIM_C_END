import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

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
  const sortBy = searchParams.get('sort_by') || 'created_at'
  const sortDir = searchParams.get('sort_dir') === 'asc' ? true : false

  const supabase = createAdminClient()
  let query = supabase.from('shopee_orders').select('*, shopee_order_items(*), shopee_settlements(*)', { count: 'exact' })

  if (search) query = query.or(`shopee_order_number.ilike.%${search}%,buyer_account.ilike.%${search}%,recipient_name.ilike.%${search}%,shopee_tracking_code.ilike.%${search}%`)
  if (status) query = query.eq('internal_status', status)
  if (returnStatus === 'has') query = query.not('return_status', 'is', null).neq('return_status', '')
  else if (returnStatus === 'none') query = query.or('return_status.is.null,return_status.eq.')
  if (orderDateFrom) query = query.gte('order_date', orderDateFrom)
  if (orderDateTo) query = query.lte('order_date', orderDateTo + 'T23:59:59')
  if (createdFrom) query = query.gte('created_at', createdFrom)
  if (createdTo) query = query.lte('created_at', createdTo + 'T23:59:59')
  if (accountId) query = query.eq('shopee_account_id', accountId)

  const from = (page - 1) * pageSize
  query = query.order(sortBy, { ascending: sortDir }).range(from, from + pageSize - 1)

  const { data, count } = await query
  return NextResponse.json({ data: data || [], total: count || 0 })
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
