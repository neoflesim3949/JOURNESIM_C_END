import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 此旅行社已分配卡片 + 未分配庫存（供分配畫面）
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const search = (searchParams.get('search') || '').trim()
  const supabase = createAdminClient()

  const { data: allocated } = await supabase.from('manual_iccids')
    .select('iccid, type').eq('agency_id', id).order('iccid').limit(2000)

  let poolQ = supabase.from('manual_iccids').select('iccid, type').is('agency_id', null).order('iccid').limit(500)
  if (search) poolQ = poolQ.ilike('iccid', `%${search}%`)
  const { data: pool } = await poolQ

  return NextResponse.json({ allocated: allocated || [], pool: pool || [] })
}

// POST — 分配卡片給此旅行社 body: { iccids: string[] }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const iccids: string[] = Array.isArray(body.iccids) ? body.iccids.map((s: unknown) => String(s)) : []
  if (iccids.length === 0) return NextResponse.json({ error: '請選擇卡片' }, { status: 400 })
  const supabase = createAdminClient()

  let assigned = 0
  for (let i = 0; i < iccids.length; i += 200) {
    const slice = iccids.slice(i, i + 200)
    // 只分配「尚未分配」的卡，避免搶別社的卡
    const { data, error } = await supabase.from('manual_iccids')
      .update({ agency_id: id }).in('iccid', slice).is('agency_id', null).select('iccid')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    assigned += data?.length || 0
  }
  return NextResponse.json({ ok: true, assigned })
}

// DELETE — 收回卡片 body: { iccid }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const iccid = String(body.iccid || '')
  if (!iccid) return NextResponse.json({ error: '缺少 iccid' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('manual_iccids').update({ agency_id: null }).eq('iccid', iccid).eq('agency_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
