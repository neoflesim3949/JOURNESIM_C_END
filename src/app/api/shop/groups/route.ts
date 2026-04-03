import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLowestPricesByMcc } from '@/lib/pricing'

// 取得區域/全球方案列表（含起價）
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') || 'regional' // regional | global

  const supabase = createAdminClient()

  // 1. 取得該 scope 的群組 (從 bc_countries 撈取)
  const { data: countries } = await supabase
    .from('bc_countries')
    .select('id, mcc, name, name_zh, scope, continent, continent_zh, icon_url')
    .eq('scope', scope)

  if (!countries || countries.length === 0) return NextResponse.json([])

  // 2. 使用共享工具計算起價
  const countryMccs = countries.map(c => c.mcc)
  const lowestByMcc = await getLowestPricesByMcc(supabase, countryMccs)

  // 3. 組裝結果
  const result = countries.map((c) => {
    const cont = (c.continent_zh || c.continent || '').trim()
    return {
      name: c.name_zh || c.name,
      continent: cont || (scope === 'global' ? '全球' : '未歸類'),
      icon_url: c.icon_url,
      country_code: c.mcc,
      lowest_price: lowestByMcc.get(c.mcc) || null,
    }
  })

  return NextResponse.json(result)
}

