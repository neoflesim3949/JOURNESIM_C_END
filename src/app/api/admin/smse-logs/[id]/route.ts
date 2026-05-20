import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 取單筆完整 log（含 request/response body）
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('smse_api_logs').select('*').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: '找不到' }, { status: 404 })
  return NextResponse.json(data)
}
