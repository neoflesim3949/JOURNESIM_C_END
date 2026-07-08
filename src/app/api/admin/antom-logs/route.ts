import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — Antom API Log 列表（不含 JSONB body，展開單筆才另拉）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '50')
  const action = searchParams.get('action') || ''
  const direction = searchParams.get('direction') || ''
  const status = searchParams.get('status') || ''
  const orderNumber = (searchParams.get('order_number') || '').trim()

  const supabase = createAdminClient()
  let query = supabase.from('antom_api_logs')
    .select('id, action, endpoint, direction, order_number, payment_id, status, result_status, error_message, duration_ms, created_at', { count: 'estimated' })

  if (action) query = query.eq('action', action)
  if (direction) query = query.eq('direction', direction)
  if (status) query = query.eq('status', status)
  if (orderNumber) query = query.ilike('order_number', `%${orderNumber}%`)

  const from = (page - 1) * pageSize
  query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1)

  const { data, count } = await query
  const distinctActions = Array.from(new Set((data || []).map(r => r.action).filter(Boolean))).sort()
  return NextResponse.json({ data: data || [], total: count || 0, distinctActions })
}

// DELETE — 依 action 清除 log（強制指定 action，避免誤刪全部）
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const action = (searchParams.get('action') || '').trim()
  if (!action) return NextResponse.json({ error: '必須指定 action' }, { status: 400 })

  const supabase = createAdminClient()
  const { error, count } = await supabase.from('antom_api_logs').delete({ count: 'exact' }).eq('action', action)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: count || 0, action })
}
