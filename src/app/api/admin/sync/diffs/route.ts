import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 最近的商品上下架比對紀錄（預設 latest=1 只回最新一筆）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit') || '5'), 20)
  const supabase = createAdminClient()
  const { data } = await supabase.from('bc_sync_diffs')
    .select('*').eq('scope', 'products').order('synced_at', { ascending: false }).limit(limit)
  return NextResponse.json({ diffs: data || [] })
}
