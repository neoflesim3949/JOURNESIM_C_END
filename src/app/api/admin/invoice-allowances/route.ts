import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 全部折讓單列表（含對應發票資訊）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '50')
  const status = searchParams.get('status') || ''
  const dateFrom = searchParams.get('date_from') || ''
  const dateTo = searchParams.get('date_to') || ''

  const supabase = createAdminClient()
  let q = supabase.from('invoice_allowances').select(
    `*, invoice:invoices(invoice_number, buyer_type, buyer_id, buyer_name, buyer_company, invoice_date)`,
    { count: 'exact' }
  )
  if (status) q = q.eq('status', status)
  if (dateFrom) q = q.gte('allowance_date', dateFrom)
  if (dateTo) q = q.lte('allowance_date', dateTo)
  const from = (page - 1) * pageSize
  q = q.order('allowance_date', { ascending: false }).range(from, from + pageSize - 1)
  const { data, count } = await q
  return NextResponse.json({ data: data || [], total: count || 0 })
}
