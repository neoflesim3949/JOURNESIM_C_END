import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { ESIM_TYPES, SIM_TYPES } from '@/lib/bc-enums'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  if (cookieStore.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const type = searchParams.get('type') || 'esim'

  if (q.length < 2) return NextResponse.json([])

  const supabase = createAdminClient()
  const map = new Map<string, { sku_id: string; name: string; type: string | null; plan_type: string | null; high_flow_size: string | null }>()

  // 根據類型決定過濾方式
  if (type === 'sim') {
    // SIM：type IN SIM_TYPES
    const { data: byName } = await supabase.from('bc_products')
      .select('sku_id, name, type, plan_type, high_flow_size')
      .ilike('name', `%${q}%`).in('type', SIM_TYPES).limit(500)
    for (const p of byName || []) map.set(p.sku_id, p)

    const { data: bySku } = await supabase.from('bc_products')
      .select('sku_id, name, type, plan_type, high_flow_size')
      .ilike('sku_id', `%${q}%`).in('type', SIM_TYPES).limit(500)
    for (const p of bySku || []) map.set(p.sku_id, p)

    if (/^[A-Za-z]{2,3}$/.test(q)) {
      const code = q.toUpperCase()
      const { data: allBc } = await supabase.from('bc_products')
        .select('sku_id, name, type, plan_type, high_flow_size, country_data')
        .in('type', SIM_TYPES)
      for (const p of allBc || []) {
        const countries = p.country_data as { mcc: string }[] | null
        if (countries?.some((c) => c.mcc.toUpperCase() === code)) {
          map.set(p.sku_id, { sku_id: p.sku_id, name: p.name, type: p.type, plan_type: p.plan_type, high_flow_size: p.high_flow_size })
        }
      }
    }
  } else {
    // eSIM：type IN ESIM_TYPES 或 rechargeable_product='1'
    const { data: byName } = await supabase.from('bc_products')
      .select('sku_id, name, type, plan_type, high_flow_size')
      .ilike('name', `%${q}%`)
      .or(`type.in.(${ESIM_TYPES.join(',')}),rechargeable_product.eq.1`)
      .limit(500)
    for (const p of byName || []) map.set(p.sku_id, p)

    const { data: bySku } = await supabase.from('bc_products')
      .select('sku_id, name, type, plan_type, high_flow_size')
      .ilike('sku_id', `%${q}%`)
      .or(`type.in.(${ESIM_TYPES.join(',')}),rechargeable_product.eq.1`)
      .limit(500)
    for (const p of bySku || []) map.set(p.sku_id, p)

    if (/^[A-Za-z]{2,3}$/.test(q)) {
      const code = q.toUpperCase()
      const { data: allBc } = await supabase.from('bc_products')
        .select('sku_id, name, type, plan_type, high_flow_size, country_data')
        .or(`type.in.(${ESIM_TYPES.join(',')}),rechargeable_product.eq.1`)
      for (const p of allBc || []) {
        const countries = p.country_data as { mcc: string }[] | null
        if (countries?.some((c) => c.mcc.toUpperCase() === code)) {
          map.set(p.sku_id, { sku_id: p.sku_id, name: p.name, type: p.type, plan_type: p.plan_type, high_flow_size: p.high_flow_size })
        }
      }
    }
  }

  // 排除加速包（名稱含「加速」「acceleration」「boost」）
  const results = Array.from(map.values()).filter((p) => {
    const n = p.name.toLowerCase()
    return !n.includes('加速') && !n.includes('accel') && !n.includes('boost')
  })

  return NextResponse.json(results)
}
