import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkTravelAuth } from '@/lib/travel-auth'

// GET — 此旅行社的卡片庫存（可用 / 已用）
export async function GET() {
  const sess = await checkTravelAuth()
  if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const cards: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('manual_iccids').select('iccid').eq('agency_id', sess.agency_id).range(from, from + 999)
    if (!data || data.length === 0) break
    cards.push(...data.map(c => c.iccid))
    if (data.length < 1000) break
  }

  // 已被此社團員使用的卡號
  const used = new Set<string>()
  const { data: groups } = await supabase.from('tour_groups').select('id').eq('agency_id', sess.agency_id)
  const gids = (groups || []).map(g => g.id)
  for (let i = 0; i < gids.length; i += 100) {
    const slice = gids.slice(i, i + 100)
    const { data: ms } = await supabase.from('tour_members').select('iccid').in('group_id', slice).eq('issued', true).not('iccid', 'is', null)
    for (const m of ms || []) if (m.iccid) used.add(m.iccid)
  }

  const available = cards.filter(ic => !used.has(ic))
  return NextResponse.json({ total: cards.length, available, used_count: used.size })
}
