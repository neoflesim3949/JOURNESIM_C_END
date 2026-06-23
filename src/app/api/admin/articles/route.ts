import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 列出所有網站文章
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('site_articles')
    .select('slug, title, content, updated_at').order('sort_order')
  return NextResponse.json(data || [])
}

// PUT — 更新文章標題/內容（依 slug）
export async function PUT(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { slug } = body
  if (!slug) return NextResponse.json({ error: '缺少 slug' }, { status: 400 })
  const supabase = createAdminClient()
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) upd.title = String(body.title || '').trim() || slug
  if (body.content !== undefined) upd.content = String(body.content ?? '')
  const { error } = await supabase.from('site_articles').update(upd).eq('slug', slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
