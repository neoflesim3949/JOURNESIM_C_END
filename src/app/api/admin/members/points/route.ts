import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdminAuth, getUnauthorizedResponse } from '@/lib/admin'

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const { searchParams } = new URL(request.url)
  const supabase = createAdminClient()

  // 1. 獲取篩選參數 (Email 或 Order Number)
  const search = searchParams.get('search')
  const status = searchParams.get('status')
  const type = searchParams.get('type')

  let query = supabase
    .from('point_logs')
    .select(`
      *,
      members(email, display_name),
      orders!point_logs_source_order_id_fkey(order_number)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  // 🧪 這裡假設 supabase 支援 join 查詢篩選，若不支援則需分步
  if (status) query = query.eq('status', status)
  if (type) query = query.eq('point_type', type)
  if (search) {
      // 由於 members 是 join 的，搜尋 member email 需較複雜的操作
      // 這裡先實作基礎搜尋
  }

  const { data: logs, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(logs || [])
}

export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const body = await request.json()
  const supabase = createAdminClient()

  const { id, status } = body as { id: string; status: string }

  const { error } = await supabase
    .from('point_logs')
    .update({ status })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
