import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// POST { ids: string[] } — 依傳入順序重設套餐 sort_order
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { ids } = await request.json().catch(() => ({}))
  if (!Array.isArray(ids)) return NextResponse.json({ error: '缺少 ids' }, { status: 400 })
  const supabase = createAdminClient()
  await Promise.all(ids.map((id: string, i: number) =>
    supabase.from('packages').update({ sort_order: i }).eq('id', id)
  ))
  return NextResponse.json({ ok: true })
}
