import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccelerationProducts } from '@/lib/billionconnect'

// 同步 F056 加速包報價（acceleratePrice）→ accel_prices。F056 一次回全部，成本重算再以「名稱」對應到基礎方案。
export async function POST() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  let list
  try {
    list = await getAccelerationProducts()
  } catch (e) {
    return NextResponse.json({ error: `F056 呼叫失敗：${e instanceof Error ? e.message : String(e)}` }, { status: 502 })
  }
  const arr = Array.isArray(list) ? list : []
  const seen = new Map<string, { sku_id: string; name: string; accelerate_price: number; high_flow_size: string | null }>()
  let priced = 0
  for (const a of arr) {
    const price = a.acceleratePrice == null || a.acceleratePrice === '' ? null : Number(a.acceleratePrice)
    if (price == null || isNaN(price)) continue
    priced++
    seen.set(String(a.skuId), { sku_id: String(a.skuId), name: (a.name || '').trim(), accelerate_price: price, high_flow_size: a.highFlowSize != null ? String(a.highFlowSize) : null })
  }
  const rows = [...seen.values()].map(r => ({ ...r, updated_at: new Date().toISOString() }))
  let upserted = 0
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('accel_prices').upsert(rows.slice(i, i + 500), { onConflict: 'sku_id' })
    if (error) return NextResponse.json({ error: error.message, upserted }, { status: 500 })
    upserted += Math.min(500, rows.length - i)
  }
  return NextResponse.json({ ok: true, total: arr.length, priced, upserted })
}

// 目前已同步的加速包報價筆數
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  const { count } = await supabase.from('accel_prices').select('sku_id', { count: 'exact', head: true })
  return NextResponse.json({ count: count || 0 })
}
