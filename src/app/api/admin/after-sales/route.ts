import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 售後列表
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''

  const supabase = createAdminClient()
  let query = supabase.from('after_sales').select(`
    *,
    orders:order_id (order_number, status),
    members:member_id (name, email)
  `, { count: 'exact' })

  if (search) query = query.or(`reason.ilike.%${search}%,bc_after_sale_id.ilike.%${search}%`)
  if (status) query = query.eq('status', status)

  const from = (page - 1) * pageSize
  query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1)

  const { data, count } = await query
  return NextResponse.json({ data: data || [], total: count || 0 })
}
