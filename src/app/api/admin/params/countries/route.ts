import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('bc_countries')
    .select('id, mcc, name, name_zh, name_en, continent, continent_zh, continent_en, flag_url, created_at')
    .order('name')

  return NextResponse.json(data || [])
}

// PATCH — 手動修改國家名稱翻譯
export async function PATCH(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, name_zh, name_en, continent_zh, continent_en } = body

  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const supabase = createAdminClient()
  const updates: Record<string, unknown> = {}
  if (name_zh !== undefined) updates.name_zh = name_zh
  if (name_en !== undefined) updates.name_en = name_en
  if (continent_zh !== undefined) updates.continent_zh = continent_zh
  if (continent_en !== undefined) updates.continent_en = continent_en

  const { error } = await supabase.from('bc_countries').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
