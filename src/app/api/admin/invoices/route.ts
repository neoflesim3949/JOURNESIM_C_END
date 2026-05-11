import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 發票列表 + 統計
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '50')
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const taxType = searchParams.get('tax_type') || ''
  const dateFrom = searchParams.get('date_from') || ''
  const dateTo = searchParams.get('date_to') || ''

  const supabase = createAdminClient()
  let query = supabase.from('invoices').select('*', { count: 'exact' })

  if (search) query = query.or(`invoice_number.ilike.%${search}%,orderid.ilike.%${search}%,buyer_id.ilike.%${search}%,buyer_name.ilike.%${search}%,buyer_company.ilike.%${search}%`)
  if (status) query = query.eq('status', status)
  if (taxType) query = query.eq('tax_type', taxType)
  if (dateFrom) query = query.gte('invoice_date', dateFrom)
  if (dateTo) query = query.lte('invoice_date', dateTo)

  const from = (page - 1) * pageSize
  query = query.order('invoice_date', { ascending: false }).order('invoice_time', { ascending: false }).range(from, from + pageSize - 1)
  const { data, count } = await query

  // 統計（同樣的 date 範圍）
  let statQuery = supabase.from('invoices').select('buyer_type, status, total_amount')
  if (dateFrom) statQuery = statQuery.gte('invoice_date', dateFrom)
  if (dateTo) statQuery = statQuery.lte('invoice_date', dateTo)
  const { data: statRows } = await statQuery

  const stats = {
    b2c: { issued: 0, sales: 0, cancelled: 0, voided: 0 },
    b2b: { issued: 0, sales: 0, cancelled: 0, voided: 0 },
  }
  for (const r of statRows || []) {
    const bucket = r.buyer_type === 'B2C' ? stats.b2c : stats.b2b
    if (r.status === 'issued') {
      bucket.issued++
      bucket.sales += Number(r.total_amount || 0)
    } else if (r.status === 'cancelled') {
      bucket.cancelled++
    } else if (r.status === 'voided') {
      bucket.voided++
    }
  }

  return NextResponse.json({ data: data || [], total: count || 0, stats })
}
