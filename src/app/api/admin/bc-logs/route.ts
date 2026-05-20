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
  // 列表只拉小欄位（不含 JSONB body）+ estimated count，避免 IO 拖慢
  // 展開那筆才呼叫單筆 API 拿 body
  let query = supabase.from('bc_api_logs')
    .select('id, trade_type, direction, status, error_message, duration_ms, created_at', { count: 'estimated' })

  if (tradeType) query = query.eq('trade_type', tradeType)
  if (direction) query = query.eq('direction', direction)
  if (status) query = query.eq('status', status)

  const from = (page - 1) * pageSize
  query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1)

  const { data, count } = await query

  // distinctTypes 改為「只看當前頁的資料」推出 trade_type，避免大量掃描
  // 前端有 STATIC_F / STATIC_N 硬編清單，這只是補抓沒列到的類型
  const distinctTypes = Array.from(new Set((data || []).map(r => r.trade_type).filter(Boolean))).sort()

  return NextResponse.json({ data: data || [], total: count || 0, distinctTypes })
}

// DELETE — 依 trade_type 清除 log（強制要求 trade_type，避免誤刪全部）
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const tradeType = (searchParams.get('trade_type') || '').trim()
  if (!tradeType) return NextResponse.json({ error: '必須指定 trade_type' }, { status: 400 })

  const supabase = createAdminClient()
  const { error, count } = await supabase
    .from('bc_api_logs')
    .delete({ count: 'exact' })
    .eq('trade_type', tradeType)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, deleted: count || 0, tradeType })
}
