import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — BC API Log 列表
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '50')
  const tradeType = searchParams.get('trade_type') || ''
  const direction = searchParams.get('direction') || ''
  const status = searchParams.get('status') || ''

  const supabase = createAdminClient()
  let query = supabase.from('bc_api_logs').select('*', { count: 'exact' })

  if (tradeType) query = query.eq('trade_type', tradeType)
  if (direction) query = query.eq('direction', direction)
  if (status) query = query.eq('status', status)

  const from = (page - 1) * pageSize
  query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1)

  const { data, count } = await query
  return NextResponse.json({ data: data || [], total: count || 0 })
}
