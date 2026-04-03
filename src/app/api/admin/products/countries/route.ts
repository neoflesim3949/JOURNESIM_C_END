import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdminAuth, getUnauthorizedResponse } from '@/lib/admin'

export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') || 'local'
  const supabase = createAdminClient()

  const { data: countries } = await supabase
    .from('bc_countries')
    .select('mcc, name, name_zh, continent, continent_zh, flag_url, icon_url, scope')
    .eq('scope', scope)
    .order('name')

  // 套餐數量：直接從 country_packages 統計
  const { data: links } = await supabase.from('country_packages').select('mcc')
  const countMap = new Map<string, number>()
  for (const l of links || []) countMap.set(l.mcc, (countMap.get(l.mcc) || 0) + 1)

  return NextResponse.json((countries || []).map((c) => ({
    mcc: c.mcc,
    name: c.name_zh || c.name,
    continent: c.continent_zh || c.continent,
    flag_url: c.flag_url,
    icon_url: c.icon_url,
    scope: c.scope,
    product_count: countMap.get(c.mcc) || 0,
  })))
}
