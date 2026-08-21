import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// 統計分析快照：各分頁「打開讀快取、按計算才重算並存檔」共用端點
// GET  ?key=xxx           → { payload, opts, computed_at } 或 { empty:true }
// POST { key, payload, opts } → 存最近一次結果
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const key = new URL(request.url).searchParams.get('key') || ''
  if (!key) return NextResponse.json({ error: '缺少 key' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('analysis_snapshots').select('payload, opts, computed_at').eq('key', key).maybeSingle()
  if (error || !data) return NextResponse.json({ empty: true })
  return NextResponse.json({ payload: data.payload, opts: data.opts, computed_at: data.computed_at })
}

export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json() as { key?: string; payload?: unknown; opts?: unknown }
  if (!body.key) return NextResponse.json({ error: '缺少 key' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('analysis_snapshots').upsert({
    key: body.key, payload: body.payload ?? null, opts: body.opts ?? null, computed_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
