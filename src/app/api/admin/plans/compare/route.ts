import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

const FIELDS = 'sku_id, name, type, plan_type, days, capacity, high_flow_size, limit_flow_speed, prices'
const ACTIVE = 'is_active.is.null,is_active.eq.true' // 只比較上架中

// GET ?q=關鍵字 → 搜尋（名稱/SKU）；?skus=a,b,c → 取指定 SKU（還原已選清單）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  const skusParam = (searchParams.get('skus') || '').split(',').map(s => s.trim()).filter(Boolean)
  const supabase = createAdminClient()

  if (skusParam.length > 0) {
    const { data } = await supabase.from('bc_products').select(FIELDS).in('sku_id', skusParam)
    // 依傳入順序排序
    const order = new Map(skusParam.map((s, i) => [s, i]))
    const rows = (data || []).sort((a, b) => (order.get(a.sku_id) ?? 0) - (order.get(b.sku_id) ?? 0))
    return NextResponse.json({ items: rows })
  }

  if (q.length < 2) return NextResponse.json({ items: [] })
  const { data } = await supabase.from('bc_products')
    .select(FIELDS).or(ACTIVE)
    .or(`name.ilike.%${q}%,sku_id.ilike.%${q}%`)
    .order('name').limit(50)
  return NextResponse.json({ items: data || [] })
}
