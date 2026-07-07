import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPassword, genPassword } from '@/lib/travel-auth'

// GET — 旅行社列表（含人員/團/卡片庫存數）
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const { data: agencies, error } = await supabase.from('travel_agencies').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: staff } = await supabase.from('travel_staff').select('agency_id')
  const { data: groups } = await supabase.from('tour_groups').select('agency_id')

  // 已分配卡片（只撈有 agency_id 的，數量有限）
  const cardCounts = new Map<string, number>()
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('manual_iccids').select('agency_id').not('agency_id', 'is', null).range(from, from + 999)
    if (!data || data.length === 0) break
    for (const r of data) cardCounts.set(r.agency_id, (cardCounts.get(r.agency_id) || 0) + 1)
    if (data.length < 1000) break
  }

  const staffCount = new Map<string, number>()
  for (const s of staff || []) staffCount.set(s.agency_id, (staffCount.get(s.agency_id) || 0) + 1)
  const groupCount = new Map<string, number>()
  for (const g of groups || []) groupCount.set(g.agency_id, (groupCount.get(g.agency_id) || 0) + 1)

  const result = (agencies || []).map(a => ({
    ...a,
    staff_count: staffCount.get(a.id) || 0,
    group_count: groupCount.get(a.id) || 0,
    card_count: cardCounts.get(a.id) || 0,
  }))

  // 未分配庫存數
  let poolCount = 0
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('manual_iccids').select('iccid', { count: 'exact', head: false }).is('agency_id', null).range(from, from + 999)
    if (!data || data.length === 0) break
    poolCount += data.length
    if (data.length < 1000) break
  }

  return NextResponse.json({ agencies: result, pool_count: poolCount })
}

// POST — 新增旅行社（可一併建立第一個管理者帳號）
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: '請輸入旅行社名稱' }, { status: 400 })
  const managerUsername = String(body.manager_username || '').trim()
  const supabase = createAdminClient()

  const { data: agency, error } = await supabase.from('travel_agencies')
    .insert({ name, contact_name: body.contact_name || null, contact_phone: body.contact_phone || null })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let manager: { username: string; password: string } | null = null
  if (managerUsername) {
    const { data: exists } = await supabase.from('travel_staff').select('id').eq('username', managerUsername).maybeSingle()
    if (exists) return NextResponse.json({ agency, warning: '管理者帳號已存在，未建立帳號' })
    const password = genPassword()
    const { error: sErr } = await supabase.from('travel_staff').insert({
      agency_id: agency.id, username: managerUsername, password_hash: hashPassword(password),
      display_name: body.contact_name || managerUsername, role: 'manager', active: true,
    })
    if (!sErr) manager = { username: managerUsername, password }
  }

  return NextResponse.json({ agency, manager })
}
