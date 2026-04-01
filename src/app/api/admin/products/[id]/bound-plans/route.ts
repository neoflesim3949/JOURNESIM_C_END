import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()

  const { data: product } = await supabase.from('products').select('*').eq('id', id).single()
  if (!product) return NextResponse.json({ error: '方案不存在' }, { status: 404 })

  // 取得綁定
  const { data: bindings } = await supabase
    .from('product_plans')
    .select('*')
    .eq('product_id', id)
    .order('created_at')

  if (!bindings || bindings.length === 0) {
    return NextResponse.json({ product, plans: [] })
  }

  // BC 商品資訊
  const skuIds = bindings.map((b) => b.bc_sku_id)
  const { data: bcProducts } = await supabase
    .from('bc_products')
    .select('sku_id, name, type, days, capacity, high_flow_size, limit_flow_speed, plan_type')
    .in('sku_id', skuIds)

  const bcMap = new Map((bcProducts || []).map((p) => [p.sku_id, p]))

  // 每個套餐的 copies 售價
  const planIds = bindings.map((b) => b.id)
  const { data: allPrices } = await supabase
    .from('product_plan_prices')
    .select('*')
    .in('product_plan_id', planIds)
    .order('copies')

  const priceMap = new Map<string, typeof allPrices>()
  for (const p of allPrices || []) {
    if (!priceMap.has(p.product_plan_id)) priceMap.set(p.product_plan_id, [])
    priceMap.get(p.product_plan_id)!.push(p)
  }

  const plans = bindings.map((b) => {
    const bc = bcMap.get(b.bc_sku_id)
    return {
      id: b.id,
      bc_sku_id: b.bc_sku_id,
      bc_name: bc?.name || '',
      bc_type: bc?.type || '',
      plan_category: b.plan_category,
      days: bc?.days || null,
      capacity: bc?.capacity || null,
      high_flow_size: bc?.high_flow_size || null,
      limit_flow_speed: bc?.limit_flow_speed || null,
      plan_type: bc?.plan_type || null,
      is_active: b.is_active,
      copy_prices: (priceMap.get(b.id) || []).map((p) => ({
        id: p.id,
        copies: p.copies,
        cost_price: p.cost_price,
        sell_price: p.sell_price,
      })),
    }
  })

  return NextResponse.json({ product, plans })
}

// PATCH — 批量更新 copies 售價
export async function PATCH(
  request: Request,
) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { updates } = await request.json() as {
    updates: { id: string; sell_price: number }[]
  }

  const supabase = createAdminClient()

  // 分批更新
  for (const u of updates) {
    await supabase
      .from('product_plan_prices')
      .update({ sell_price: u.sell_price })
      .eq('id', u.id)
  }

  return NextResponse.json({ ok: true, updated: updates.length })
}

// DELETE — 移除綁定的套餐（連同 copies 售價一起刪除）
export async function DELETE(
  request: Request,
) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan_id } = await request.json()
  const supabase = createAdminClient()

  // product_plan_prices 有 ON DELETE CASCADE，刪 product_plans 會自動刪 prices
  const { error } = await supabase
    .from('product_plans')
    .delete()
    .eq('id', plan_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
