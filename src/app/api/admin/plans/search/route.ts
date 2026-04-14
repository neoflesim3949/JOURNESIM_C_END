import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { SIM_TYPES } from '@/lib/bc-enums'

const FIELDS = 'sku_id, name, type, plan_type, high_flow_size, rechargeable_product'

export async function GET(request: Request) {
  
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const type = searchParams.get('type') || 'esim'

  if (q.length < 2) return NextResponse.json([])

  const supabase = createAdminClient()
  type Row = { sku_id: string; name: string; type: string | null; plan_type: string | null; high_flow_size: string | null; rechargeable_product: string | null }
  const map = new Map<string, Row>()

  if (type === 'sim') {
    const { data: byName } = await supabase.from('bc_products')
      .select(FIELDS).ilike('name', `%${q}%`).in('type', SIM_TYPES).limit(500)
    for (const p of (byName || []) as Row[]) map.set(p.sku_id, p)

    const { data: bySku } = await supabase.from('bc_products')
      .select(FIELDS).ilike('sku_id', `%${q}%`).in('type', SIM_TYPES).limit(500)
    for (const p of (bySku || []) as Row[]) map.set(p.sku_id, p)

    if (/^[A-Za-z]{2,3}$/.test(q)) {
      const code = q.toUpperCase()
      const { data: allBc } = await supabase.from('bc_products')
        .select(`${FIELDS}, country_data`).in('type', SIM_TYPES)
      for (const p of (allBc || []) as (Row & { country_data: { mcc: string }[] | null })[]) {
        if (p.country_data?.some((c) => c.mcc.toUpperCase() === code)) {
          map.set(p.sku_id, { sku_id: p.sku_id, name: p.name, type: p.type, plan_type: p.plan_type, high_flow_size: p.high_flow_size, rechargeable_product: p.rechargeable_product })
        }
      }
    }
  } else {
    // eSIM / 通用：不限制商品類型，搜尋所有 BC 商品
    const { data: byName } = await supabase.from('bc_products')
      .select(FIELDS).ilike('name', `%${q}%`).limit(500)
    for (const p of (byName || []) as Row[]) map.set(p.sku_id, p)

    const { data: bySku } = await supabase.from('bc_products')
      .select(FIELDS).ilike('sku_id', `%${q}%`).limit(500)
    for (const p of (bySku || []) as Row[]) map.set(p.sku_id, p)

    if (/^[A-Za-z]{2,3}$/.test(q)) {
      const code = q.toUpperCase()
      const { data: allBc } = await supabase.from('bc_products')
        .select(`${FIELDS}, country_data`)
      for (const p of (allBc || []) as (Row & { country_data: { mcc: string }[] | null })[]) {
        if (p.country_data?.some((c) => c.mcc.toUpperCase() === code)) {
          map.set(p.sku_id, { sku_id: p.sku_id, name: p.name, type: p.type, plan_type: p.plan_type, high_flow_size: p.high_flow_size, rechargeable_product: p.rechargeable_product })
        }
      }
    }
  }

  // 排除加速包
  const results = Array.from(map.values()).filter((p) => {
    const n = p.name.toLowerCase()
    return !n.includes('加速') && !n.includes('accel') && !n.includes('boost')
  })

  return NextResponse.json(results)
}
