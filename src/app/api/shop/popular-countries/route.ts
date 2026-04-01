import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  let settings = new Map<string, string>()
  try {
    settings = await getSettings()
  } catch {}

  // 從 system_settings 讀取熱門國家 MCC 列表（逗號分隔，有序）
  const popularMccs = (settings.get('popular_countries') || '').split(',').map((s) => s.trim()).filter(Boolean)

  if (popularMccs.length === 0) {
    return NextResponse.json([])
  }

  const supabase = createAdminClient()
  const { data: countries } = await supabase
    .from('bc_countries')
    .select('mcc, name, flag_url')
    .in('mcc', popularMccs)

  // 按後台設定的順序排列
  const countryMap = new Map((countries || []).map((c) => [c.mcc, c]))
  const ordered = popularMccs
    .map((mcc) => countryMap.get(mcc))
    .filter(Boolean)

  return NextResponse.json(ordered)
}
