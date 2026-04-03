import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdminAuth, getUnauthorizedResponse } from '@/lib/admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mcc: string }> }
) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const { mcc } = await params
  const supabase = createAdminClient()

  const { data: country } = await supabase
    .from('bc_countries')
    .select('mcc, name, name_zh, continent, continent_zh, flag_url, icon_url, scope')
    .eq('mcc', mcc)
    .single()

  // 套餐數量
  const { data: links } = await supabase.from('country_packages').select('package_id').eq('mcc', mcc)
  const pkgCount = (links || []).length

  const countryZh = country ? {
    mcc: country.mcc,
    name: country.name_zh || country.name,
    continent: country.continent_zh || country.continent,
    flag_url: country.flag_url,
    icon_url: country.icon_url,
    scope: country.scope,
    package_count: pkgCount,
  } : null

  return NextResponse.json({ country: countryZh })
}
