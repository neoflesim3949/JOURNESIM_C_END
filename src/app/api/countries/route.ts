import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLowestPricesByMcc } from '@/lib/pricing'

export async function GET() {
  const supabase = createAdminClient()

  // 1. 取得本地標籤的國家清單 (只抓取必要欄位)
  const { data: countriesRaw } = await supabase
    .from('bc_countries')
    .select('mcc, name, name_zh, continent, continent_zh, flag_url')
    .or('scope.eq.local,scope.is.null')
    .order('name')

  if (!countriesRaw || countriesRaw.length === 0) return NextResponse.json([])

  // 2. 使用共享工具計算起價
  const countryMccs = countriesRaw.map(c => c.mcc)
  const lowestByMcc = await getLowestPricesByMcc(supabase, countryMccs)

  // 3. 組裝結果
  const result = countriesRaw.map((c) => ({
    mcc: c.mcc,
    name: c.name_zh || c.name,
    continent: c.continent_zh || c.continent,
    flag_url: c.flag_url,
    lowest_price: lowestByMcc.get(c.mcc) || null,
  }))

  return NextResponse.json(result)
}

