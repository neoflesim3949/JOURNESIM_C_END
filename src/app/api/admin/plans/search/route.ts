import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

const ESIM_TYPES = ['110', '111', '3105', '3106']
const SIM_TYPES = ['110', '111', '210', '211', '212', '220', '221', '311', '3101', '3102', '3103', '3104', '3201', '3202', '3211', '3212']

export async function GET(request: Request) {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const type = searchParams.get('type') || 'esim'

  if (q.length < 2) return NextResponse.json([])

  const allowedTypes = type === 'sim' ? SIM_TYPES : ESIM_TYPES
  const supabase = createAdminClient()

  const map = new Map<string, { sku_id: string; name: string; type: string; plan_type: string | null; high_flow_size: string | null }>()

  // 1. 搜商品名稱
  const { data: byName } = await supabase
    .from('bc_products')
    .select('sku_id, name, type, plan_type, high_flow_size')
    .ilike('name', `%${q}%`)
    .in('type', allowedTypes)
    .limit(50)

  for (const p of byName || []) map.set(p.sku_id, p)

  // 2. 搜 SKU ID
  const { data: bySku } = await supabase
    .from('bc_products')
    .select('sku_id, name, type, plan_type, high_flow_size')
    .ilike('sku_id', `%${q}%`)
    .in('type', allowedTypes)
    .limit(50)

  for (const p of bySku || []) map.set(p.sku_id, p)

  // 3. 如果輸入像是 MCC（2-3 個大寫字母），先查國家名稱再用名稱搜商品
  if (/^[A-Za-z]{2,3}$/.test(q)) {
    const { data: countries } = await supabase
      .from('bc_countries')
      .select('name')
      .ilike('mcc', q)

    if (countries && countries.length > 0) {
      for (const country of countries) {
        const { data: byCountry } = await supabase
          .from('bc_products')
          .select('sku_id, name, type, plan_type, high_flow_size')
          .ilike('name', `%${country.name}%`)
          .in('type', allowedTypes)
          .limit(50)

        for (const p of byCountry || []) map.set(p.sku_id, p)
      }
    }
  }

  // 排除加速包（名稱含「加速」「acceleration」「boost」）
  const results = Array.from(map.values()).filter((p) => {
    const n = p.name.toLowerCase()
    return !n.includes('加速') && !n.includes('accel') && !n.includes('boost')
  })

  return NextResponse.json(results.slice(0, 50))
}
