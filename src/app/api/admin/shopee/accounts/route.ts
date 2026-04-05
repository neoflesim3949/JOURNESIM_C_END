import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 帳號列表
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('shopee_accounts').select('*').order('created_at')
  return NextResponse.json(data || [])
}

// POST — 新增帳號
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, description } = await request.json()
  if (!name) return NextResponse.json({ error: '請輸入帳號名稱' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('shopee_accounts').insert({ name, description: description || null }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — 刪除帳號
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await request.json()
  const supabase = createAdminClient()
  await supabase.from('shopee_accounts').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
