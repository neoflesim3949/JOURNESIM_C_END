import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'


// GET — 會員詳情 + 卡片 + 訂單
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()

  const [memberRes, cardsRes, ordersRes] = await Promise.all([
    supabase.from('members').select('*').eq('id', id).single(),
    supabase.from('member_cards').select('*').eq('member_id', id).order('created_at', { ascending: false }),
    supabase.from('orders').select('*').eq('member_id', id).order('created_at', { ascending: false }).limit(20),
  ])

  if (!memberRes.data) return NextResponse.json({ error: '會員不存在' }, { status: 404 })

  return NextResponse.json({
    member: memberRes.data,
    cards: cardsRes.data || [],
    orders: ordersRes.data || [],
  })
}

// PATCH — 編輯會員資料
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const supabase = createAdminClient()

  const updates: Record<string, unknown> = {}
  if (body.display_name !== undefined) updates.display_name = body.display_name
  if (body.email !== undefined) updates.email = body.email
  // 社群帳號綁定/解綁（傳 null 解綁）
  const socialFields = ['line_user_id', 'google_user_id', 'apple_user_id', 'facebook_user_id']
  for (const field of socialFields) {
    if (field in body) updates[field] = body[field]
  }

  const { error } = await supabase.from('members').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
