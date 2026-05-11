import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — smse API Log 列表
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '50')
  const apiType = searchParams.get('api_type') || ''
  const status = searchParams.get('status') || ''

  const supabase = createAdminClient()
  let query = supabase.from('smse_api_logs').select('*', { count: 'exact' })
  if (apiType) query = query.eq('api_type', apiType)
  if (status) query = query.eq('status', status)
  const from = (page - 1) * pageSize
  query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1)
  const { data, count } = await query

  // distinct types 給選單
  const { data: distinctRows } = await supabase
    .from('smse_api_logs')
    .select('api_type')
    .order('created_at', { ascending: false })
    .limit(5000)
  const distinctTypes = Array.from(new Set((distinctRows || []).map(r => r.api_type).filter(Boolean))).sort()

  return NextResponse.json({ data: data || [], total: count || 0, distinctTypes })
}

// DELETE — 依 api_type 清除
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const apiType = (searchParams.get('api_type') || '').trim()
  if (!apiType) return NextResponse.json({ error: '必須指定 api_type' }, { status: 400 })
  const supabase = createAdminClient()
  const { error, count } = await supabase
    .from('smse_api_logs')
    .delete({ count: 'exact' })
    .eq('api_type', apiType)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: count || 0, apiType })
}
