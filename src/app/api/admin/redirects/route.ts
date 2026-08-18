import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 短網址轉址管理（redirect_links）
// GET：列表；POST：新增；PATCH：更新；DELETE ?id=：刪除

const SLUG_RE = /^[a-zA-Z0-9_-]{2,64}$/

function randomSlug(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'  // 去除易混淆字元
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('redirect_links')
    .select('*').order('created_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ links: data || [] })
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const target = String(body.target_url || '').trim()
  if (!/^https?:\/\/.+/.test(target)) return NextResponse.json({ error: '目標網址須為 http(s):// 開頭' }, { status: 400 })
  let slug = String(body.slug || '').trim()
  const supabase = createAdminClient()
  if (slug) {
    if (!SLUG_RE.test(slug)) return NextResponse.json({ error: '短代碼限 2~64 碼英數字、-、_' }, { status: 400 })
  } else {
    // 自動產生：撞號重試
    for (let i = 0; i < 5; i++) {
      slug = randomSlug()
      const { data } = await supabase.from('redirect_links').select('id').eq('slug', slug).maybeSingle()
      if (!data) break
    }
  }
  const { data, error } = await supabase.from('redirect_links').insert({
    slug,
    target_url: target,
    title: String(body.title || '').trim() || null,
  }).select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `短代碼「${slug}」已存在` }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, link: data })
}

export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.target_url !== undefined) {
    const t = String(body.target_url).trim()
    if (!/^https?:\/\/.+/.test(t)) return NextResponse.json({ error: '目標網址須為 http(s):// 開頭' }, { status: 400 })
    updates.target_url = t
  }
  if (body.title !== undefined) updates.title = String(body.title).trim() || null
  if (body.is_active !== undefined) updates.is_active = !!body.is_active
  if (body.slug !== undefined) {
    const sl = String(body.slug).trim()
    if (!SLUG_RE.test(sl)) return NextResponse.json({ error: '短代碼限 2~64 碼英數字、-、_' }, { status: 400 })
    updates.slug = sl
  }
  const supabase = createAdminClient()
  const { error } = await supabase.from('redirect_links').update(updates).eq('id', id)
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '短代碼已存在' }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('redirect_links').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
