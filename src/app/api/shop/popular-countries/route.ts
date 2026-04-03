import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  let settings = new Map<string, string>()
  try {
    settings = await getSettings()
  } catch {}

  const popularMccs = (settings.get('popular_countries') || '').split(',').map((s) => s.trim()).filter(Boolean)

  if (popularMccs.length === 0) {
    return NextResponse.json([])
  }

  const supabase = createAdminClient()
  const { data: countries } = await supabase
    .from('bc_countries')
    .select('mcc, name, name_zh, flag_url')
    .in('mcc', popularMccs)

  const countryMap = new Map((countries || []).map((c) => [c.mcc, c]))
  const ordered = popularMccs
    .map((mcc) => {
      const c = countryMap.get(mcc)
      if (!c) return null
      return { mcc: c.mcc, name: c.name_zh || c.name, flag_url: c.flag_url }
    })
    .filter(Boolean)

  return NextResponse.json(ordered)
}
