import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  
  
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') || 'countries'
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '50')
  const search = searchParams.get('search') || ''

  const supabase = createAdminClient()

  if (tab === 'countries') {
    let query = supabase.from('bc_countries').select('*', { count: 'exact' })
    if (search) {
      query = query.or(`name.ilike.%${search}%,mcc.ilike.%${search}%`)
    }
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.order('name').range(from, to)
    const { data, count } = await query

    return NextResponse.json({ data: data || [], total: count || 0 })
  }

  // products
  let query = supabase.from('bc_products')
    .select('id, sku_id, name, type, sales_method, days, capacity, high_flow_size, limit_flow_speed, plan_type, updated_at', { count: 'exact' })
  if (search) {
    query = query.or(`name.ilike.%${search}%,sku_id.ilike.%${search}%`)
  }
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.order('name').range(from, to)
  const { data, count } = await query

  return NextResponse.json({ data: data || [], total: count || 0 })
}
