import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET ?sku_id= → 該 SKU 的價格歷史（每次同步偵測到變動記一筆，新到舊）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const skuId = new URL(request.url).searchParams.get('sku_id') || ''
  if (!skuId) return NextResponse.json({ rows: [] })
  const supabase = createAdminClient()
  const { data } = await supabase.from('bc_price_history')
    .select('id, synced_at, prices, cost_price, prev_cost_price')
    .eq('sku_id', skuId).order('synced_at', { ascending: false }).limit(200)
  return NextResponse.json({ rows: data || [] })
}
