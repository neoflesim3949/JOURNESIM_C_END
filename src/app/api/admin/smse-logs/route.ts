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
  // 列表只拉小欄位（不含 request/response body）+ estimated count，避免 IO 拖慢
  let query = supabase.from('smse_api_logs')
    .select('id, api_type, endpoint, status, smse_status_code, error_message, duration_ms, created_at', { count: 'estimated' })
  if (apiType) query = query.eq('api_type', apiType)
  if (status) query = query.eq('status', status)
  const from = (page - 1) * pageSize
  query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1)
  const { data, count } = await query

  // distinct types 改用當頁推算（搭配前端 STATIC 清單）
  const distinctTypes = Array.from(new Set((data || []).map(r => r.api_type).filter(Boolean))).sort()

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
