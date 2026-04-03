import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 取得單個地區（本地/區域/全球）的顯示資訊
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mcc = searchParams.get('mcc')

  if (!mcc) return NextResponse.json({ error: '缺少 mcc' }, { status: 400 })

  const supabase = createAdminClient()

  // 從 bc_countries 撈取對應的資訊
  const { data: country } = await supabase
    .from('bc_countries')
    .select('mcc, name, name_zh, continent, continent_zh, flag_url, icon_url, scope')
    .eq('mcc', mcc)
    .single()

  if (!country) {
    return NextResponse.json({ error: '找不到該地區' }, { status: 404 })
  }

  return NextResponse.json({
    mcc: country.mcc,
    name: country.name_zh || country.name,
    continent: country.continent_zh || country.continent,
    flag_url: country.flag_url,
    icon_url: country.icon_url,
    scope: country.scope || 'local',
    is_group: country.scope !== 'local' && !!country.scope,
  })
}
